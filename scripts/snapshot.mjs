#!/usr/bin/env node
/**
 * pnpm snapshot [commit-ish]
 *
 * Builds in a detached git worktree under buildbackups/.worktrees/ (never checks out
 * another ref in your main clone — no stash, no branch switching).
 *
 * Default commit-ish is HEAD. Symlinks the main clone’s node_modules into the worktree,
 * runs pnpm buildstatic, then copies from buildbackups/.cache/static-<sha>/ into
 * buildbackups/snapshot-DATETIME-SHORTHASH (cache is filled on first build per commit).
 *
 * SNAPSHOT_CACHE=0 disables reuse of .cache.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

import {
  isSnapshotCacheDisabled,
  isValidStaticCache,
  moveBuildOutputToCache,
  staticBuildCacheDir
} from './snapshot-build-cache.mjs';
import {
  addDetachedWorktree,
  gitRevParse,
  gitShortSha,
  linkNodeModulesFromMain,
  listOutBackups,
  removeWorktree,
  snapshotBuildEnv
} from './snapshot-worktree.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'buildbackups');

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

const targetCommit = process.argv[2] || 'HEAD';
const ref = targetCommit;

const env = snapshotBuildEnv();

let exitCode = 0;
let wtPath = null;

try {
  const fullSha = gitRevParse(ROOT, ref);
  const cacheDir = staticBuildCacheDir(ROOT, fullSha);

  if (!isSnapshotCacheDisabled() && isValidStaticCache(cacheDir)) {
    const short = gitShortSha(ROOT, fullSha);
    const snapshotName = `snapshot-${getTimestamp()}-${short}`;
    const dest = path.join(BACKUP_DIR, snapshotName);
    if (fs.existsSync(dest)) {
      console.error(`❌ Target already exists: ${snapshotName}`);
      exitCode = 1;
    } else {
      console.log(`♻️  Cache hit ${fullSha.slice(0, 12)} — skip build, copy from .cache`);
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.cpSync(cacheDir, dest, { recursive: true });
      console.log(`📸 Snapshot: ${snapshotName}`);
    }
  } else {
    console.log(`🌿 Worktree for ${ref} (detached, main clone unchanged)…`);
    const wt = addDetachedWorktree(ROOT, ref, 'snapshot');
    wtPath = wt.path;
    const builtShort = wt.short;

    console.log('📎 Symlink node_modules ← main clone (skip pnpm install)…');
    linkNodeModulesFromMain(ROOT, wtPath);

    console.log('🔨 pnpm buildstatic…');
    execSync('pnpm buildstatic', { cwd: wtPath, stdio: 'inherit', env });

    const wtBackups = path.join(wtPath, 'buildbackups');
    const newest = listOutBackups(wtBackups)[0];
    if (!newest) {
      console.error('❌ No buildbackups/out-* backup found after build.');
      exitCode = 1;
    } else {
      moveBuildOutputToCache(ROOT, fullSha, newest.path);
      const snapshotName = `snapshot-${getTimestamp()}-${builtShort}`;
      const dest = path.join(BACKUP_DIR, snapshotName);
      if (fs.existsSync(dest)) {
        console.error(`❌ Target already exists: ${snapshotName}`);
        exitCode = 1;
      } else {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.cpSync(staticBuildCacheDir(ROOT, fullSha), dest, { recursive: true });
        console.log(`📸 Snapshot: ${snapshotName}`);
      }
    }
  }
} catch (e) {
  console.error('❌', e.message || e);
  exitCode = 1;
} finally {
  if (wtPath) {
    console.log('🧹 Removing build worktree…');
    removeWorktree(ROOT, wtPath);
  }
}

process.exit(exitCode);
