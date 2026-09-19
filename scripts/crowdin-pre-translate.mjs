#!/usr/bin/env node

/**
 * Triggers Crowdin pre-translation for specific source files (by Crowdin file id),
 * scoped to the files you pass in — so the whole project is not re-processed.
 *
 * Typical CI usage: pass repo paths changed in the merge (content/en/..., messages/en.json).
 *
 * Behavior flags (env):
 *   CROWDIN_TRANSLATE_UNTRANSLATED_ONLY  (default "false")
 *     - "true": only empty targets (new strings). Skips strings that already have any translation,
 *       including stale pre-translations after English edits.
 *     - "false": allows refreshing existing non-approved / stale suggestions in those files.
 *
 *   CROWDIN_SKIP_APPROVED_TRANSLATIONS  (default "true")
 *     - Sent to POST /pre-translations. Official Crowdin docs say this applies to TM only.
 *       For AI pre-translation, verify in Crowdin whether it is honored; if not, use
 *       labels (CROWDIN_EXCLUDE_LABEL_IDS) for strings that must never be overwritten.
 *
 * Required: CROWDIN_PERSONAL_TOKEN, CROWDIN_PROJECT_ID, CROWDIN_AI_PROMPT_ID
 *
 * Optional: CROWDIN_LANGUAGE_IDS=comma-separated (default: all project target languages)
 *           CROWDIN_EXCLUDE_LABEL_IDS=comma-separated numeric label ids
 *           CHANGED_FILES = newline-separated repo-relative paths (or pass paths as argv after --)
 */

try {
  process.loadEnvFile();
} catch {}

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
};

const TOKEN = process.env.CROWDIN_PERSONAL_TOKEN;
const PROJECT_ID = process.env.CROWDIN_PROJECT_ID;
const BASE_URL = "https://api.crowdin.com/api/v2";

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

function parseBool(v, defaultVal) {
  if (v === undefined || v === "") return defaultVal;
  return !/^(0|false|no|off)$/i.test(String(v));
}

const AI_PROMPT_ID = process.env.CROWDIN_AI_PROMPT_ID
  ? parseInt(process.env.CROWDIN_AI_PROMPT_ID, 10)
  : null;

const translateUntranslatedOnly = parseBool(
  process.env.CROWDIN_TRANSLATE_UNTRANSLATED_ONLY,
  false
);
const skipApprovedTranslations = parseBool(
  process.env.CROWDIN_SKIP_APPROVED_TRANSLATIONS,
  true
);

function parseIdList(s) {
  if (!s || !String(s).trim()) return [];
  return String(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => parseInt(x, 10))
    .filter((n) => !Number.isNaN(n));
}

const EXCLUDE_LABEL_IDS = parseIdList(process.env.CROWDIN_EXCLUDE_LABEL_IDS);

async function crowdinFetch(path, { method = "GET", body } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };

  while (true) {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get("Retry-After") || "1");
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

const crowdinGet = (path) => crowdinFetch(path);
const crowdinPost = (path, data) => crowdinFetch(path, { method: "POST", body: data });

async function getDefaultBranchId() {
  const data = await crowdinGet(`/projects/${PROJECT_ID}/branches?limit=500`);
  const list = data.data || [];
  if (list.length === 0) return null;
  const names = list.map((b) => b.data?.name);
  for (const prefer of ["main", "master"]) {
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
      `/projects/${PROJECT_ID}/files?limit=${limit}&offset=${offset}${query}`
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

/**
 * Merge branch-scoped (recursive) and project-level file lists. Crowdin paths may include a
 * version-branch prefix (e.g. /main/content/...) while repo paths are content/en/...
 */
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
    if (VERBOSE) {
      console.log(
        `${c.gray}Using Crowdin branch: ${c.white}${branch.name}${c.gray} (id ${branch.id})${c.reset}`
      );
    }
    merge(await paginateFiles(`&branchId=${branch.id}&recursion=1`));
  } else if (VERBOSE) {
    console.log(`${c.gray}No Crowdin version branch — listing project files without branchId.${c.reset}`);
  }

  merge(await paginateFiles(""));

  return [...byId.values()];
}

