#!/usr/bin/env node
/**
 * pnpm compare <ref1> <ref2>
 *
 * Builds each ref in its own detached git worktree under buildbackups/.worktrees/
 * (main clone branch and working tree are left unchanged — no stash).
 *
 * Prompts for two snapshot labels (unless --name-a / --name-b or --no-prompt), normalizes
 * both trees, writes a diff, removes temp static copies, prints where the diff is.
 *
 * Reuses buildbackups/.cache/static-<fullSha>/ when present (same commit already built).
 * SNAPSHOT_CACHE=0 forces a fresh build for both refs.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { execFileSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';

import { getTimestamp } from './snapshot-normalize-lib.mjs';
import { runSnapshotCompare } from './snapshot-compare.mjs';
import {
  isSnapshotCacheDisabled,
  isValidStaticCache,
  moveBuildOutputToCache,
  staticBuildCacheDir,
  symlinkDir
} from './snapshot-build-cache.mjs';
import {
  addDetachedWorktree,
  gitRevParse,
  linkNodeModulesFromMain,
  listOutBackups,
  removeWorktree,
  snapshotBuildEnv
} from './snapshot-worktree.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'buildbackups');

const env = snapshotBuildEnv();

function verifyRef(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
      cwd: ROOT,
      stdio: 'pipe'
    });
  } catch {
    throw new Error(`Not a valid ref: ${ref}`);
  }
}

function parseArgs(argv) {
  const refs = [];
  let nameA;
  let nameB;
  let noPrompt = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name-a') {
      nameA = argv[++i];
      if (!nameA) {
        throw new Error('Missing value for --name-a');
      }
      continue;
    }
    if (a === '--name-b') {
      nameB = argv[++i];
      if (!nameB) {
        throw new Error('Missing value for --name-b');
      }
      continue;
    }
    if (a === '--no-prompt') {
      noPrompt = true;
      continue;
    }
    if (a.startsWith('-')) {
      throw new Error(`Unknown option: ${a}`);
    }
    refs.push(a);
  }
  return { refs, nameA, nameB, noPrompt };
}

function usage() {
  return `Usage: pnpm compare <ref1> <ref2> [options]

  Builds each ref in a detached worktree (main clone unchanged), normalizes both static
  trees, writes a unified diff.

Options:
  --name-a <label>   First snapshot name (folder + diff name); skips prompt for "a"
  --name-b <label>   Second snapshot name; skips prompt for "b"
  --no-prompt        Use ref strings as labels (non-interactive)

Examples:
  pnpm compare main HEAD
  pnpm compare main feature/x --name-a main --name-b feature-x

Env:
  SNAPSHOT_CACHE=0   Always run pnpm buildstatic (ignore .cache)`;
}

async function promptLabels(ref1, ref2, nameA, nameB, noPrompt) {
  if (noPrompt) {
    return {
      label1: nameA || ref1,
      label2: nameB || ref2
    };
  }
  if (nameA && nameB) {
    return { label1: nameA, label2: nameB };
  }
  const rl = readline.createInterface({ input, output });
  try {
    let label1 = nameA;
    let label2 = nameB;
    if (!label1) {
      label1 =
        (await rl.question(`Label for first snapshot (${ref1}) [${ref1}]: `)).trim() ||
        ref1;
    }
    if (!label2) {
      label2 =
        (await rl.question(`Label for second snapshot (${ref2}) [${ref2}]: `)).trim() ||
        ref2;
    }
    return { label1, label2 };
  } finally {
    rl.close();
  }
}

/**
 * Materialize static tree under destStatic: reuse buildbackups/.cache/static-<sha>/ if valid,
 * else build in a worktree, move out-* into cache, then symlink destStatic → cache.
 */
