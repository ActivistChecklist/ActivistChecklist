#!/usr/bin/env node

/**
 * Fetches Crowdin progress per source file in memory, aggregates to each page route slug
 * (guides include embedded checklist items), and writes data/crowdin-translation-status.json
 * with only: routes[slug][locale] → translationPercent, approvalPercent, showUnreviewedNotice.
 *
 * Required: CROWDIN_PROJECT_ID
 * Auth: CROWDIN_TRANSLATION_STATUS_API_KEY (falls back to CROWDIN_PERSONAL_TOKEN for local runs)
 *
 * Optional: CROWDIN_TARGET_LANGUAGE_ID=es-ES — Crowdin language id for progress API (defaults: match
 *   CROWDIN_TARGET_LOCALE against GET /projects/{id} → targetLanguageIds, e.g. es → es-ES)
 *
 * yarn crowdin:translation-status
 */

try {
  process.loadEnvFile();
} catch {}

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { glob as globAsync } from 'node:fs/promises';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
};

const TOKEN =
  process.env.CROWDIN_TRANSLATION_STATUS_API_KEY || process.env.CROWDIN_PERSONAL_TOKEN;
const PROJECT_ID = process.env.CROWDIN_PROJECT_ID;
const BASE_URL = 'https://api.crowdin.com/api/v2';
/** App locale to match against project targetLanguageIds (e.g. es matches es-ES). */
const TARGET_LOCALE = (process.env.CROWDIN_TARGET_LOCALE || 'es').trim();
/** Show PageNotices warning when aggregated approval is strictly below this percent. */
const UNREVIEWED_NOTICE_MAX_APPROVAL = 80;

const OUT_FILE = path.join(process.cwd(), 'data', 'crowdin-translation-status.json');

function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function repoPathToCrowdinPath(repoPath) {
  const p = repoPath.replace(/^\/+/, '');
  return p.startsWith('/') ? p : `/${p}`;
}

