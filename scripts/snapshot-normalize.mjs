#!/usr/bin/env node
/**
 * pnpm snapshot-normalize <static-dir-1> <static-dir-2>
 * Standalone normalize only (same logic as the first step of snapshot-compare).
 * Writes under buildbackups/snapshot-compare-DATETIME/1-before-HASH/ and 2-after-HASH/
 */

import path from 'path';
import {
  resolveSnapshotDirs,
  REPO_ROOT,
  usageSnapshotTwoDirs
} from './snapshot-resolve-dir.mjs';
import {
  getTimestamp,
  compareNormalizedDirNames,
  normalizeOneStaticDir
} from './snapshot-normalize-lib.mjs';

const ROOT = REPO_ROOT;

const raw1 = process.argv[2];
const raw2 = process.argv[3];
if (!raw1 || !raw2) {
  console.error(usageSnapshotTwoDirs('snapshot-normalize'));
  process.exit(1);
}

let r1;
let r2;
try {
  [r1, r2] = resolveSnapshotDirs(raw1, raw2);
} catch (e) {
  console.error('❌', e.message || e);
  process.exit(1);
}

const stamp = getTimestamp();
const base = path.join(ROOT, 'buildbackups', `snapshot-compare-${stamp}`);
const { dir1, dir2 } = compareNormalizedDirNames(r1, r2);

(async () => {
  try {
    console.log(`📂 Output base: buildbackups/snapshot-compare-${stamp}`);
    await normalizeOneStaticDir(r1, path.join(base, dir1));
    console.log(`✅ Normalized ${path.relative(ROOT, r1)} → ${dir1}`);
    await normalizeOneStaticDir(r2, path.join(base, dir2));
    console.log(`✅ Normalized ${path.relative(ROOT, r2)} → ${dir2}`);
  } catch (e) {
    console.error('❌', e.message || e);
    process.exit(1);
  }
})();
