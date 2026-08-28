#!/usr/bin/env node
/**
 * Enforce trailing slashes on internal root-relative paths (Next trailingSlash: true).
 * Usage:
 *   node scripts/trailing-slash-paths.mjs --check
 *   node scripts/trailing-slash-paths.mjs --fix
 *   node scripts/trailing-slash-paths.mjs --fix path/to/file.mdx
 *   node scripts/trailing-slash-paths.mjs --fix --git-staged
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { applyTrailingSlashFixes } from './lib/trailing-slash-paths-core.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const EXT_OK = new Set([
  '.mdx',
  '.md',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
]);

const IGNORE_DIR = new Set([
  'node_modules',
  '.next',
  'out',
  '.git',
  'dist',
  'build',
  'buildbackups',
  'logs',
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE_DIR.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile()) out.push(full);
  }
  return out;
}

function defaultFileList() {
  const dirs = [
    path.join(ROOT, 'content'),
    path.join(ROOT, 'config'),
    path.join(ROOT, 'components'),
    path.join(ROOT, 'app'),
    path.join(ROOT, 'lib'),
    path.join(ROOT, 'messages'),
  ];
  const files = [];
  for (const d of dirs) walk(d, files);
  return files.filter((f) => EXT_OK.has(path.extname(f)));
}

function getStagedFiles() {
  try {
    const buf = execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return buf
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((rel) => path.join(ROOT, rel))
      .filter((f) => fs.existsSync(f) && fs.statSync(f).isFile())
      .filter((f) => EXT_OK.has(path.extname(f)));
  } catch {
    return [];
  }
}

function processFile(filePath, checkOnly) {
  const ext = path.extname(filePath);
  if (!EXT_OK.has(ext)) return false;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }

  const next = applyTrailingSlashFixes(content, { ext });
  if (next === content) return false;

  if (!checkOnly) {
    fs.writeFileSync(filePath, next, 'utf8');
  }
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const fix = args.includes('--fix');
  const gitStaged = args.includes('--git-staged');

  if (!check && !fix) {
    console.error('Usage: trailing-slash-paths.mjs --check | --fix [--git-staged] [files...]');
    process.exit(1);
  }

  if (check && fix) {
    console.error('Use either --check or --fix');
    process.exit(1);
  }

  const rest = args.filter((a) => !['--check', '--fix', '--git-staged'].includes(a));

  let files;
  if (fix && gitStaged) {
    files = getStagedFiles();
    if (files.length === 0) {
      process.exit(0);
    }
  } else if (rest.length > 0) {
    files = rest.map((p) => path.resolve(ROOT, p));
  } else {
    files = defaultFileList();
  }

  let changedCount = 0;
  const changed = [];
  const checkOnly = check;

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (processFile(file, checkOnly)) {
      changedCount += 1;
      changed.push(rel);
    }
  }

  if (check && changedCount > 0) {
    console.error(
      `Trailing-slash check failed: ${changedCount} file(s) need fixing. Run: pnpm fix:paths`
    );
    for (const c of changed) console.error(`  ${c}`);
    process.exit(1);
  }

  if (fix && changedCount > 0) {
    console.log(`Fixed trailing slashes in ${changedCount} file(s).`);
    for (const c of changed) console.log(`  ${c}`);
  }

  process.exit(0);
}

main();
