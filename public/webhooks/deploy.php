<?php
/**
 * GitHub push webhook → runs a fixed deploy script (Option 1, pull-based).
 *
 * Path in repo: public/webhooks/deploy.php → served as /webhooks/deploy.php
 * (configure PHP execution on your host; do not serve this as raw source.)
 *
 * Config file (secrets, not in git):
 *   - Recommended: place it in the SAME directory as this script:
 *       webhooks/webhook-secrets.local.php
 *     and ensure your rsync deploy excludes it so --delete doesn't remove it.
 *   - Alternative: set Apache/PHP-FPM env:
 *       DEPLOY_WEBHOOK_CONFIG=/absolute/path/to/webhook-secrets.local.php
 *
 * repo_root is configured inside webhook-secrets.local.php (absolute checkout path).
 * deploy.php runs scripts/build-deploy.sh there and passes REPO_DIR to the shell.
 *
 * Deploy:
 *   1. Copy webhook-secrets.example.php → webhooks/webhook-secrets.local.php on the server.
 *   2. chmod 640 webhooks/webhook-secrets.local.php && chown root:www-data (or owner + PHP-FPM group).
 *   3. chmod +x scripts/build-deploy.sh; set DEPLOY_TARGET in deploy_env (see example).
 *   4. Ensure PHP may execute the deploy script, or use sudoers (see below).
 * 5. GitHub: Webhook → JSON, secret = same as in webhook-secrets.local.php, push only.
 *
 * Long builds: this request does NOT wait for the build. It starts
 * scripts/deploy-detached.sh (which runs the deploy script) in a systemd user unit,
 * or with setsid when there is no user manager, and returns 202 at once. May
 * First's front proxy returns 504 after about 5 minutes, and dependency-bump
 * deploys take longer than that. The build reports its own result to the
 * Healthchecks deploy check (DEPLOY_HEALTHCHECK_PING_URL, see build-deploy.sh) and
 * its output is appended to the deploy log, so a failed build no longer shows in
 * the GitHub run: look at the Healthchecks check, or the log on the server.
 *
 * Overlapping deliveries: builds are serialized by flock(2) on repo root
 * .build-deploy.lock, held by scripts/build-deploy.sh. A push that lands mid-build
 * does NOT fail — the script records .build-deploy.pending and exits 0, and the
 * running build re-syncs to the tip of the branch and builds it before exiting.
 * This file probes that same lock before its git pre-sync, so the pre-sync can never
 * hard-reset the working tree out from under a build that is already running.
 * Worst case a single delivery runs up to MAX_BUILD_ITERATIONS builds back to back,
 * so the Healthchecks check's grace time should cover that.
 *
 * Hardening notes:
 *   - Secret never appears in this file; use webhook-secrets.local.php (not in git).
 *   - Signature verified with hash_equals before parsing JSON.
 *   - Deploy output is never sent to the client (the response surfaces in public GitHub logs).
 *   - Secrets in deploy_env reach the build through the environment, never argv.
 *   - Each run is appended to repo root .deploy-webhook.log by default (override or disable in config).
 *   - Failed auth (403) may append to repo root .deploy-webhook-auth.log and include/logs/deploy-webhook.error.log.
 *   - Deploy script defaults to repo scripts/build-deploy.sh; must stay under repo root.
 *   - If www-data cannot run your deploy (git/pnpm in $HOME), either:
 *       a) Run this pool as your deploy user (PHP-FPM user = you), or
 *       b) sudoers: www-data ALL=(deployuser) NOPASSWD: /bin/bash /full/path/to/repo/scripts/build-deploy.sh
 *          and set 'deploy_command_prefix' => ['sudo', '-n', '-u', 'deployuser'] in webhook-secrets.local.php
 *     (Adjust to your policy; prefix is fixed in config, no user input.)
 */

declare(strict_types=1);

header('Content-Type: text/plain; charset=UTF-8');

