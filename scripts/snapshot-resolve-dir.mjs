/**
 * Resolve static export / backup directory arguments for snapshot-normalize and snapshot-compare:
 * absolute path, path relative to repo root, or a basename under buildbackups/ (e.g. snapshot-*).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REPO_ROOT = ROOT;

/** Shared help line for both snapshot CLI tools */
export const SNAPSHOT_PATH_ARG_HELP =
  'Paths can be absolute, relative to the repo root, or a folder name under buildbackups/ (e.g. snapshot-…, out-…).';

export function usageSnapshotTwoDirs(scriptName) {
  return `Usage: pnpm ${scriptName} <dir-1> <dir-2>\n  ${SNAPSHOT_PATH_ARG_HELP}`;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {[string, string]}
 */
export function resolveSnapshotDirs(a, b) {
  return [resolveSnapshotDir(a), resolveSnapshotDir(b)];
}

export function resolveSnapshotDir(arg) {
  const trimmed = arg.trim();
  const candidates = [];
  const add = (p) => {
    const n = path.normalize(p);
    if (!candidates.includes(n)) {
      candidates.push(n);
    }
  };

  if (path.isAbsolute(trimmed)) {
    add(trimmed);
  }
  add(path.resolve(ROOT, trimmed));
  add(path.join(ROOT, 'buildbackups', trimmed));

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }
  }

  throw new Error(
    `Not a directory: ${arg}\n` +
      `  Tried: ${candidates.join(', ')}`
  );
}
