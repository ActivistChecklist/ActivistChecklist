#!/usr/bin/env node
/**
 * pnpm snapshot-compare <dir-1> <dir-2>
 * 1) Normalizes both static trees (same as snapshot-normalize).
 * 2) Diffs the normalized text outputs.
 * Everything goes under one folder: buildbackups/snapshot-compare-DATETIME/
 *   1-before-HASH/  2-after-HASH/  comparison-HASH1-HASH2.diff
 * (or 1-label/ 2-label/ when labels are supplied via runSnapshotCompare.)
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';
import {
  resolveSnapshotDirs,
  REPO_ROOT,
  usageSnapshotTwoDirs
} from './snapshot-resolve-dir.mjs';
import {
  getTimestamp,
  compareNormalizedDirNames,
  compareNormalizedDirNamesFromLabels,
  normalizeOneStaticDir
} from './snapshot-normalize-lib.mjs';

const ROOT = REPO_ROOT;

/**
 * @param {string} abs1
 * @param {string} abs2
 * @param {object} [options]
 * @param {[string, string]} [options.labels] User labels → folder names 1-x / 2-y and diff name
 * @param {string} [options.outDir] Output directory (default: buildbackups/snapshot-compare-STAMP)
 * @param {string} [options.stamp] Timestamp folder segment (default: now)
 * @returns {Promise<{ diffRelative: string, outDir: string }>}
 */
export async function runSnapshotCompare(abs1, abs2, options = {}) {
  const { labels = null, outDir: outDirOpt, stamp: stampOpt } = options;

  const stamp = stampOpt || getTimestamp();
  const outDir =
    outDirOpt || path.join(ROOT, 'buildbackups', `snapshot-compare-${stamp}`);

  let dir1;
  let dir2;
  let hash1;
  let hash2;
  if (labels && labels.length === 2) {
    const x = compareNormalizedDirNamesFromLabels(labels[0], labels[1]);
    dir1 = x.dir1;
    dir2 = x.dir2;
    hash1 = x.hash1;
    hash2 = x.hash2;
  } else {
    const x = compareNormalizedDirNames(abs1, abs2);
    dir1 = x.dir1;
    dir2 = x.dir2;
    hash1 = x.hash1;
    hash2 = x.hash2;
  }

  const norm1 = path.join(outDir, dir1);
  const norm2 = path.join(outDir, dir2);
  const outFile = path.join(outDir, `comparison-${hash1}-${hash2}.diff`);

  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `📎 ${path.relative(ROOT, abs1)}\n   ↔ ${path.relative(ROOT, abs2)}`
  );
  console.log(`📂 Output base: ${path.relative(ROOT, outDir)}`);

  console.log('📄 Normalizing (1/2)…');
  await normalizeOneStaticDir(abs1, norm1);
  console.log(`✅ Normalized → ${dir1}/`);

  console.log('📄 Normalizing (2/2)…');
  await normalizeOneStaticDir(abs2, norm2);
  console.log(`✅ Normalized → ${dir2}/`);

  let diffText = '';
  try {
    diffText = execSync(`diff -ruN -x '.DS_Store' "${norm1}" "${norm2}"`, {
      encoding: 'utf8',
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (e) {
    if (e.status === 1) {
      diffText = e.stdout ? String(e.stdout) : '';
    } else {
      throw new Error(`diff failed: ${e.message}`);
    }
  }

  fs.writeFileSync(outFile, diffText || '', 'utf8');
  const diffRelative = path.relative(ROOT, outFile);
  console.log(`📝 Wrote ${diffRelative}`);

  return { diffRelative, outDir };
}

const isMain =
  import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href;

if (isMain) {
  const raw1 = process.argv[2];
  const raw2 = process.argv[3];
  if (!raw1 || !raw2) {
    console.error(usageSnapshotTwoDirs('snapshot-compare'));
    process.exit(1);
  }

  let abs1;
  let abs2;
  try {
    [abs1, abs2] = resolveSnapshotDirs(raw1, raw2);
  } catch (e) {
    console.error('❌', e.message || e);
    process.exit(1);
  }

  (async () => {
    try {
      await runSnapshotCompare(abs1, abs2);
    } catch (e) {
      console.error('❌', e.message || e);
      process.exit(1);
    }
  })();
}
