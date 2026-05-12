<?php
/**
 * GitHub deploy webhook — configuration (example).
 *
 * This file is SAFE to commit (placeholders only).
 *
 * Server setup (simple, no assumptions about your home/include/web layout):
 *   1) Copy this file to your deployed web directory beside the webhook:
 *        webhooks/webhook-secrets.local.php
 *      (same folder that contains webhooks/deploy.php)
 *   2) chmod 640 webhooks/webhook-secrets.local.php
 *   3) Ensure your rsync deploy does NOT delete it (repo ships a `.rsync-exclude`
 *      that excludes `webhooks/webhook-secrets.local.php`).
 *
 * Local dev:
 *   If you want to test locally, you can create:
 *     public/webhooks/webhook-secrets.local.php
 *   (it is gitignored).
 */
declare(strict_types=1);

return [
  // GitHub webhook "Secret" — use: openssl rand -hex 32
  'secret' => 'CHANGE_ME_LONG_RANDOM',

  // TEMP DEBUG (set true briefly, then turn off):
  // When true, deploy.php may return extra JSON on failures (never includes secrets).
  // Restrict by IP if you can (leave empty to allow from anywhere).
  // 'debug' => true,
  // 'debug_allow_ips' => ['203.0.113.10'],

  // Absolute path to the git checkout on the server (required).
  // This is where scripts/build-deploy.sh lives and where git pull runs.
  'repo_root' => '/home/you/include/ActivistChecklist.org',

  // Optional: require this exact repo (stops stray webhooks if URL leaks).
  // This is the GitHub "full_name" field, NOT a URL.
  'allowed_repository' => 'ActivistChecklist/ActivistChecklist',

  // Only deploy on this branch push.
  'allowed_ref' => 'refs/heads/main',

  // Signed timestamp replay protection.
  // Server accepts requests within +/- this many seconds.
  'timestamp_window_sec' => 300,

  'CI' => true,

  // Optional. How webhook updates the server checkout before running build-deploy.sh:
  // - 'hard-reset' (default if omitted): force repo to exactly origin/<branch>
  // - 'ff-only': safer for local changes; fails if fast-forward isn't possible
  // 'git_update_mode' => 'hard-reset',

  // Passed into scripts/build-deploy.sh (PHP often runs as www-data).
  // Do not set REPO_DIR here — deploy.php sets it from repo_root above.
  'deploy_env' => [
    // Where out/ gets rsynced to (your live docroot)
    'DEPLOY_TARGET' => '/home/you/web',
    // Helps tools that rely on $HOME (ssh keys, etc.)
    'HOME' => '/home/you',
    // Optional: set PATH explicitly if your PHP/FPM environment is minimal.
    // Example (May First-style nvm + user bin):
    // 'PATH' => '/home/sites/360449/include/.nvm/versions/node/v22.12.0/bin:/home/sites/360449/bin:/usr/local/bin:/usr/bin:/bin',
  ],

  // Logging is on by default: repo root .deploy-webhook.log (gitignored). Override path:
  // 'log_file' => '/home/you/logs/deploy-webhook.log',
  // Or disable:
  // 'log_file' => false,
];

