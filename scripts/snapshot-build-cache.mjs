/**
 * Reuse static export trees by full git commit SHA (buildbackups/.cache/static-<sha>/).
 * Set SNAPSHOT_CACHE=0 to always rebuild.
 */

import fs from 'fs';
import path from 'path';
import { moveDirPreferRename } from './snapshot-worktree.mjs';

export function isSnapshotCacheDisabled() {
  const v = process.env.SNAPSHOT_CACHE;
  return v === '0' || v === 'false' || v === 'off';
}

/** Absolute path: buildbackups/.cache/static-<fullSha> */
export function staticBuildCacheDir(repoRoot, fullSha) {
  return path.join(repoRoot, 'buildbackups', '.cache', `static-${fullSha}`);
}

/**
 * True if the cache dir looks like a completed BUILD_MODE=static output.
 */
export function isValidStaticCache(cacheDir) {
  if (!fs.existsSync(cacheDir)) {
    return false;
  }
  const st = fs.statSync(cacheDir);
  if (!st.isDirectory()) {
    return false;
  }
  if (fs.existsSync(path.join(cacheDir, 'sitemap.xml'))) {
    return true;
  }
  if (fs.existsSync(path.join(cacheDir, 'index.html'))) {
    return true;
  }
  if (fs.existsSync(path.join(cacheDir, 'en', 'index.html'))) {
    return true;
  }
  try {
    const entries = fs.readdirSync(cacheDir);
    return entries.some((e) => e.endsWith('.html'));
  } catch {
    return false;
  }
}

/**
 * Move worktree build output (out/) into the cache dir for this commit.
 * @returns {string} Absolute cache dir path
 */
export function moveBuildOutputToCache(repoRoot, fullSha, builtOutDir) {
  const cacheDir = staticBuildCacheDir(repoRoot, fullSha);
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
  moveDirPreferRename(builtOutDir, cacheDir);
  return cacheDir;
}

/** Symlink linkPath → target (directory). Windows uses junction. */
export function symlinkDir(target, linkPath) {
  if (fs.existsSync(linkPath)) {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const absTarget = path.resolve(target);
  if (process.platform === 'win32') {
    fs.symlinkSync(absTarget, linkPath, 'junction');
  } else {
    fs.symlinkSync(absTarget, linkPath, 'dir');
  }
}