function buildRefToStatic(ref, label, destStatic) {
  const fullSha = gitRevParse(ROOT, ref);
  const cacheDir = staticBuildCacheDir(ROOT, fullSha);

  if (!isSnapshotCacheDisabled() && isValidStaticCache(cacheDir)) {
    console.log(`\n♻️  Cache hit ${fullSha.slice(0, 12)} — skip build, reuse static tree`);
    if (fs.existsSync(destStatic)) {
      fs.rmSync(destStatic, { recursive: true, force: true });
    }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    symlinkDir(cacheDir, destStatic);
    console.log(`   📁 Static tree: ${path.relative(ROOT, destStatic)} → .cache`);
    return;
  }

  let wtPath = null;
  try {
    console.log(`\n🌿 Worktree for ${ref} (detached)…`);
    const wt = addDetachedWorktree(ROOT, ref, `compare-${label.replace(/[^a-zA-Z0-9._-]+/g, '-')}`);
    wtPath = wt.path;

    console.log('📎 Symlink node_modules ← main clone…');
    linkNodeModulesFromMain(ROOT, wtPath);

    console.log('🔨 pnpm buildstatic…');
    execSync('pnpm buildstatic', { cwd: wtPath, stdio: 'inherit', env });

    const newest = listOutBackups(path.join(wtPath, 'buildbackups'))[0];
    if (!newest) {
      throw new Error('No buildbackups/out-* backup found after build.');
    }
    moveBuildOutputToCache(ROOT, fullSha, newest.path);
    if (fs.existsSync(destStatic)) {
      fs.rmSync(destStatic, { recursive: true, force: true });
    }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    symlinkDir(staticBuildCacheDir(ROOT, fullSha), destStatic);
    console.log(`   📁 Static tree: ${path.relative(ROOT, destStatic)} → .cache`);
  } finally {
    if (wtPath) {
      console.log('🧹 Removing build worktree…');
      removeWorktree(ROOT, wtPath);
    }
  }
}

const argv = process.argv.slice(2);
let ref1;
let ref2;
let nameA;
let nameB;
let noPrompt;

try {
  const parsed = parseArgs(argv);
  if (parsed.refs.length !== 2) {
    console.error(usage());
    process.exit(1);
  }
  [ref1, ref2] = parsed.refs;
  nameA = parsed.nameA;
  nameB = parsed.nameB;
  noPrompt = parsed.noPrompt;
} catch (e) {
  console.error('❌', e.message || e);
  console.error(usage());
  process.exit(1);
}

try {
  verifyRef(ref1);
  verifyRef(ref2);
} catch (e) {
  console.error('❌', e.message || e);
  process.exit(1);
}

const { label1, label2 } = await promptLabels(ref1, ref2, nameA, nameB, noPrompt);

const stamp = getTimestamp();
const static1 = path.join(BACKUP_DIR, `compare-static-${stamp}-1`);
const static2 = path.join(BACKUP_DIR, `compare-static-${stamp}-2`);
const outDir = path.join(BACKUP_DIR, `snapshot-compare-${stamp}`);

let exitCode = 0;
let diffFileRel = null;

try {
  console.log(`\n🔨 Build 1/2: ${ref1} (→ ${label1})`);
  buildRefToStatic(ref1, label1, static1);

  console.log(`\n🔨 Build 2/2: ${ref2} (→ ${label2})`);
  buildRefToStatic(ref2, label2, static2);

  console.log('\n📄 Normalizing + diff…');
  const { diffRelative } = await runSnapshotCompare(static1, static2, {
    labels: [label1, label2],
    outDir
  });

  diffFileRel = diffRelative;

  console.log('\n🧹 Removing temporary static trees…');
  fs.rmSync(static1, { recursive: true, force: true });
  fs.rmSync(static2, { recursive: true, force: true });
} catch (e) {
  console.error('❌', e.message || e);
  exitCode = 1;
  try {
    if (fs.existsSync(static1)) {
      fs.rmSync(static1, { recursive: true, force: true });
    }
    if (fs.existsSync(static2)) {
      fs.rmSync(static2, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
}

if (exitCode === 0 && diffFileRel) {
  const abs = path.join(ROOT, diffFileRel);
  console.log('\n✅ Done.');
  console.log(`   Diff file: ${diffFileRel}`);
  console.log(`   Full path: ${abs}`);
}

process.exit(exitCode);
