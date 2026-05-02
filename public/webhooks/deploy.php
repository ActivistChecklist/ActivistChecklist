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
 * Long builds: this request blocks until the script exits. Raise nginx/apache
 * proxy_read_timeout (and GitHub will retry on 5xx) or switch to a queue that
 * returns 202 immediately.
 *
 * Hardening notes:
 *   - Secret never appears in this file; use webhook-secrets.local.php (not in git).
 *   - Signature verified with hash_equals before parsing JSON.
 *   - Deploy output is not echoed to the client (reduces information leakage).
 *   - Each run is appended to repo root .deploy-webhook.log by default (override or disable in config).
 *   - Failed auth (403) may append to repo root .deploy-webhook-auth.log and include/logs/deploy-webhook.error.log.
 *   - Deploy script defaults to repo scripts/build-deploy.sh; must stay under repo root.
 *   - If www-data cannot run your deploy (git/yarn in $HOME), either:
 *       a) Run this pool as your deploy user (PHP-FPM user = you), or
 *       b) sudoers: www-data ALL=(deployuser) NOPASSWD: /bin/bash /full/path/to/repo/scripts/build-deploy.sh
 *          and set 'deploy_command_prefix' => ['sudo', '-n', '-u', 'deployuser'] in webhook-secrets.local.php
 *     (Adjust to your policy; prefix is fixed in config, no user input.)
 */

declare(strict_types=1);

header('Content-Type: text/plain; charset=UTF-8');

function getClientIp(): string {
  // Best-effort; on shared hosts this may be behind a proxy.
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  return is_string($ip) ? $ip : '';
}

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
    'ip' => getClientIp(),
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
    'ip' => getClientIp(),
    'delivery' => $_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? '',
  ];
  $line = (json_encode(array_merge($base, $meta), JSON_UNESCAPED_SLASHES) ?: '{}') . "\n";
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

$clientIp = getClientIp();

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

$env = array_merge($_ENV, [
  'PATH' => $effectivePath,
  'HOME' => getenv('HOME') ?: '',
  'GITHUB_DELIVERY' => $_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? '',
], $deployEnv, [
  'REPO_DIR' => $repoRoot,
  'GIT_BRANCH' => $branch,
]);

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
if ($runGitPull) {
  $gitUpdateMode = (string) ($config['git_update_mode'] ?? 'hard-reset');
  if ($gitUpdateMode !== 'hard-reset' && $gitUpdateMode !== 'ff-only') {
    failConfig('git_update_mode_invalid', [
      'configPath' => $configPath,
      'git_update_mode' => $gitUpdateMode,
    ]);
  }

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

$bash = ['/bin/bash', '--noprofile', '--norc', $realScript];
$resolvedCmd = array_merge($prefix, $bash);

$descriptorspec = [
  0 => ['pipe', 'r'],
  1 => ['pipe', 'w'],
  2 => ['pipe', 'w'],
];

$cwd = $realParent;
$process = proc_open($resolvedCmd, $descriptorspec, $pipes, $cwd, $env);
if (!is_resource($process)) {
  error_log('deploy-webhook: proc_open failed');
  http_response_code(500);
  exit('Deploy failed');
}

fclose($pipes[0]);
$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$code = proc_close($process);

$logRaw = $config['log_file'] ?? null;
if ($logRaw === false) {
  $logFile = null;
} elseif (is_string($logRaw) && $logRaw !== '') {
  $logFile = $logRaw;
} elseif ($logRaw === null || $logRaw === '') {
  $logFile = $repoRoot . DIRECTORY_SEPARATOR . '.deploy-webhook.log';
} else {
  error_log('deploy-webhook: log_file must be false, a non-empty string, or omitted');
  http_response_code(500);
  exit('Configuration error');
}

$line = sprintf(
  "[%s] exit=%d delivery=%s\n--- stdout ---\n%s\n--- stderr ---\n%s\n",
  gmdate('c'),
  $code,
  $_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? '',
  is_string($stdout) ? $stdout : '',
  is_string($stderr) ? $stderr : ''
);

// Try the configured log path first, then a known-writable repo-root fallback so we
// never silently lose the deploy output. If user explicitly set log_file => false
// ($logFile === null), respect that and skip logging entirely.
$logFallback = $repoRoot . DIRECTORY_SEPARATOR . '.deploy-webhook.log';
$logged = false;
$loggingDisabled = ($logFile === null);
if (!$loggingDisabled) {
  if (@file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX) === false) {
    error_log('deploy-webhook: could not write log_file (configured); falling back');
    if ($logFile !== $logFallback
        && @file_put_contents($logFallback, $line, FILE_APPEND | LOCK_EX) !== false) {
      $logged = true;
    } else {
      error_log('deploy-webhook: could not write fallback log at repo root either');
    }
  } else {
    $logged = true;
  }
}

if ($code !== 0) {
  error_log('deploy-webhook: deploy script exited ' . $code);
  http_response_code(500);
  header('Content-Type: text/plain; charset=UTF-8');
  $delivery = $_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? '';
  $deliveryLine = is_string($delivery) && $delivery !== '' ? $delivery : '(unknown)';
  $logStatus = $loggingDisabled
    ? 'disabled'
    : ($logged ? 'written' : 'WRITE FAILED - check PHP error log');

  $body = <<<TXT
Deploy failed (exit code {$code}).

GitHub delivery: {$deliveryLine}
Server log: {$logStatus}
TXT;
  exit($body);
}

http_response_code(200);
header('Content-Type: text/plain; charset=UTF-8');
echo 'OK';
