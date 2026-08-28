/**
 * Detached git worktrees under buildbackups/.worktrees/ so snapshot/compare never
 * check out another ref in the main clone (no stash, no branch switching).
 */

import fs from 'fs';
import path from 'path';
import { execFileSync, execSync } from 'child_process';

export function gitRevParse(repoRoot, refish) {
  return execSync(`git rev-parse ${refish}^{commit}`, {
    cwd: repoRoot,
    encoding: 'utf8'
  }).trim();
}

export function gitShortSha(repoRoot, fullSha) {
  return execSync(`git rev-parse --short ${fullSha}`, {
    cwd: repoRoot,
    encoding: 'utf8'
  }).trim();
}

/**
 * @param {string} backupRoot Usually repo/buildbackups (contains out-* from buildbackup)
 */
export function listOutBackups(backupRoot) {
  if (!fs.existsSync(backupRoot)) {
    return [];
  }
  return fs
    .readdirSync(backupRoot)
    .filter((name) => name.startsWith('out-'))
    .map((name) => {
      const full = path.join(backupRoot, name);
      return { name, path: full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * Create a detached worktree at buildbackups/.worktrees/<prefix>-<stamp>-<shortsha>/.
 * @returns {{ path: string, commit: string, short: string }}
 */
export function addDetachedWorktree(repoRoot, refish, prefix) {
  const commit = gitRevParse(repoRoot, refish);
  const short = gitShortSha(repoRoot, commit);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dirName = `${prefix}-${stamp}-${short}`;
  const wtBase = path.join(repoRoot, 'buildbackups', '.worktrees');
  const wtPath = path.join(wtBase, dirName);
  fs.mkdirSync(wtBase, { recursive: true });
  if (fs.existsSync(wtPath)) {
    execFileSync('git', ['worktree', 'remove', '--force', wtPath], {
      cwd: repoRoot,
      stdio: 'inherit'
    });
  }
  execFileSync('git', ['worktree', 'add', '--detach', wtPath, commit], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  return { path: wtPath, commit, short };
}

/**
 * Symlink repo root `node_modules` into the worktree so builds reuse packages (fast).
 * If lockfile differs from the checked-out ref, install deps in the main clone first, or
 * run a full install in the worktree instead.
 */
export function linkNodeModulesFromMain(repoRoot, worktreePath) {
  const src = path.join(repoRoot, 'node_modules');
  const dest = path.join(worktreePath, 'node_modules');
  if (!fs.existsSync(src)) {
    throw new Error(
      'Repo root has no node_modules — run `pnpm install` in the main clone first.'
    );
  }
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  const target = path.resolve(src);
  if (process.platform === 'win32') {
    fs.symlinkSync(target, dest, 'junction');
  } else {
    fs.symlinkSync(target, dest);
  }
}

export function removeWorktree(repoRoot, wtPath) {
  if (!wtPath || !fs.existsSync(wtPath)) {
    return;
  }
  try {
    execFileSync('git', ['worktree', 'remove', '--force', wtPath], {
      cwd: repoRoot,
      stdio: 'inherit'
    });
  } catch {
    fs.rmSync(wtPath, { recursive: true, force: true });
    execFileSync('git', ['worktree', 'prune'], { cwd: repoRoot, stdio: 'inherit' });
  }
}

/** Prefer rename; fall back to copy+rm (cross-filesystem). */
export function moveDirPreferRename(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`moveDirPreferRename: missing ${src}`);
  }
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(src, dest);
  } catch {
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
}

/** Env for builds in a worktree: ensure postbuild runs buildbackup (not skipped when CI is set). */
export function snapshotBuildEnv() {
  const env = { ...process.env };
  delete env.CI;
  return env;
}
