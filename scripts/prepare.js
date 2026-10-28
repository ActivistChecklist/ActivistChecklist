'use strict';

/**
 * package.json `prepare`: install Husky git hooks locally.
 * Skip on CI, Railway, or when HUSKY=0 (faster reproducible installs).
 */
if (process.env.HUSKY === '0') process.exit(0);
if (process.env.CI) process.exit(0);
if (process.env.RAILWAY_PROJECT_ID) process.exit(0);

try {
  require('child_process').execSync('husky', { stdio: 'inherit' });
} catch {
  process.exit(0);
}

// In a linked worktree, stop running the main checkout's hooks. See the module.
require('./lib/worktree-hooks-path.cjs').fixWorktreeHooksPath();
