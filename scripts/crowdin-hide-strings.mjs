#!/usr/bin/env node

/**
 * crowdin-hide-untranslatable.mjs
 *
 * Extracts JSX attribute values and frontmatter fields from MDX source files
 * that should NOT be translated, then hides matching strings in Crowdin.
 *
 * This includes:
 *   - JSX attributes: slug, type, size, level, mode, alignment, target, variant, icon, href, src, className
 *   - Frontmatter arrays: relatedGuides, titleBadges
 *   - Frontmatter scalars: slug, type, date, firstPublished, lastUpdated, image, imageOverride, url, source, tags
 *
 * Usage:
 *   yarn crowdin:hide-strings           (dry run — reads CROWDIN_* from .env)
 *   yarn crowdin:hide-strings --apply   (hides strings and clears stray translations)
 *
 * Add to package.json:
 *   "scripts": {
 *     "crowdin:hide-strings": "node scripts/crowdin-hide-slugs.mjs",
 *     "crowdin:hide-strings:apply": "node scripts/crowdin-hide-slugs.mjs --apply",
 *     "crowdin:upload": "crowdin upload sources && node scripts/crowdin-hide-slugs.mjs --apply"
 *   }
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

// Load .env file if present (Node 22+ built-in)
try { process.loadEnvFile(); } catch {}

// --- Colors ---
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

// --- Config ---
const TOKEN = process.env.CROWDIN_PERSONAL_TOKEN;
const PROJECT_ID = process.env.CROWDIN_PROJECT_ID;
const CONTENT_DIR = "./content/en"; // adjust if your source dir is different
const DRY_RUN = !process.argv.includes("--apply");
const BASE_URL = "https://api.crowdin.com/api/v2";

if (!TOKEN || !PROJECT_ID) {
  console.error(`
${c.red}${c.bold}Error:${c.reset} Missing environment variables.

Set these before running:
  ${c.cyan}CROWDIN_PERSONAL_TOKEN${c.reset}  ${c.gray}← https://crowdin.com/settings#api-key${c.reset}
  ${c.cyan}CROWDIN_PROJECT_ID${c.reset}      ${c.gray}← Project Settings > API${c.reset}

Example:
  ${c.dim}CROWDIN_PERSONAL_TOKEN=xxx CROWDIN_PROJECT_ID=123 node scripts/crowdin-hide-slugs.mjs${c.reset}
`);
  process.exit(1);
}

// --- Step 1: Extract untranslatable values from MDX files ---

// Frontmatter scalar fields whose values should not be translated
const UNTRANSLATABLE_FRONTMATTER_SCALARS = [
  "slug",           // URL identifiers
  "type",           // enum: major, minor, info, etc.
  "date",           // ISO dates
  "firstPublished", // ISO dates
  "lastUpdated",    // ISO dates
  "image",          // file paths
  "imageOverride",  // file paths
  "url",            // external URLs
  "source",         // publication/author attribution
  "tags",           // comma-separated tag identifiers
];

// JSX attributes whose values should not be translated
const UNTRANSLATABLE_ATTRIBUTES = [
  "slug", // ChecklistItem, Section - references to other content
  "type", // Alert - info, warning, success, default, error
  "size", // Button, ImageEmbed - xs, sm, md, lg, xl
  "level", // RiskLevel - everyone, medium, high
  "mode", // RiskLevel - single_line, for_you, for_you_if
  "alignment", // ImageEmbed, Button - left, center, right
  "target", // links - _self, _blank
  "variant", // Button - outline, solid, etc.
  "icon", // Button - icon names like IoCloudDownloadOutline
  "href", // URLs and internal paths
  "src", // image/video source paths
  "className", // CSS class names
];

function walkDir(dir) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files = files.concat(walkDir(full));
    } else if (extname(full) === ".mdx" || extname(full) === ".md") {
      files.push(full);
    }
  }
  return files;
}

function extractUntranslatableStrings(contentDir) {
  const strings = new Map(); // value -> Set of sources (for debugging)
  const files = walkDir(contentDir);

  // Build regex for all untranslatable attributes
  // Match attr="value" and attr='value' in JSX/HTML attributes
  const attrPattern = UNTRANSLATABLE_ATTRIBUTES.join("|");
  const attrRegex = new RegExp(`\\b(${attrPattern})=["']([^"']+)["']`, "g");

  // Frontmatter array patterns (relatedGuides, titleBadges, etc.)
  const frontmatterArrayRegex = /^(relatedGuides|titleBadges):\s*\n((?:\s+-\s+.+\n?)+)/gm;
  const arrayItemRegex = /^\s+-\s+(.+)$/gm;

  const scalarFieldPattern = UNTRANSLATABLE_FRONTMATTER_SCALARS.join("|");
  const frontmatterScalarRegex = new RegExp(`^(${scalarFieldPattern}):\\s*["']?(.+?)["']?\\s*$`, "gm");

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const fileName = basename(file, extname(file));

    // Extract JSX attribute values
    attrRegex.lastIndex = 0;
    let match;
    while ((match = attrRegex.exec(content)) !== null) {
      const attrName = match[1];
      const value = match[2];
      if (!strings.has(value)) {
        strings.set(value, new Set());
      }
      strings.get(value).add(JSON.stringify({ attr: attrName, file: fileName }));
    }

    // Extract frontmatter scalar values
    frontmatterScalarRegex.lastIndex = 0;
    let scalarMatch;
    while ((scalarMatch = frontmatterScalarRegex.exec(content)) !== null) {
      const fieldName = scalarMatch[1];
      const value = scalarMatch[2].trim();
      if (value && !value.startsWith("#")) {
        if (!strings.has(value)) {
          strings.set(value, new Set());
        }
        strings.get(value).add(JSON.stringify({ attr: fieldName, file: fileName }));
      }
    }

    // Extract frontmatter array values
    frontmatterArrayRegex.lastIndex = 0;
    let fmMatch;
    while ((fmMatch = frontmatterArrayRegex.exec(content)) !== null) {
      const fieldName = fmMatch[1];
      const arrayContent = fmMatch[2];
      arrayItemRegex.lastIndex = 0;
      let itemMatch;
      while ((itemMatch = arrayItemRegex.exec(arrayContent)) !== null) {
        const value = itemMatch[1].trim();
        if (value && !value.startsWith("#")) {
          if (!strings.has(value)) {
            strings.set(value, new Set());
          }
          strings.get(value).add(JSON.stringify({ attr: fieldName, file: fileName }));
        }
      }
    }
  }

  return strings;
}

// --- Step 2: Crowdin API helpers ---

async function crowdinFetch(path, { method = "GET", body } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };

  while (true) {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });

    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get("Retry-After") || "1");
      console.log(`  ${c.yellow}Rate limited — waiting ${retryAfter}s...${c.reset}`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (method === "DELETE" && (res.status === 204 || res.status === 404)) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Crowdin API ${res.status}: ${text}`);
    }
    return res.status === 204 ? null : res.json();
  }
}

const crowdinGet    = (path)         => crowdinFetch(path);
const crowdinPatch  = (path, data)   => crowdinFetch(path, { method: "PATCH",  body: data });
const crowdinDelete = (path)         => crowdinFetch(path, { method: "DELETE" });

// --- Step 3: Find and hide strings / clear translations in Crowdin ---

// Run up to `concurrency` async tasks at once
async function runConcurrent(concurrency, tasks) {
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

async function getTargetLanguages() {
  const data = await crowdinGet(`/projects/${PROJECT_ID}`);
  return data.data.targetLanguageIds || [];
}

// Fetch and delete all existing translations for a string in a given language.
// Returns count of deleted translations.
async function clearTranslationsForString(stringId, languageId) {
  const data = await crowdinGet(
    `/projects/${PROJECT_ID}/translations?stringId=${stringId}&languageId=${languageId}&limit=100`
  );
  const translations = data.data.map((t) => t.data);
  for (const translation of translations) {
    await crowdinDelete(`/projects/${PROJECT_ID}/translations/${translation.id}`);
  }
  return translations.length;
}

async function getAllStrings() {
  const strings = [];
  let offset = 0;
  const limit = 500;

  while (true) {
    const data = await crowdinGet(
      `/projects/${PROJECT_ID}/strings?limit=${limit}&offset=${offset}`
    );
    strings.push(...data.data);
    if (data.data.length < limit) break;
    offset += limit;
  }

  return strings;
}

// Helper to format source info from the stringsMap
function formatSource(sourcesSet) {
  const sources = [...sourcesSet].map((s) => JSON.parse(s));
  // Group by attribute
  const byAttr = {};
  for (const { attr, file } of sources) {
    if (!byAttr[attr]) byAttr[attr] = [];
    byAttr[attr].push(file);
  }

  const parts = [];
  for (const [attr, files] of Object.entries(byAttr)) {
    const uniqueFiles = [...new Set(files)];
    if (uniqueFiles.length <= 2) {
      parts.push(`${attr} in ${uniqueFiles.join(", ")}`);
    } else {
      parts.push(`${attr} in ${uniqueFiles.slice(0, 2).join(", ")} +${uniqueFiles.length - 2}`);
    }
  }
  return parts.join(" | ");
}

async function run() {
  console.log(`\n${c.bold}${c.cyan}=== Crowdin Untranslatable String Hider ===${c.reset}\n`);

  // Extract untranslatable strings from source
  console.log(`${c.blue}Scanning${c.reset} ${c.white}${CONTENT_DIR}${c.reset} for untranslatable attribute values...`);
  console.log(`${c.gray}JSX attributes: ${UNTRANSLATABLE_ATTRIBUTES.join(", ")}${c.reset}`);
  console.log(`${c.gray}Frontmatter scalars: ${UNTRANSLATABLE_FRONTMATTER_SCALARS.join(", ")}${c.reset}\n`);

  const stringsMap = extractUntranslatableStrings(CONTENT_DIR);
  const untranslatableValues = new Set(stringsMap.keys());

  console.log(`${c.green}Found${c.reset} ${c.bold}${untranslatableValues.size}${c.reset} unique untranslatable values.\n`);

  // Show a sample of what was found (grouped by type for clarity)
  if (process.argv.includes("--verbose")) {
    console.log(`${c.bold}Extracted values:${c.reset}`);
    let count = 0;
    for (const [value, sources] of stringsMap) {
      if (count++ < 50) {
        const sourceInfo = formatSource(sources);
        console.log(`  ${c.yellow}"${value}"${c.reset} ${c.gray}← ${sourceInfo}${c.reset}`);
      }
    }
    if (stringsMap.size > 50) {
      console.log(`  ${c.gray}... and ${stringsMap.size - 50} more${c.reset}\n`);
    } else {
      console.log();
    }
  }

  // Fetch all strings from Crowdin
  console.log(`${c.blue}Fetching${c.reset} strings from Crowdin project ${c.white}${PROJECT_ID}${c.reset}...`);
  const allStrings = await getAllStrings();
  console.log(`${c.green}Found${c.reset} ${c.bold}${allStrings.length}${c.reset} total strings in project.\n`);

  // Categorize all Crowdin strings
  const toHide = [];
  const alreadyHidden = [];
  const toUnhide = []; // hidden in Crowdin but no longer in our untranslatable set

  for (const item of allStrings) {
    const { id, text, isHidden } = item.data;
    if (untranslatableValues.has(text)) {
      if (isHidden) {
        alreadyHidden.push({ id, text });
      } else {
        toHide.push({ id, text });
      }
    } else if (isHidden) {
      // Was hidden (likely by a previous script run) but is no longer untranslatable
      toUnhide.push({ id, text });
    }
  }

  const totalFound = toHide.length + alreadyHidden.length;
  const notInCrowdin = untranslatableValues.size - totalFound;

  console.log(`${c.bold}Summary:${c.reset}`);
  console.log(`  ${c.gray}Matched in Crowdin:${c.reset}  ${c.bold}${totalFound}${c.reset}`);
  console.log(`  ${c.gray}Already hidden:${c.reset}      ${c.green}${alreadyHidden.length}${c.reset}`);
  console.log(`  ${c.gray}Need to hide:${c.reset}        ${toHide.length > 0 ? c.yellow : c.green}${toHide.length}${c.reset}`);
  console.log(`  ${c.gray}Need to unhide:${c.reset}      ${toUnhide.length > 0 ? c.magenta : c.green}${toUnhide.length}${c.reset}`);
  console.log(`  ${c.gray}Not in Crowdin:${c.reset}      ${c.dim}${notInCrowdin}${c.reset}\n`);

  const allMatched = [...toHide, ...alreadyHidden];

  // --- Unhide strings that are no longer untranslatable ---
  if (toUnhide.length > 0) {
    console.log(`${c.bold}${DRY_RUN ? "Would unhide" : "Unhiding"} ${toUnhide.length} string(s) no longer in the untranslatable set:${c.reset}\n`);

    for (const { id, text } of toUnhide) {
      if (DRY_RUN) {
        console.log(`  ${c.magenta}○${c.reset} ${c.white}"${text}"${c.reset}`);
      } else {
        try {
          await crowdinPatch(`/projects/${PROJECT_ID}/strings/${id}`, [
            { op: "replace", path: "/isHidden", value: false },
          ]);
          console.log(`  ${c.magenta}✓${c.reset} ${c.white}"${text}"${c.reset}`);
        } catch (err) {
          console.log(`  ${c.red}✗${c.reset} ${c.white}"${text}"${c.reset} ${c.red}— ${err.message}${c.reset}`);
        }
      }
    }

    console.log();
  }

  // --- Hide strings that should be hidden ---
  if (toHide.length > 0) {
    console.log(`${c.bold}${DRY_RUN ? "Would hide" : "Hiding"} ${toHide.length} strings:${c.reset}\n`);

    for (const { id, text } of toHide) {
      const sourceInfo = stringsMap.has(text) ? formatSource(stringsMap.get(text)) : "";

      if (DRY_RUN) {
        console.log(`  ${c.yellow}○${c.reset} ${c.white}"${text}"${c.reset} ${c.gray}← ${sourceInfo}${c.reset}`);
      } else {
        try {
          await crowdinPatch(`/projects/${PROJECT_ID}/strings/${id}`, [
            { op: "replace", path: "/isHidden", value: true },
          ]);
          console.log(`  ${c.green}✓${c.reset} ${c.white}"${text}"${c.reset} ${c.gray}← ${sourceInfo}${c.reset}`);
        } catch (err) {
          console.log(`  ${c.red}✗${c.reset} ${c.white}"${text}"${c.reset} ${c.red}— ${err.message}${c.reset}`);
        }
      }
    }

    console.log();
  }

  if (allMatched.length === 0 && toUnhide.length === 0) {
    console.log(`${c.green}${c.bold}✓ Nothing to do!${c.reset}\n`);
    return;
  }

  console.log();

  // --- Pass 2: Clear any existing translations for all matched strings ---
  console.log(`${c.bold}${DRY_RUN ? "Would clear" : "Clearing"} translations for ${allMatched.length} matched strings across all languages:${c.reset}\n`);

  if (DRY_RUN) {
    console.log(`  ${c.gray}(skipped in dry run — run with --apply to clear translations)${c.reset}\n`);
  } else {
    const languages = await getTargetLanguages();
    console.log(`  ${c.gray}Target languages: ${languages.join(", ")}${c.reset}\n`);

    let totalCleared = 0;
    const clearTasks = [];
    for (const lang of languages) {
      for (const { id, text } of allMatched) {
        clearTasks.push(async () => {
          try {
            const count = await clearTranslationsForString(id, lang);
            if (count > 0) {
              console.log(`  ${c.green}✓${c.reset} [${lang}] cleared ${count} translation(s) for ${c.white}"${text}"${c.reset}`);
              totalCleared += count;
            }
          } catch (err) {
            console.log(`  ${c.red}✗${c.reset} [${lang}] ${c.white}"${text}"${c.reset} ${c.red}— ${err.message}${c.reset}`);
          }
        });
      }
    }
    await runConcurrent(8, clearTasks);

    if (totalCleared === 0) {
      console.log(`  ${c.gray}No existing translations found to clear.${c.reset}\n`);
    } else {
      console.log(`\n${c.green}${c.bold}✓ Cleared ${totalCleared} translation(s) total.${c.reset}\n`);
    }
  }

  if (DRY_RUN) {
    console.log(`${c.yellow}${c.bold}Dry run complete.${c.reset} Run with ${c.cyan}--apply${c.reset} to hide strings and clear translations.\n`);
  } else {
    console.log(`${c.green}${c.bold}✓ Done!${c.reset} Hidden ${c.bold}${toHide.length}${c.reset} strings, cleared existing translations.\n`);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
