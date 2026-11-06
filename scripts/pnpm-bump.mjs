#!/usr/bin/env node
// Bump the pinned pnpm to the newest release on the same major that has been
// out long enough. Run by .github/workflows/pnpm-bump.yml; safe to run by hand:
//
//   node scripts/pnpm-bump.mjs            # run `corepack use` when a release is due
//   node scripts/pnpm-bump.mjs --dry-run  # only report
//   node scripts/pnpm-bump.mjs --verify   # check a bump in the working tree against HEAD
//
// `corepack use pnpm@<version>` does the rewriting: it sets packageManager with
// that release's sha512, then runs `pnpm install`, which records the same
// version in pnpm-lock.yaml. The rules for which release is due, and for what
// a clean bump may change, are in scripts/lib/pnpm-bump-core.mjs. Never crosses
// a major: moving to a new major is a decision, not a sweep.
//
// When GITHUB_OUTPUT is set, writes `version` for the workflow (empty when
// nothing is due). --verify also writes the PR `title` and `body`, so the PR
// text comes from the job that ran no new code.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBump, parsePackageManager, pickUpgrade } from './lib/pnpm-bump-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { packageJson: 'package.json', lockfile: 'pnpm-lock.yaml' };
const mode = process.argv.includes('--verify')
  ? 'verify'
  : process.argv.includes('--dry-run')
    ? 'dry-run'
    : 'bump';

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const npmView = (...args) => JSON.parse(run('npm', ['view', ...args, '--json']));
const readFiles = (read) =>
  Object.fromEntries(Object.entries(FILES).map(([key, name]) => [key, read(name)]));
const fromDisk = () => readFiles((name) => fs.readFileSync(path.join(ROOT, name), 'utf8'));
const fromHead = () => readFiles((name) => run('git', ['show', `HEAD:${name}`]));

function output(values) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  // Heredoc form so multi-line values (the PR body) survive.
  const delim = `EOF_${Math.random().toString(36).slice(2)}`;
  fs.appendFileSync(
    out,
    Object.entries(values)
      .map(([k, v]) => `${k}<<${delim}\n${v}\n${delim}\n`)
      .join(''),
  );
}

const notes = (v) => `[${v}](https://github.com/pnpm/pnpm/releases/tag/v${v})`;

function prBody(current, { target, waiting }) {
  return [
    `pnpm **${current} → ${target.version}**, the newest release on the major we pin that is past its release-age wait.`,
    '',
    `Release notes: ${notes(target.version)}` +
      (target.skipped.length
        ? `. Also covers releases in between: ${target.skipped.map(notes).join(', ')}.`
        : ''),
    ...(waiting.length
      ? [
          '',
          `Newer, but still inside the wait: ${waiting.map((w) => w.version).join(', ')}. A later run updates this PR when ${waiting.length === 1 ? 'it is' : 'they are'} due.`,
        ]
      : []),
    '',
    `Made with \`corepack use pnpm@${target.version}\`. The workflow checked the result against the npm registry before opening this PR, and it changes only:`,
    '- `packageManager` in `package.json`, with the new `+sha512` hash',
    "- pnpm's own entry, the first YAML document in `pnpm-lock.yaml`. The dependency lockfile after it is unchanged.",
    '',
    'Merging is the whole upgrade. CI (`pnpm/action-setup`), Railway and corepack on the May First host all read `packageManager`, and a local pnpm switches to the pinned version on its next run. pr-checks on this PR already run on the new pnpm.',
    '',
    '*Opened automatically by `.github/workflows/pnpm-bump.yml`. Later runs update this PR in place rather than opening another. It never moves to a new major, and it waits 3 days after a minor release or 2 after a patch, like Dependabot.*',
  ].join('\n');
}

function pick(current) {
  const registry = npmView('pnpm', 'dist-tags', 'time', 'versions');
  const result = pickUpgrade(registry, current, Date.now());
  for (const w of result.waiting) {
    console.log(
      `pnpm ${w.version} is not due yet (${w.dueAt ? `due ${w.dueAt}` : 'npm lists no publish time'}).`,
    );
  }
  if (result.target) {
    const { version, date, skipped } = result.target;
    console.log(`pnpm ${current} -> ${version} (published ${date})`);
    if (skipped.length) console.log(`Also covers: ${skipped.join(', ')}`);
  } else {
    console.log(`pnpm ${current}: no newer release on its major is due. Nothing to do.`);
  }
  return result;
}

// Checks the bump against what npm itself says the release's hash is.
const check = (before, after, version) =>
  checkBump({ before, after, version, integrity: npmView(`pnpm@${version}`, 'dist.integrity') });

if (mode === 'verify') {
  const before = fromHead();
  const current = parsePackageManager(JSON.parse(before.packageJson).packageManager).version;
  const result = pick(current);
  if (!result.target) throw new Error('The working tree has a pnpm bump, but no release is due.');
  check(before, fromDisk(), result.target.version);
  console.log('The working tree is a clean bump to that release.');
  output({
    version: result.target.version,
    title: `pnpm ${result.target.version}`,
    body: prBody(current, result),
  });
} else {
  const before = fromDisk();
  const current = parsePackageManager(JSON.parse(before.packageJson).packageManager).version;
  const { target } = pick(current);
  if (target && mode === 'bump') {
    execFileSync('corepack', ['use', `pnpm@${target.version}`], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    });
    check(before, fromDisk(), target.version);
  }
  output({ version: target?.version ?? '' });
}