function jsonOut(int $status, array $data): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=UTF-8');
  echo json_encode($data, JSON_UNESCAPED_SLASHES) ?: '{}';
  exit;
}

function rotateAndAppendLog(string $path, string $line, int $maxBytes = 1000000, int $keepBytes = 200000): void {
  // Best-effort logging; never throw.
  try {
    $dir = dirname($path);
    if ($dir !== '' && !is_dir($dir)) return;

    $size = @filesize($path);
    if (is_int($size) && $size > $maxBytes) {
      $fh = @fopen($path, 'rb');
      if (is_resource($fh)) {
        @fseek($fh, -1 * $keepBytes, SEEK_END);
        $tail = @stream_get_contents($fh);
        @fclose($fh);
        if (is_string($tail) && $tail !== '') {
          @file_put_contents($path, "---- truncated ----\n" . $tail, LOCK_EX);
        }
      }
    }

    @file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
  } catch (\Throwable $e) {
    // ignore
  }
}

function resolveEarlyLogPath(): ?string {
  $candidates = [];

  $home = getenv('HOME');
  if (is_string($home) && $home !== '') {
    $candidates[] = rtrim($home, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'include' . DIRECTORY_SEPARATOR . 'logs';
  }

  // Fallback when HOME is unavailable: /.../web/webhooks -> /.../include/logs
  $baseFromWeb = dirname(__DIR__, 3);
  if (is_string($baseFromWeb) && $baseFromWeb !== '' && $baseFromWeb !== DIRECTORY_SEPARATOR) {
    $candidates[] = rtrim($baseFromWeb, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'include' . DIRECTORY_SEPARATOR . 'logs';
  }

  foreach ($candidates as $dir) {
    if (is_dir($dir) || @mkdir($dir, 0750, true)) {
      return $dir . DIRECTORY_SEPARATOR . 'deploy-webhook.error.log';
    }
  }

  return null;
}

function earlyLog(string $event, array $meta = []): void {
  $path = resolveEarlyLogPath();
  if ($path === null) return;

  $base = [
    'ts' => gmdate('c'),
    'event' => $event,
    'delivery' => $_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? '',
  ];
  $record = array_merge($base, $meta);
  rotateAndAppendLog($path, (json_encode($record, JSON_UNESCAPED_SLASHES) ?: '{}') . "\n");
}

/** Best-effort: repo root .deploy-webhook-auth.log for 403s (writable by PHP; gitignored). */
function appendRepoAuthLog(?string $repoRootConfigured, string $event, array $meta): void {
  if (!is_string($repoRootConfigured) || $repoRootConfigured === '') {
    return;
  }
  $rp = realpath($repoRootConfigured);
  if ($rp === false || !is_dir($rp)) {
    return;
  }
  $path = $rp . DIRECTORY_SEPARATOR . '.deploy-webhook-auth.log';
  $base = [
    'ts' => gmdate('c'),
    'event' => $event,
    'delivery' => $_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? '',
  ];
  $line =(json_encode(array_merge($base, $meta), JSON_UNESCAPED_SLASHES) ?: '{}') . "\n";
  @file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
}

function failConfig(string $event, array $meta = []): void {
  error_log('deploy-webhook: ' . $event);
  earlyLog($event, $meta);
  http_response_code(500);
  exit('Configuration error');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  exit('Method Not Allowed');
}

$maxBytes = 256 * 1024;
$cl = $_SERVER['CONTENT_LENGTH'] ?? '';
if ($cl !== '' && ctype_digit((string) $cl) && (int) $cl > $maxBytes) {
  http_response_code(413);
  exit('Payload Too Large');
}

$payload = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
if ($payload === false || strlen($payload) > $maxBytes) {
  http_response_code(413);
  exit('Payload Too Large');
}

// Config should NOT be part of the static build output. Keep it as a server-managed file and
// protect it from rsync --delete (either by excluding it in rsync, or by storing it outside web/).
//
// Search order:
//   1) Same directory as this script (recommended if you also protect it from rsync deletion)
//   2) Apache/FPM env DEPLOY_WEBHOOK_CONFIG=/abs/path/to/config
//   3) Parent of webhooks/ (dev repo root or exported site root)
$configPath = '';
$sameDir = __DIR__ . DIRECTORY_SEPARATOR . 'webhook-secrets.local.php';
if (is_readable($sameDir)) {
  $configPath = $sameDir;
}
$fromEnv = getenv('DEPLOY_WEBHOOK_CONFIG');
if ($configPath === '' && is_string($fromEnv) && $fromEnv !== '' && is_readable($fromEnv)) {
  $configPath = $fromEnv;
}
if ($configPath === '') {
  $aboveWebhooks = dirname(__DIR__, 2);
  $candidates = [
    $aboveWebhooks . DIRECTORY_SEPARATOR . 'webhook-secrets.local.php',
  ];
  foreach ($candidates as $candidate) {
    if (is_readable($candidate)) {
      $configPath = $candidate;
      break;
    }
  }
}
if ($configPath === '') {
  failConfig('config_missing', [
    'tried_same_dir' => __DIR__ . DIRECTORY_SEPARATOR . 'webhook-secrets.local.php',
    'env_DEPLOY_WEBHOOK_CONFIG_set' => is_string(getenv('DEPLOY_WEBHOOK_CONFIG')) && getenv('DEPLOY_WEBHOOK_CONFIG') !== '' ? 'yes' : 'no',
    'also_tried' => dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'webhook-secrets.local.php',
  ]);
}

/** @var array{secret:string,repo_root:string,allowed_ref?:string,allowed_repository?:string,deploy_script?:string,script_parent_dir?:string,deploy_command_prefix?:list<string>,deploy_env?:array<string,string>,log_file?:string|false} $config */
$config = require $configPath;

$secret = $config['secret'] ?? '';
if ($secret === '' || strlen($secret) < 16) {
  failConfig('invalid_secret', [
    'configPath' => $configPath,
    'secret_len' => is_string($secret) ? strlen($secret) : 'not_string',
  ]);
}

$timestampHeader = $_SERVER['HTTP_X_DEPLOY_TIMESTAMP'] ?? '';
$timestamp = is_string($timestampHeader) ? (int) $timestampHeader : 0;
$timestampWindowSec = (int) ($config['timestamp_window_sec'] ?? 300);
if ($timestampWindowSec <= 0) $timestampWindowSec = 300;
$now = time();
if ($timestamp <= 0) {
  http_response_code(400);
  exit('Missing X-Deploy-Timestamp');
}
if (abs($now - $timestamp) > $timestampWindowSec) {
  http_response_code(401);
  exit('Timestamp outside allowed window');
}

$sigHeader = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
// Timestamp is included in the signed bytes to prevent delayed replays.
$signed = $timestamp . "\n" . $payload;
$expected = 'sha256=' . hash_hmac('sha256', $signed, $secret);
if (!is_string($sigHeader) || !hash_equals($expected, $sigHeader)) {
  // Safe debug: never print secrets; avoid printing full signatures.
  $sigMeta = [
    'received_sig_prefix' => is_string($sigHeader) ? substr($sigHeader, 0, 16) : null,
    'expected_sig_prefix' => substr($expected, 0, 16),
    'payload_len' => strlen($payload),
    'payload_sha256' => hash('sha256', $payload),
    'timestamp' => $timestamp,
    'now' => $now,
  ];
  earlyLog('signature_mismatch', $sigMeta);
  appendRepoAuthLog($config['repo_root'] ?? null, 'signature_mismatch', $sigMeta);
  error_log('deploy-webhook: signature_mismatch (check DEPLOY_SECRET matches server secret; see deploy-webhook.error.log if configured)');
  http_response_code(403);
  exit('Forbidden');
}

$data = json_decode($payload, true);
if (!is_array($data)) {
  http_response_code(400);
  exit('Invalid JSON');
}

$allowedRef = $config['allowed_ref'] ?? 'refs/heads/main';
if (($data['ref'] ?? '') !== $allowedRef) {
  http_response_code(200);
  exit('Ignored (ref)');
}

if (!empty($config['allowed_repository'])) {
  $full = $data['repository']['full_name'] ?? '';
  if ($full !== $config['allowed_repository']) {
    $repoMeta = [
      'received_repository' => is_string($full) ? $full : null,
      'allowed_repository' => $config['allowed_repository'],
    ];
    earlyLog('repository_forbidden', $repoMeta);
    appendRepoAuthLog($config['repo_root'] ?? null, 'repository_forbidden', $repoMeta);
    error_log('deploy-webhook: repository_forbidden (payload repository.full_name must match allowed_repository in webhook config)');
    http_response_code(403);
    exit('Forbidden');
  }
}

$repoRootConfigured = $config['repo_root'] ?? '';
if (!is_string($repoRootConfigured) || $repoRootConfigured === '') {
  failConfig('repo_root_missing', [
    'configPath' => $configPath,
    'repo_root' => is_string($repoRootConfigured) ? $repoRootConfigured : 'not_string',
  ]);
}
$repoRoot = realpath($repoRootConfigured);
if ($repoRoot === false) {
  failConfig('repo_root_unreadable', [
    'configPath' => $configPath,
    'repo_root' => $repoRootConfigured,
  ]);
}

$ref = (string) ($data['ref'] ?? '');
$branch = '';
if (strpos($ref, 'refs/heads/') === 0) {
  $branch = substr($ref, strlen('refs/heads/'));
}
if ($branch === '') {
  $branch = 'main';
}

// Build environment once so both git pre-pull and deploy script run consistently.
$deployEnv = $config['deploy_env'] ?? [];
if (!is_array($deployEnv)) {
  failConfig('deploy_env_invalid', [
    'configPath' => $configPath,
  ]);
}
foreach ($deployEnv as $k => $v) {
  if (!is_string($k) || !is_string($v)) {
    failConfig('deploy_env_invalid_entry', [
      'configPath' => $configPath,
    ]);
  }
}

// REPO_DIR and GIT_BRANCH are forced from validated webhook/config values.
$basePath = getenv('PATH');
if (!is_string($basePath) || $basePath === '') {
  $basePath = '/usr/local/bin:/usr/bin:/bin';
}

// Prefer PATH from deploy_env if provided; otherwise inherit the PHP process PATH.
$effectivePath = $basePath;
if (isset($deployEnv['PATH']) && is_string($deployEnv['PATH']) && $deployEnv['PATH'] !== '') {
  $effectivePath = $deployEnv['PATH'];
  unset($deployEnv['PATH']);
}

$delivery = $_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? '';
if (!is_string($delivery)) {
  $delivery = '';
}

// The deploy script re-syncs git itself on every build iteration, so it needs the
// same update mode this file uses for its pre-sync.
$gitUpdateMode = (string) ($config['git_update_mode'] ?? 'hard-reset');
if ($gitUpdateMode !== 'hard-reset' && $gitUpdateMode !== 'ff-only') {
  failConfig('git_update_mode_invalid', [
    'configPath' => $configPath,
    'git_update_mode' => $gitUpdateMode,
  ]);
}

$env = array_merge($_ENV, [
  'PATH' => $effectivePath,
  'HOME' => getenv('HOME') ?: '',
  'GITHUB_DELIVERY' => $delivery,
], $deployEnv, [
  'REPO_DIR' => $repoRoot,
  'GIT_BRANCH' => $branch,
  'GIT_UPDATE_MODE' => $gitUpdateMode,
]);

// Concurrency gate for the git pre-sync below. scripts/build-deploy.sh serializes
// builds with flock(2) on this file; probe the same lock here so the pre-sync can
// never hard-reset the working tree out from under a build that is already running.
//
// Coalescing overlapping deliveries is deliberately NOT handled here. The deploy
// script does it, running as the deploy user — the only account guaranteed to be able
// to write in the repo root (PHP-FPM often runs as www-data). A delivery that lands
// mid-build just skips the pre-sync; the script then records a pending rebuild and
// exits 0, and the running build reports to Healthchecks for both.
$lockPath = $repoRoot . DIRECTORY_SEPARATOR . '.build-deploy.lock';
$lockFh = null;
// A missing lock file means build-deploy.sh has never run (it creates the file and
// leaves it in place), so nothing can be in flight. Do not create it from here: if
// PHP runs as a different user, a lock file it owns may be unopenable by the build.
$presyncSafe = !is_file($lockPath);
if (!$presyncSafe) {
  $lockFh = @fopen($lockPath, 'c');
  if (is_resource($lockFh)) {
    $presyncSafe = flock($lockFh, LOCK_EX | LOCK_NB);
    if (!$presyncSafe) {
      fclose($lockFh);
      $lockFh = null;
    }
  }
}

// Pre-sync: ensure the repo (and deploy script) are up to date before resolving script paths.
// Default is hard-reset to origin/<branch> (server is treated as disposable deploy checkout).
$gitPrefix = $config['git_command_prefix'] ?? [];
if (!is_array($gitPrefix) || $gitPrefix !== array_values($gitPrefix)) {
  failConfig('git_command_prefix_invalid', [
    'configPath' => $configPath,
  ]);
}
foreach ($gitPrefix as $part) {
  if (!is_string($part) || $part === '') {
    failConfig('git_command_prefix_invalid_entry', [
      'configPath' => $configPath,
    ]);
  }
}

$runGitPull = ($config['git_pull'] ?? true) !== false;
if ($runGitPull && !$presyncSafe) {
  // Either a build is in flight, or the lock file is not openable from here (PHP-FPM
  // as www-data, builds as the deploy user). Either way we cannot prove it is safe to
  // touch the working tree, so skip the pre-sync. The deploy script re-syncs git on
  // every iteration, so the only cost is that an edit to the script itself lands one
  // push later than it otherwise would.
  earlyLog('git_presync_skipped', ['lock_path' => $lockPath]);
  $runGitPull = false;
}
if ($runGitPull) {
  $gitSteps = [
    array_merge($gitPrefix, ['git', 'fetch', 'origin', '--prune']),
    array_merge($gitPrefix, ['git', 'checkout', $branch]),
  ];
  if ($gitUpdateMode === 'hard-reset') {
    $gitSteps[] = array_merge($gitPrefix, ['git', 'reset', '--hard', "origin/$branch"]);
  } else {
    $gitSteps[] = array_merge($gitPrefix, ['git', 'pull', '--ff-only', 'origin', $branch]);
  }

  foreach ($gitSteps as $cmd) {
    $descriptors = [
      0 => ['pipe', 'r'],
      1 => ['pipe', 'w'],
      2 => ['pipe', 'w'],
    ];
    $p = proc_open($cmd, $descriptors, $pipes, $repoRoot, $env);
    if (!is_resource($p)) {
      failConfig('git_proc_open_failed', [
        'cwd' => $repoRoot,
        'cmd' => $cmd,
      ]);
    }
    fclose($pipes[0]);
    $gOut = stream_get_contents($pipes[1]);
    $gErr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $gCode = proc_close($p);
    if ($gCode !== 0) {
      failConfig('git_step_failed', [
        'cwd' => $repoRoot,
        'cmd' => $cmd,
        'exit' => $gCode,
        'stderr' => is_string($gErr) ? trim($gErr) : '',
        'stdout' => is_string($gOut) ? trim($gOut) : '',
      ]);
    }
  }
}

// Hand the lock over to the deploy script, which takes it itself. Release before
// proc_open so the child cannot inherit the descriptor and deadlock on itself.
// The gap between unlock and the script's flock is benign: a delivery that wins the
// race just becomes the builder, and ours coalesces into it via the pending marker.
if (is_resource($lockFh)) {
  flock($lockFh, LOCK_UN);
  fclose($lockFh);
  $lockFh = null;
}

$defaultDeployScript = $repoRoot . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'build-deploy.sh';
$scriptConfigured = $config['deploy_script'] ?? '';
$script = ($scriptConfigured !== '' && is_string($scriptConfigured))
  ? $scriptConfigured
  : $defaultDeployScript;

$parentConfigured = $config['script_parent_dir'] ?? '';
$parent = ($parentConfigured !== '' && is_string($parentConfigured))
  ? $parentConfigured
  : $repoRoot;

$realScript = realpath($script);
$realParent = realpath($parent);
if ($realScript === false || $realParent === false) {
  failConfig('deploy_script_not_found', [
    'configPath' => $configPath,
    'repoRoot' => $repoRoot,
    'deploy_script_configured' => $scriptConfigured,
    'deploy_script_effective' => $script,
    'script_parent_dir_configured' => $parentConfigured,
    'script_parent_dir_effective' => $parent,
  ]);
}

$parentPrefix = rtrim($realParent, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
if (strpos($realScript, $parentPrefix) !== 0) {
  failConfig('deploy_script_escapes_parent', [
    'deploy_script_realpath' => $realScript,
    'script_parent_realpath' => $realParent,
  ]);
}

if (!is_file($realScript) || !is_executable($realScript)) {
  failConfig('deploy_script_not_executable', [
    'deploy_script_realpath' => $realScript,
    'is_file' => is_file($realScript) ? 'yes' : 'no',
    'is_executable' => is_executable($realScript) ? 'yes' : 'no',
  ]);
}

$prefix = $config['deploy_command_prefix'] ?? [];
if (!is_array($prefix) || $prefix !== array_values($prefix)) {
  error_log('deploy-webhook: deploy_command_prefix must be a list');
  http_response_code(500);
  exit('Configuration error');
}
foreach ($prefix as $part) {
  if (!is_string($part) || $part === '') {
    error_log('deploy-webhook: invalid deploy_command_prefix entry');
    http_response_code(500);
    exit('Configuration error');
  }
}

// Resolve where the run's output is archived (the persistent log). Empty if
// logging is explicitly disabled in config. scripts/deploy-detached.sh appends
// to it once the build ends.
$logRaw = $config['log_file'] ?? null;
$persistentLog = '';
if ($logRaw === false) {
  // Logging explicitly disabled.
} elseif (is_string($logRaw) && $logRaw !== '') {
  $persistentLog = $logRaw;
} elseif ($logRaw === null || $logRaw === '') {
  $persistentLog = $repoRoot . DIRECTORY_SEPARATOR . '.deploy-webhook.log';
} else {
  error_log('deploy-webhook: log_file must be false, a non-empty string, or omitted');
  http_response_code(500);
  exit('Configuration error');
}

// The runner lives beside the default deploy script, in the repo.
$runner = realpath($repoRoot . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'deploy-detached.sh');
if ($runner === false || !is_file($runner)) {
  failConfig('deploy_runner_missing', ['repoRoot' => $repoRoot]);
}

$env['DEPLOY_SCRIPT'] = $realScript;
$env['DEPLOY_WEBHOOK_LOG'] = $persistentLog;
// Only plain variable names reach the child: systemd-run takes them as
// --setenv=NAME, and anything odd in $_ENV is not ours to pass on.
$env = array_filter(
  $env,
  fn($v, $k) => is_string($k) && preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $k) === 1 && is_scalar($v),
  ARRAY_FILTER_USE_BOTH
);
$env = array_map('strval', $env);

$runnerCmd = array_merge($prefix, ['/bin/bash', '--noprofile', '--norc', $runner]);

/**
 * Start $cmd so it outlives this request, and return how, or null on failure.
 *
 * The build used to run inside this request, and May First's front proxy
 * returns 504 after about 5 minutes, so a slow deploy was reported as failed
 * while it went on to publish. Now the request only starts it. See
 * scripts/deploy-detached.sh for why each method is used.
 *
 * Secrets in $env never reach argv (other accounts on the host can read it):
 * systemd-run gets --setenv=NAME, which copies the value from its own
 * environment, and setsid passes the environment through unchanged.
 */
function launchDetached(array $cmd, array &$env, string $cwd): ?string {
  $quiet = [
    0 => ['file', '/dev/null', 'r'],
    1 => ['file', '/dev/null', 'w'],
    2 => ['file', '/dev/null', 'w'],
  ];

  $systemdRun = null;
  foreach (['/usr/bin/systemd-run', '/bin/systemd-run'] as $candidate) {
    if (is_executable($candidate)) {
      $systemdRun = $candidate;
      break;
    }
  }
  $uid = function_exists('posix_geteuid') ? posix_geteuid() : null;
  $runtimeDir = is_int($uid) ? "/run/user/$uid" : '';
  if ($systemdRun !== null && $runtimeDir !== '' && is_dir($runtimeDir)) {
    $unitEnv = $env;
    $unitEnv['DEPLOY_LAUNCHER'] = 'systemd-run';
    $args = [
      $systemdRun, '--user', '--quiet', '--collect',
      '--unit=ac-deploy-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3)),
      '--working-directory=' . $cwd,
    ];
    foreach (array_keys($unitEnv) as $name) {
      $args[] = '--setenv=' . $name;
    }
    $args[] = '--';
    $args = array_merge($args, $cmd);
    // XDG_RUNTIME_DIR tells systemd-run where the user manager listens. It is
    // set on systemd-run only, not handed to the unit.
    $p = proc_open($args, $quiet, $pipes, $cwd, $unitEnv + ['XDG_RUNTIME_DIR' => $runtimeDir]);
    if (is_resource($p) && proc_close($p) === 0) {
      return 'systemd-run';
    }
    // The user manager can be down (after a May First reboot it has stopped
    // even with Linger on). Fall through rather than drop the deploy.
    error_log('deploy-webhook: systemd-run failed; starting the deploy with setsid');
  }

  $env['DEPLOY_LAUNCHER'] = 'setsid';
  $setsid = is_executable('/usr/bin/setsid') ? '/usr/bin/setsid' : null;
  if ($setsid !== null) {
    // -f forks, so setsid returns at once and the deploy runs in a new session.
    $args = array_merge([$setsid, '-f'], $cmd);
  } else {
    // No setsid (macOS dev machines): a plain background job.
    $env['DEPLOY_LAUNCHER'] = 'sh-background';
    $args = array_merge(['/bin/sh', '-c', '"$@" </dev/null >/dev/null 2>&1 &', 'sh'], $cmd);
  }
  $p = proc_open($args, $quiet, $pipes, $cwd, $env);
  if (is_resource($p) && proc_close($p) === 0) {
    return $env['DEPLOY_LAUNCHER'];
  }
  return null;
}

$launcher = launchDetached($runnerCmd, $env, $realParent);
if ($launcher === null) {
  error_log('deploy-webhook: could not start the deploy');
  http_response_code(500);
  exit('Deploy failed to start');
}

// 202: the build is running. scripts/build-deploy.sh reports the result to the
// Healthchecks deploy check, and the output lands in the deploy log.
http_response_code(202);
header('Content-Type: text/plain; charset=UTF-8');
echo "Accepted: deploy started ({$launcher}). The server reports the result to the Healthchecks deploy check.";
