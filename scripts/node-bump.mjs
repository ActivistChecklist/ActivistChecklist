#!/usr/bin/env node
// Bump the pinned Node version to the newest release on the same major.
// Run by .github/workflows/node-bump.yml; safe to run by hand:
//
//   node scripts/node-bump.mjs            # rewrite the pin files if newer exists
//   node scripts/node-bump.mjs --dry-run  # only report
//
// Rewrites .nvmrc, railpack.json and engines.node in package.json together (see
// scripts/lib/node-bump-core.mjs). Never crosses a major: moving to a new major
// is a decision, not a sweep. When GITHUB_OUTPUT is set, writes version,
// security, title and body for the workflow; version is empty when there is
// nothing to do.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBump, pickUpgrade, readNvmrc } from './lib/node-bump-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_URL = 'https://nodejs.org/dist/index.json';
const dryRun = process.argv.includes('--dry-run');

const file = (name) => path.join(ROOT, name);
const read = (name) => fs.readFileSync(file(name), 'utf8');

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

const notes = (v) => `[${v}](https://nodejs.org/en/blog/release/v${v})`;

function prBody(upgrade, current, engines) {
  return [
    `Node **${current} → ${upgrade.version}**, the newest release on the major we pin.` +
      (upgrade.security ? ' **Includes a security release.**' : ''),
    '',
    `Release notes: ${notes(upgrade.version)}` +
      (upgrade.skipped.length
        ? `. Also covers releases in between: ${upgrade.skipped.map(notes).join(', ')}.`
        : ''),
    '',
    'Changes, all to the same version:',
    '- `.nvmrc` (CI, and the May First host via nvm)',
    '- `railpack.json` (Railway)',
    `- \`engines.node\`: \`${engines.from}\` → \`${engines.to}\``,
    '',
    'Merging is the whole upgrade. The May First host installs the new version on first use, and `scripts/healthcheck-api.sh` moves ac-api onto it within one 5-minute run; its Healthchecks ping says `node_current=true` once that has happened. pr-checks on this PR already run on the new Node.',
    '',
    '*Opened automatically by `.github/workflows/node-bump.yml`. Later runs update this PR in place rather than opening another. It never moves to a new major.*',
  ].join('\n');
}

const res = await fetch(INDEX_URL, { signal: AbortSignal.timeout(30_000) });
if (!res.ok) throw new Error(`${INDEX_URL} answered HTTP ${res.status}`);
const releases = await res.json();

const files = {
  nvmrc: read('.nvmrc'),
  railpack: read('railpack.json'),
  packageJson: read('package.json'),
};
const current = readNvmrc(files.nvmrc);
const upgrade = pickUpgrade(releases, current);

if (!upgrade) {
  console.log(`Node ${current} is the newest release on its major. Nothing to do.`);
  output({ version: '' });
  process.exit(0);
}

// Computed even on --dry-run so a pin-file mismatch fails the same way.
const next = applyBump(files, upgrade.version);
console.log(
  `Node ${current} -> ${upgrade.version} (released ${upgrade.date}${upgrade.security ? ', security' : ''})`,
);
if (upgrade.skipped.length) console.log(`Also covers: ${upgrade.skipped.join(', ')}`);
console.log(`engines.node: ${next.engines.from} -> ${next.engines.to}`);

if (!dryRun) {
  fs.writeFileSync(file('.nvmrc'), next.nvmrc);
  fs.writeFileSync(file('railpack.json'), next.railpack);
  fs.writeFileSync(file('package.json'), next.packageJson);
}

output({
  version: upgrade.version,
  security: String(upgrade.security),
  title: `${upgrade.security ? 'Security: ' : ''}Node ${upgrade.version}`,
  body: prBody(upgrade, current, next.engines),
});