/**
 * Match repo-relative path to a Crowdin file row. Tries exact path keys, then unique suffix match
 * (handles /main/content/en/... vs content/en/...).
 */
function findCrowdinFile(repoPath, files) {
  const want = normalizePath(repoPath).replace(/^\/+/, "");

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
    const noLead = p.replace(/^\/+/, "");
    byKey.set(p, f);
    byKey.set(noLead, f);
  }

  for (const k of exactKeys) {
    if (byKey.has(k)) {
      return { file: byKey.get(k), how: "exact" };
    }
  }

  const candidates = files.filter((f) => {
    const p = normalizePath(f.path || f.name || "").replace(/^\/+/, "");
    return p === want || p.endsWith(`/${want}`) || p === want;
  });

  if (candidates.length === 1) {
    return { file: candidates[0], how: "suffix" };
  }
  if (candidates.length > 1) {
    const exact = candidates.find(
      (f) => normalizePath(f.path || "").replace(/^\/+/, "") === want
    );
    if (exact) {
      return { file: exact, how: "suffix-exact" };
    }
    candidates.sort(
      (a, b) =>
        normalizePath(a.path || "").length - normalizePath(b.path || "").length
    );
    return { file: candidates[0], how: "suffix-shortest" };
  }

  return { file: null, how: null };
}

function logMissHints(repoPath, files) {
  const base = repoPath.split("/").pop() || repoPath;
  const needle = base.replace(/\.[^.]+$/, "");
  const hits = files
    .map((f) => normalizePath(f.path || ""))
    .filter((p) => p.includes(base) || p.includes(needle))
    .slice(0, 12);

  console.log(`${c.gray}Hint: Crowdin may not have imported this file yet, or the path differs.${c.reset}`);
  if (hits.length) {
    console.log(`${c.gray}Crowdin paths mentioning this filename (${hits.length} shown):${c.reset}`);
    for (const h of hits) {
      console.log(`  ${c.dim}${h}${c.reset}`);
    }
  } else {
    console.log(
      `${c.gray}No Crowdin file paths contain "${base}". Total source files seen: ${c.bold}${files.length}${c.reset}${c.gray}.${c.reset}`
    );
  }
  console.log();
}

/** Repo path like content/en/x.mdx -> Crowdin path /content/en/x.mdx */
function repoPathToCrowdinPath(repoPath) {
  const p = repoPath.replace(/^\/+/, "");
  return p.startsWith("/") ? p : `/${p}`;
}

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function collectInputPaths() {
  const fromEnv = process.env.CHANGED_FILES;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const dash = process.argv.indexOf("--");
  if (dash !== -1) {
    return process.argv.slice(dash + 1).map(normalizePath).filter(Boolean);
  }
  return [];
}

async function getProjectMeta() {
  const data = await crowdinGet(`/projects/${PROJECT_ID}`);
  const d = data.data;
  return {
    sourceLanguageId: d.sourceLanguageId,
    targetLanguageIds: d.targetLanguageIds || [],
  };
}

function resolveLanguageIds(projectMeta) {
  const raw = process.env.CROWDIN_LANGUAGE_IDS;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const src = projectMeta.sourceLanguageId;
  return (projectMeta.targetLanguageIds || []).filter((id) => id !== src);
}

