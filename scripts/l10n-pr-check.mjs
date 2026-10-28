#!/usr/bin/env node
// Gate for Crowdin translation PRs (l10n_* branches). Run by the l10n_check job
// in .github/workflows/pr-checks.yml; safe to run by hand on any two commits:
//
//   node scripts/l10n-pr-check.mjs                       # HEAD^1..HEAD (PR merge commit)
//   node scripts/l10n-pr-check.mjs --base origin/main --head l10n_main
//
// Fails when the diff touches anything crowdin.yml does not translate into, or
// when a translated file or string carries a tag, script URL or event handler
// its English source does not have (see scripts/lib/l10n-pr-check-core.mjs).
// Writes a per-locale summary of what changed to GITHUB_STEP_SUMMARY when set,
// so a reviewer can read the strings instead of a 700-file diff.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  checkChangedPaths,
  checkMessages,
  compareMarkup,
  diffMessages,
  flattenMessages,
  newLinkHosts,
  parseRawDiff,
  translationPatterns,
  translationTarget,
} from './lib/l10n-pr-check-core.mjs';

const MAX_ROWS_PER_LOCALE = 150;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg('--base', 'HEAD^1');
const head = arg('--head', 'HEAD');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

// Read a file at a commit; null when it does not exist there.
function show(rev, file) {
  try {
    return execFileSync('git', ['show', `${rev}:${file}`], {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

// Workflow commands: keep translator text from breaking out of the message.
const escapeData = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProp = (s) => escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

// Markdown table cell. Translator text is shown, never rendered.
function cell(s, max = 160) {
  const short = s.length > max ? `${s.slice(0, max)}…` : s;
  return short
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([|[\]`*_\\])/g, '\\$1')
    .replace(/\s+/g, ' ');
}

const patterns = translationPatterns(show(head, 'crowdin.yml') ?? '');
const changes = parseRawDiff(git('diff', '--raw', '-z', '--no-renames', base, head));
const numstat = new Map(
  git('diff', '--numstat', '-z', '--no-renames', base, head)
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [added, removed, file] = line.split('\t');
      return [file, { added, removed }];
    }),
);

const errors = checkChangedPaths(changes, patterns).map(({ path, reason }) => ({
  path,
  message: reason,
}));
const warnings = [];
const locales = new Map();
const englishCache = new Map();
const english = (file) => {
  if (!englishCache.has(file)) englishCache.set(file, show(head, file));
  return englishCache.get(file);
};

for (const { status, path } of changes) {
  const target = translationTarget(path, patterns);
  if (!target) continue;
  const entry = locales.get(target.locale) ?? { files: [], strings: [] };
  locales.set(target.locale, entry);
  entry.files.push({ path, status, ...(numstat.get(path) ?? {}) });
  if (status === 'D') continue;

  const translated = show(head, path) ?? '';
  const source = english(target.sourcePath);
  // Crowdin can export a file whose English source was renamed or deleted on
  // main in the meantime (#735 did). lib/content.js only lists English slugs,
  // so such an orphan is never rendered; flag it for review instead of
  // blocking the sync. validate-content still runs on it.
  if (source === null) {
    const markup = compareMarkup('', translated);
    warnings.push({
      path,
      message: [`no English source (${target.sourcePath}); not rendered`, ...markup].join('; '),
    });
    continue;
  }

  if (path.endsWith('.json')) {
    let tr, en;
    try {
      tr = JSON.parse(translated);
      en = JSON.parse(source);
    } catch (e) {
      errors.push({ path, message: `invalid JSON: ${e.message}` });
      continue;
    }
    for (const message of checkMessages(en, tr)) errors.push({ path, message });
    // The summary only; a base file that does not parse just shows every key as added.
    let before = {};
    try {
      before = JSON.parse(show(base, path) ?? '{}');
    } catch {}
    const enFlat = flattenMessages(en);
    for (const change of diffMessages(before, tr)) {
      entry.strings.push({ ...change, english: enFlat[change.key] ?? '' });
    }
  } else {
    for (const message of compareMarkup(source, translated)) errors.push({ path, message });
  }

  const hosts = newLinkHosts(source, translated);
  if (hosts.length)
    warnings.push({ path, message: `links to hosts the English does not: ${hosts.join(', ')}` });
}

// ─── Report ──────────────────────────────────────────────────────

for (const { path, message } of errors) {
  console.log(`::error file=${escapeProp(path)}::${escapeData(message)}`);
}
for (const { path, message } of warnings) {
  console.log(`::warning file=${escapeProp(path)}::${escapeData(message)}`);
}

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const out = ['## Translation PR summary', ''];
  out.push(
    errors.length
      ? `**${errors.length} problem(s) block this PR.** See the annotations or the log.`
      : 'No path, markup or script-URL problems found.',
    '',
  );
  if (warnings.length) {
    out.push('### Warnings', '');
    for (const { path, message } of warnings) out.push(`- \`${path}\`: ${cell(message, 300)}`);
    out.push('');
  }
  for (const [locale, { files, strings }] of [...locales].sort()) {
    out.push(`### ${locale}`, '', `${files.length} file(s) changed.`, '');
    out.push('<details><summary>Files</summary>', '', '| File | + | - |', '|---|---|---|');
    for (const f of files) {
      out.push(
        `| \`${f.path}\`${f.status === 'D' ? ' (deleted)' : ''} | ${f.added ?? ''} | ${f.removed ?? ''} |`,
      );
    }
    out.push('', '</details>', '');
    if (strings.length) {
      out.push(`${strings.length} UI string(s) changed in messages/${locale}.json.`, '');
      out.push('| Key | Change | English | Translation |', '|---|---|---|---|');
      for (const s of strings.slice(0, MAX_ROWS_PER_LOCALE)) {
        out.push(`| \`${cell(s.key, 80)}\` | ${s.kind} | ${cell(s.english)} | ${cell(s.value)} |`);
      }
      if (strings.length > MAX_ROWS_PER_LOCALE) {
        out.push('', `…and ${strings.length - MAX_ROWS_PER_LOCALE} more.`);
      }
      out.push('');
    }
  }
  fs.appendFileSync(summaryFile, `${out.join('\n')}\n`);
}

const fileCount = changes.length;
if (errors.length) {
  console.error(`\n✗ ${errors.length} problem(s) across ${fileCount} changed file(s).`);
  process.exit(1);
}
console.log(`✓ ${fileCount} changed file(s) are Crowdin translations with no new markup.`);
