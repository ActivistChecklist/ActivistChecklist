'use strict';

/**
 * Drop a linked worktree's absolute `core.hooksPath` override so the worktree
 * runs its own `.husky/pre-commit`.
 *
 * The repo config sets `core.hooksPath = .husky/_`, which git resolves against
 * each worktree's root. Worktrees created by some tools also get an absolute
 * override in `config.worktree` pointing at the MAIN checkout's `.husky/_`, so a
 * commit in the worktree runs whatever hook the main checkout has checked out.
 * When that was a branch from before Prettier-on-commit (#703), worktree commits
 * skipped formatting and failed `format:check` in CI.
 *
 * We only remove the override once this worktree's own `.husky/_/h` exists
 * (Husky creates it during `pnpm install`), so commits never end up with no hooks.
 */

const path = require('path');

/**
 * Whether the worktree-scoped hooksPath should be unset.
 *
 * @param {object} state
 * @param {boolean} state.isLinkedWorktree  git-dir differs from git-common-dir
 * @param {boolean} state.worktreeConfigEnabled  extensions.worktreeConfig is on.
 *   Without it, `git config --worktree` writes the shared config, so we must not touch it.
 * @param {string | null} state.worktreeHooksPath  value from `git config --worktree`
 * @param {string} state.worktreeRoot  `git rev-parse --show-toplevel`
 * @param {boolean} state.ownHooksReady  `<worktreeRoot>/.husky/_/h` exists
 */
function shouldUnsetWorktreeHooksPath({
  isLinkedWorktree,
  worktreeConfigEnabled,
  worktreeHooksPath,
  worktreeRoot,
  ownHooksReady,
}) {
  if (!isLinkedWorktree || !worktreeConfigEnabled || !ownHooksReady) return false;
  if (!worktreeHooksPath || !path.isAbsolute(worktreeHooksPath)) return false;
  return path.resolve(worktreeHooksPath) !== path.resolve(worktreeRoot, '.husky', '_');
}

function git(args, cwd) {
  const { execFileSync } = require('child_process');
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** Inspect the current checkout and unset a stale override. Never throws. */
function fixWorktreeHooksPath(cwd = process.cwd()) {
  const fs = require('fs');
  const worktreeRoot = git(['rev-parse', '--show-toplevel'], cwd);
  if (!worktreeRoot) return false;

  const gitDir = git(['rev-parse', '--absolute-git-dir'], cwd);
  const commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  const state = {
    isLinkedWorktree: Boolean(gitDir && commonDir && gitDir !== commonDir),
    worktreeConfigEnabled: git(['config', '--bool', 'extensions.worktreeConfig'], cwd) === 'true',
    worktreeHooksPath: git(['config', '--worktree', '--get', 'core.hooksPath'], cwd),
    worktreeRoot,
    ownHooksReady: fs.existsSync(path.join(worktreeRoot, '.husky', '_', 'h')),
  };
  if (!shouldUnsetWorktreeHooksPath(state)) return false;

  if (git(['config', '--worktree', '--unset', 'core.hooksPath'], cwd) === null) return false;
  console.log(
    `prepare: this worktree now runs its own git hooks (removed core.hooksPath override ${state.worktreeHooksPath})`,
  );
  return true;
}

module.exports = { shouldUnsetWorktreeHooksPath, fixWorktreeHooksPath };
