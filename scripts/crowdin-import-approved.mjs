#!/usr/bin/env node
/**
 * Import a translation we already trust into Crowdin, approved.
 *
 * For text a person translated outside Crowdin, such as the Spanish "Police at
 * the door" poster made in Canva. Crowdin's AI pre-translation fills in a new
 * source file as soon as it arrives from GitHub; this puts the human version on
 * top as the approved translation, so Crowdin exports it instead.
 *
 *   node scripts/crowdin-import-approved.mjs content/es/pdf/police-at-the-door.json
 *   node scripts/crowdin-import-approved.mjs content/es/pdf/police-at-the-door.json --apply
 *
 * The path must be one crowdin.yml writes translations to. Without --apply it
 * only looks the file and language up in Crowdin and reports what it would do.
 * The English source must already be in Crowdin: merge to main first and wait
 * for the GitHub integration to pick it up (the dry run tells you).
 *
 * Approvals are recorded against whoever owns CROWDIN_PERSONAL_TOKEN.
 * Needs CROWDIN_PERSONAL_TOKEN and CROWDIN_PROJECT_ID (read from .env).
 */

try {
  process.loadEnvFile();
} catch {}

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';

import { translationPatterns, translationTarget } from './lib/l10n-pr-check-core.mjs';

const TOKEN = process.env.CROWDIN_PERSONAL_TOKEN;
const PROJECT_ID = process.env.CROWDIN_PROJECT_ID;
const BASE_URL = 'https://api.crowdin.com/api/v2';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { apply: { type: 'boolean', default: false } },
});

async function crowdin(apiPath, { method = 'GET', body, headers = {} } = {}) {
  for (;;) {
    const res = await fetch(`${BASE_URL}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body && !Buffer.isBuffer(body) ? JSON.stringify(body) : body,
    });
    if (res.status === 429) {
      const wait = parseFloat(res.headers.get('Retry-After') || '1');
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Crowdin ${method} ${apiPath}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
}

/** Every Crowdin file whose path ends with the repo path (Crowdin may add a branch folder). */
async function findSourceFile(repoPath) {
  const want = `/${repoPath.replace(/^\/+/, '')}`;
  const matches = [];
  for (let offset = 0; ; offset += 500) {
    const page = await crowdin(`/projects/${PROJECT_ID}/files?limit=500&offset=${offset}`);
    for (const { data } of page.data) {
      if (data.path === want || data.path.endsWith(want)) matches.push(data);
    }
    if (page.data.length < 500) break;
  }
  if (matches.length > 1) {
    // The GitHub integration puts main's files in a "main" branch folder.
    const main = matches.find((f) => f.path === `/main${want}`);
    if (main) return main;
    throw new Error(`${repoPath} matches several Crowdin files: ${matches.map((f) => f.path)}`);
  }
  return matches[0] ?? null;
}

/** Crowdin language id for an app locale (es -> es-ES, fr -> fr). */
function crowdinLanguage(locale, targetLanguageIds) {
  return (
    targetLanguageIds.find((id) => {
      const lower = id.toLowerCase();
      return lower === locale || lower.split('-')[0] === locale;
    }) ?? null
  );
}

async function waitForImport(importId) {
  for (;;) {
    const { data } = await crowdin(`/projects/${PROJECT_ID}/translations/imports/${importId}`);
    if (data.status === 'finished') return;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`import ${importId} ${data.status}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main() {
  if (!TOKEN || !PROJECT_ID) throw new Error('set CROWDIN_PERSONAL_TOKEN and CROWDIN_PROJECT_ID');
  if (positionals.length !== 1) {
    throw new Error('usage: crowdin-import-approved.mjs <translation file> [--apply]');
  }

  const file = path.relative(process.cwd(), path.resolve(positionals[0])).split(path.sep).join('/');
  const target = translationTarget(
    file,
    translationPatterns(fs.readFileSync('crowdin.yml', 'utf8')),
  );
  if (!target) throw new Error(`${file} is not a path crowdin.yml writes translations to`);
  const bytes = fs.readFileSync(file);

  const project = await crowdin(`/projects/${PROJECT_ID}`);
  const languageId = crowdinLanguage(target.locale, project.data.targetLanguageIds ?? []);
  if (!languageId) throw new Error(`the Crowdin project does not translate into ${target.locale}`);

  const source = await findSourceFile(target.sourcePath);
  if (!source) {
    throw new Error(
      `${target.sourcePath} is not in Crowdin yet. Merge it to main and wait for the GitHub ` +
        'integration to import it, then run this again.',
    );
  }

  console.log(`${file} -> Crowdin file ${source.path} (id ${source.id}), language ${languageId}`);
  if (!opts.apply) {
    console.log('Dry run. Add --apply to import these translations as approved.');
    return;
  }

  const storage = await crowdin('/storages', {
    method: 'POST',
    body: bytes,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Crowdin-API-FileName': encodeURIComponent(path.basename(file)),
    },
  });
  const started = await crowdin(`/projects/${PROJECT_ID}/translations/imports`, {
    method: 'POST',
    body: {
      storageId: storage.data.id,
      fileId: source.id,
      languageIds: [languageId],
      importEqSuggestions: true,
      autoApproveImported: true,
      translateHidden: false,
    },
  });
  await waitForImport(started.data.identifier);

  const report = await crowdin(
    `/projects/${PROJECT_ID}/translations/imports/${started.data.identifier}/report`,
  );
  for (const lang of report.data.languages ?? []) {
    const phrases = lang.files.reduce((n, f) => n + f.statistics.phrases, 0);
    const skipped = Object.entries(lang.skipped ?? {})
      .filter(([, n]) => n > 0)
      .map(([why, n]) => `${n} ${why}`);
    console.log(
      `✓ ${lang.id}: ${phrases} string(s) imported and approved` +
        (skipped.length ? `; skipped ${skipped.join(', ')}` : ''),
    );
  }
}

main().catch((err) => {
  console.error(`crowdin-import-approved: ${err.message}`);
  process.exit(1);
});