async function crowdinFetch(apiPath, { method = 'GET', body } = {}) {
  const url = `${BASE_URL}${apiPath}`;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };

  while (true) {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get('Retry-After') || '1');
      console.log(`  ${c.yellow}Rate limited — waiting ${retryAfter}s...${c.reset}`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Crowdin API ${res.status}: ${text}`);
    }
    return res.status === 204 ? null : res.json();
  }
}

const crowdinGet = (p) => crowdinFetch(p);

async function getDefaultBranchId() {
  const data = await crowdinGet(`/projects/${PROJECT_ID}/branches?limit=500`);
  const list = data.data || [];
  if (list.length === 0) return null;
  const names = list.map((b) => b.data?.name);
  for (const prefer of ['main', 'master']) {
    const idx = names.indexOf(prefer);
    if (idx !== -1) return { id: list[idx].data.id, name: list[idx].data.name };
  }
  const first = list[0].data;
  return { id: first.id, name: first.name };
}

async function paginateFiles(query) {
  const files = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const data = await crowdinGet(
      `/projects/${PROJECT_ID}/files?limit=${limit}&offset=${offset}${query}`,
    );
    for (const item of data.data || []) {
      const row = item.data;
      if (row.path && row.id) {
        files.push(row);
      }
    }
    if ((data.data || []).length < limit) break;
    offset += limit;
  }
  return files;
}

async function listAllProjectFiles() {
  const branch = await getDefaultBranchId();
  const byId = new Map();

  function merge(rows) {
    for (const row of rows) {
      if (!byId.has(row.id)) {
        byId.set(row.id, row);
      }
    }
  }

  if (branch) {
    merge(await paginateFiles(`&branchId=${branch.id}&recursion=1`));
  }
  merge(await paginateFiles(''));

  return [...byId.values()];
}

function findCrowdinFile(repoPath, files) {
  const want = normalizePath(repoPath).replace(/^\/+/, '');

  const exactKeys = new Set([
    normalizePath(repoPathToCrowdinPath(repoPath)),
    normalizePath(`/${want}`),
    normalizePath(want),
  ]);

  const byKey = new Map();
  for (const f of files) {
    const raw = f.path || f.name;
    if (!raw) continue;
    const p = normalizePath(raw);
    const noLead = p.replace(/^\/+/, '');
    byKey.set(p, f);
    byKey.set(noLead, f);
  }

  for (const k of exactKeys) {
    if (byKey.has(k)) {
      return { file: byKey.get(k), how: 'exact' };
    }
  }

  const candidates = files.filter((f) => {
    const p = normalizePath(f.path || f.name || '').replace(/^\/+/, '');
    return p === want || p.endsWith(`/${want}`) || p === want;
  });

  if (candidates.length === 1) {
    return { file: candidates[0], how: 'suffix' };
  }
  if (candidates.length > 1) {
    const exact = candidates.find(
      (f) => normalizePath(f.path || '').replace(/^\/+/, '') === want,
    );
    if (exact) {
      return { file: exact, how: 'suffix-exact' };
    }
    candidates.sort(
      (a, b) =>
        normalizePath(a.path || '').length - normalizePath(b.path || '').length,
    );
    return { file: candidates[0], how: 'suffix-shortest' };
  }

  return { file: null, how: null };
}

/**
 * Crowdin language id for
 * GET /projects/{id}/languages/{languageId}/progress
 * Uses project targetLanguageIds (e.g. es-ES). Optional explicit override via env.
 */
async function resolveCrowdinLanguageId() {
  const explicit =
    process.env.CROWDIN_TARGET_LANGUAGE_ID?.trim() ||
    process.env.CROWDIN_TARGET_LANGUAGE_IDS?.split(',')[0]?.trim();
  if (explicit) {
    return { crowdinLanguageId: explicit, label: explicit };
  }

  const proj = await crowdinGet(`/projects/${PROJECT_ID}`);
  const targets = proj.data?.targetLanguageIds || [];
  const lower = TARGET_LOCALE.toLowerCase();

  const match = targets.find((tid) => {
    const s = String(tid).toLowerCase();
    return (
      s === lower ||
      s.startsWith(`${lower}-`) ||
      s.split('-')[0] === lower
    );
  });

  if (match) {
    return { crowdinLanguageId: String(match), label: String(match) };
  }

  if (targets.length === 1) {
    const only = String(targets[0]);
    console.log(
      `${c.yellow}Note:${c.reset} using only target language ${c.white}${only}${c.reset} (set CROWDIN_TARGET_LANGUAGE_ID to override).`,
    );
    return { crowdinLanguageId: only, label: only };
  }

  throw new Error(
    `Could not pick Crowdin language from targetLanguageIds [${targets.join(', ')}] for locale "${TARGET_LOCALE}". Set CROWDIN_TARGET_LANGUAGE_ID (e.g. es-ES).`,
  );
}

async function fetchAllFileProgress(languageIdForApi) {
  const byFileId = new Map();
  let offset = 0;
  const limit = 500;
  while (true) {
    const data = await crowdinGet(
      `/projects/${PROJECT_ID}/languages/${encodeURIComponent(languageIdForApi)}/progress?limit=${limit}&offset=${offset}`,
    );
    for (const item of data.data || []) {
      const d = item.data;
      if (!d || d.fileId == null) continue;
      byFileId.set(d.fileId, {
        fileId: d.fileId,
        translationProgress: d.translationProgress ?? null,
        approvalProgress: d.approvalProgress ?? null,
        words: d.words || null,
        phrases: d.phrases || null,
      });
    }
    if ((data.data || []).length < limit) break;
    offset += limit;
  }
  return byFileId;
}

function extractChecklistItemSlugs(mdxContent) {
  const refs = [];
  const regex = /<ChecklistItem\s+slug=["']([^"']+)["']\s*\/?>/g;
  let match;
  while ((match = regex.exec(mdxContent)) !== null) {
    refs.push(match[1]);
  }
  return [...new Set(refs)];
}

function pctFromPhrases(phrases) {
  if (!phrases || !phrases.total) return null;
  return {
    translationPercent: Math.round((100 * (phrases.translated || 0)) / phrases.total),
    approvalPercent: Math.round((100 * (phrases.approved || 0)) / phrases.total),
  };
}

function aggregateProgressRows(rows) {
  let phraseTotal = 0;
  let translated = 0;
  let approved = 0;
  for (const row of rows) {
    const ph = row?.phrases;
    if (!ph || !ph.total) continue;
    phraseTotal += ph.total;
    translated += ph.translated || 0;
    approved += ph.approved || 0;
  }
  if (phraseTotal === 0) {
    return {
      phraseTotal: 0,
      translationPercent: null,
      approvalPercent: null,
    };
  }
  return {
    phraseTotal,
    translationPercent: Math.round((100 * translated) / phraseTotal),
    approvalPercent: Math.round((100 * approved) / phraseTotal),
  };
}

async function run() {
  console.log(`\n${c.bold}${c.cyan}=== Crowdin translation status (static JSON) ===${c.reset}\n`);

  if (!TOKEN || !PROJECT_ID) {
    console.error(
      `${c.red}Missing CROWDIN_TRANSLATION_STATUS_API_KEY (or CROWDIN_PERSONAL_TOKEN) or CROWDIN_PROJECT_ID${c.reset}`,
    );
    process.exit(1);
  }

  const { crowdinLanguageId, label } = await resolveCrowdinLanguageId();
  console.log(
    `${c.gray}Target language:${c.reset} ${c.white}${TARGET_LOCALE}${c.reset} ${c.gray}(Crowdin language id ${crowdinLanguageId}, ${label})${c.reset}`,
  );

  console.log(`${c.blue}Fetching${c.reset} file progress from Crowdin...`);
  const progressByFileId = await fetchAllFileProgress(crowdinLanguageId);
  console.log(`  ${c.gray}Progress rows for ${progressByFileId.size} files.${c.reset}`);

  console.log(`${c.blue}Fetching${c.reset} Crowdin source file list...`);
  const crowdinFiles = await listAllProjectFiles();

  const mdxPaths = (
    await Array.fromAsync(globAsync('content/en/**/*.mdx', { cwd: process.cwd() }))
  ).sort();

  /** In-memory only — used to aggregate each route; not written to JSON. */
  /** @type {Record<string, object>} */
  const progressByRepoPath = {};
  const missingCrowdin = [];
  const missingProgress = [];

  for (const rel of mdxPaths) {
    const repoPath = rel.replace(/\\/g, '/');
    const { file } = findCrowdinFile(repoPath, crowdinFiles);
    if (!file?.id) {
      missingCrowdin.push(repoPath);
      progressByRepoPath[repoPath] = { error: 'not_in_crowdin' };
      continue;
    }
    const prog = progressByFileId.get(file.id);
    if (!prog) {
      missingProgress.push(repoPath);
      progressByRepoPath[repoPath] = { error: 'no_progress_row' };
      continue;
    }
    const phrasePct = pctFromPhrases(prog.phrases);
    progressByRepoPath[repoPath] = {
      phrases: prog.phrases,
      translationPercent: phrasePct?.translationPercent ?? prog.translationProgress,
      approvalPercent: phrasePct?.approvalPercent ?? prog.approvalProgress,
    };
  }

  /** @type {Record<string, Record<string, { translationPercent: number|null, approvalPercent: number|null, showUnreviewedNotice: boolean }>>} */
  const routes = {};

  const guidePaths = await Array.fromAsync(
    globAsync('content/en/guides/*.mdx', { cwd: process.cwd() }),
  );
  for (const rel of guidePaths.sort()) {
    const full = path.join(process.cwd(), rel);
    const raw = fs.readFileSync(full, 'utf-8');
    const { data, content } = matter(raw);
    const slug = data.slug || path.basename(rel, '.mdx');
    const guideRepoPath = rel.replace(/\\/g, '/');

    const itemSlugs = extractChecklistItemSlugs(content);
    const componentPaths = [guideRepoPath];
    for (const itemSlug of itemSlugs) {
      componentPaths.push(`content/en/checklist-items/${itemSlug}.mdx`);
    }

    const progRows = [];
    for (const p of componentPaths) {
      const entry = progressByRepoPath[p];
      if (!entry || entry.error) continue;
      progRows.push(entry);
    }

    const agg = aggregateProgressRows(
      progRows.map((e) => ({ phrases: e.phrases })),
    );
    const showUnreviewedNotice =
      agg.approvalPercent != null && agg.approvalPercent < UNREVIEWED_NOTICE_MAX_APPROVAL;

    routes[slug] = {
      [TARGET_LOCALE]: {
        translationPercent: agg.translationPercent,
        approvalPercent: agg.approvalPercent,
        showUnreviewedNotice,
      },
    };
  }

  const pagePaths = await Array.fromAsync(
    globAsync('content/en/pages/*.mdx', { cwd: process.cwd() }),
  );
  for (const rel of pagePaths.sort()) {
    const raw = fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
    const { data } = matter(raw);
    const slug = data.slug || path.basename(rel, '.mdx');
    const repoPath = rel.replace(/\\/g, '/');
    const entry = progressByRepoPath[repoPath];
    const progRows = entry && !entry.error ? [entry] : [];
    const agg = aggregateProgressRows(progRows.map((e) => ({ phrases: e.phrases })));
    const showUnreviewedNotice =
      agg.approvalPercent != null && agg.approvalPercent < UNREVIEWED_NOTICE_MAX_APPROVAL;

    routes[slug] = {
      [TARGET_LOCALE]: {
        translationPercent: agg.translationPercent,
        approvalPercent: agg.approvalPercent,
        showUnreviewedNotice,
      },
    };
  }

  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    thresholds: {
      unreviewedNoticeMaxApprovalPercent: UNREVIEWED_NOTICE_MAX_APPROVAL,
    },
    routes,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');

  console.log(`\n${c.green}Wrote${c.reset} ${c.white}${OUT_FILE}${c.reset}`);
  console.log(
    `  ${c.gray}MDX files:${c.reset} ${mdxPaths.length}  ${c.gray}routes:${c.reset} ${Object.keys(routes).length}`,
  );
  if (missingCrowdin.length) {
    console.log(
      `\n${c.yellow}Warning:${c.reset} ${missingCrowdin.length} MDX paths not matched in Crowdin (aggregation may be incomplete for some routes).`,
    );
  }
  if (missingProgress.length) {
    console.log(
      `${c.yellow}Warning:${c.reset} ${missingProgress.length} source files had no progress row in Crowdin.`,
    );
  }

  const flagged = Object.entries(routes).filter(
    ([, byLang]) => byLang[TARGET_LOCALE]?.showUnreviewedNotice,
  );
  console.log(
    `\n${c.gray}Routes with unreviewed notice (< ${UNREVIEWED_NOTICE_MAX_APPROVAL}% approved):${c.reset} ${c.bold}${flagged.length}${c.reset}`,
  );
  for (const [s] of flagged.slice(0, 25)) {
    console.log(`  ${c.dim}${s}${c.reset}`);
  }
  if (flagged.length > 25) {
    console.log(`  ${c.dim}... +${flagged.length - 25} more${c.reset}`);
  }
  console.log();
}

run().catch((err) => {
  console.error(`${c.red}Fatal:${c.reset}`, err.message);
  process.exit(1);
});