async function run() {
  console.log(`\n${c.bold}${c.cyan}=== Crowdin scoped pre-translate ===${c.reset}\n`);

  if (!TOKEN || !PROJECT_ID) {
    console.error(`${c.red}Missing CROWDIN_PERSONAL_TOKEN or CROWDIN_PROJECT_ID${c.reset}`);
    process.exit(1);
  }

  if (!AI_PROMPT_ID) {
    console.error(`${c.red}Missing CROWDIN_AI_PROMPT_ID.${c.reset}`);
    console.error(`${c.gray}In Crowdin: open your project → Settings → AI (Crowdin AI).${c.reset}`);
    console.error(`${c.gray}Open the prompt you use for pre-translation: the numeric id is in the URL (…/ai-prompts/12345) or in the API: GET /api/v2/projects/{projectId}/ai-prompts${c.reset}\n`);
    process.exit(1);
  }

  const repoPaths = collectInputPaths().map(normalizePath);
  if (repoPaths.length === 0) {
    console.log(`${c.yellow}No source files to pre-translate (empty CHANGED_FILES / no paths).${c.reset}\n`);
    process.exit(0);
  }

  console.log(`${c.gray}Repo paths (${repoPaths.length}):${c.reset}`);
  for (const p of repoPaths.slice(0, 30)) {
    console.log(`  ${c.dim}${p}${c.reset}`);
  }
  if (repoPaths.length > 30) {
    console.log(`  ${c.dim}... +${repoPaths.length - 30} more${c.reset}`);
  }
  console.log();

  console.log(`${c.blue}Fetching${c.reset} Crowdin file list...`);
  const crowdinFiles = await listAllProjectFiles();
  if (VERBOSE) {
    console.log(`${c.gray}Source files in Crowdin (deduped): ${crowdinFiles.length}${c.reset}\n`);
  }

  const fileIds = [];
  const missing = [];
  for (const rp of repoPaths) {
    const { file, how } = findCrowdinFile(rp, crowdinFiles);
    if (file && file.id) {
      fileIds.push(file.id);
      if (how && how !== "exact") {
        console.log(
          `${c.gray}Resolved ${rp} → ${file.path} (${how})${c.reset}`
        );
      }
    } else {
      missing.push(rp);
    }
  }

  if (missing.length) {
    console.log(`${c.yellow}Warning: no Crowdin file id for:${c.reset}`);
    for (const m of missing) {
      console.log(`  ${m}`);
      logMissHints(m, crowdinFiles);
    }
  }

  if (fileIds.length === 0) {
    console.log(`${c.yellow}No matching Crowdin files — nothing to do.${c.reset}\n`);
    process.exit(0);
  }

  const projectMeta = await getProjectMeta();
  const languageIds = resolveLanguageIds(projectMeta);
  if (languageIds.length === 0) {
    console.error(`${c.red}No target languages (check project or CROWDIN_LANGUAGE_IDS).${c.reset}`);
    process.exit(1);
  }

  const body = {
    languageIds,
    fileIds,
    method: "ai",
    aiPromptId: AI_PROMPT_ID,
    priority: "normal",
    translateUntranslatedOnly,
    skipApprovedTranslations,
    duplicateTranslations: false,
    autoApproveOption: "none",
    sourceLanguageId: projectMeta.sourceLanguageId,
  };

  if (EXCLUDE_LABEL_IDS.length) {
    body.excludeLabelIds = EXCLUDE_LABEL_IDS;
  }

  console.log(`${c.bold}Request:${c.reset}`);
  console.log(`  ${c.gray}method:${c.reset} ai`);
  console.log(`  ${c.gray}languageIds:${c.reset} ${languageIds.join(", ")}`);
  console.log(`  ${c.gray}fileIds:${c.reset} ${fileIds.join(", ")} (${fileIds.length} files)`);
  console.log(
    `  ${c.gray}translateUntranslatedOnly:${c.reset} ${translateUntranslatedOnly}  ${c.gray}skipApprovedTranslations:${c.reset} ${skipApprovedTranslations}`
  );
  if (EXCLUDE_LABEL_IDS.length) {
    console.log(`  ${c.gray}excludeLabelIds:${c.reset} ${EXCLUDE_LABEL_IDS.join(", ")}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log(`${c.yellow}Dry run — not calling API.${c.reset}\n`);
    console.log(JSON.stringify(body, null, 2));
    process.exit(0);
  }

  console.log(`${c.blue}POST${c.reset} /projects/${PROJECT_ID}/pre-translations`);
  const res = await crowdinPost(`/projects/${PROJECT_ID}/pre-translations`, body);
  const id = res?.data?.identifier || res?.data?.id;
  const status = res?.data?.status;
  console.log(`${c.green}✓${c.reset} Pre-translation started${id ? ` (id: ${c.white}${id}${c.reset})` : ""}${status ? ` status=${status}` : ""}\n`);
}

run().catch((err) => {
  console.error(`${c.red}Fatal:${c.reset}`, err.message);
  process.exit(1);
});
