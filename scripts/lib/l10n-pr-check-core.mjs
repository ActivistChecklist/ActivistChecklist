/**
 * Checks for Crowdin translation PRs (l10n_* branches), run by the l10n_check
 * job in .github/workflows/pr-checks.yml through scripts/l10n-pr-check.mjs.
 *
 * Those PRs are large, generated, and carry text from translators we do not vet
 * one by one, and the full test/build suite is skipped for them. So the job
 * holds them to the only change a translation sync can legitimately make:
 * translated text, at the paths crowdin.yml writes, carrying no markup or
 * script URL that the English source does not already have.
 */

import yaml from 'js-yaml';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Turn one crowdin.yml path pattern into a regex source. Throws on any
// placeholder we do not know, so a crowdin.yml change that adds one fails the
// job loudly instead of silently widening or narrowing what is allowed.
function patternToRegex(pattern, fileNameRegex) {
  const tokens = pattern.replace(/^\//, '').split(/(\*\*\/|%[a-z_]+%|\*)/);
  return tokens
    .map((tok) => {
      if (tok === '**/') return '(?:[^/]+/)*';
      if (tok === '*') return '[^/]*';
      if (tok === '%two_letters_code%') return '(?<locale>[a-z]{2})';
      if (tok === '%original_file_name%') return fileNameRegex;
      if (/^%[a-z_]+%$/.test(tok)) throw new Error(`Unsupported crowdin.yml placeholder ${tok}`);
      return escapeRegex(tok);
    })
    .join('');
}

/**
 * Read crowdin.yml and return one { source, translation } regex pair per
 * `files` entry. A path is a Crowdin-managed translation when it matches a
 * `translation` regex and does not also match that entry's `source` regex
 * (so content/en/** and messages/en.json are never allowed).
 */
export function translationPatterns(crowdinYml) {
  const files = yaml.load(crowdinYml)?.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('crowdin.yml has no `files` entries');
  }
  return files.map(({ source, translation }) => {
    if (typeof source !== 'string' || typeof translation !== 'string') {
      throw new Error('Every crowdin.yml `files` entry needs a source and a translation');
    }
    if (!translation.includes('%two_letters_code%')) {
      throw new Error(`crowdin.yml translation ${translation} has no %two_letters_code%`);
    }
    // %original_file_name% stands for a file the source glob matched, so it
    // may only take the shape of the source pattern's last segment.
    const sourceBase = source.split('/').pop();
    const fileNameRegex = patternToRegex(sourceBase, null);
    return {
      source: new RegExp(`^${patternToRegex(source, null)}$`),
      translation: new RegExp(`^${patternToRegex(translation, fileNameRegex)}$`, 'd'),
    };
  });
}

/**
 * Parse `git diff --raw -z --no-renames` output into
 * [{ status, srcMode, dstMode, path }].
 */
export function parseRawDiff(output) {
  const parts = output.split('\0');
  const changes = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i].replace(/^\n/, '');
    if (!meta) break;
    const [srcMode, dstMode, , , status] = meta.replace(/^:/, '').split(' ');
    changes.push({ status: status[0], srcMode, dstMode, path: parts[i + 1] });
  }
  return changes;
}

// Crowdin's source language. crowdin.yml does not name it; it is the locale
// segment of each `source` pattern.
const SOURCE_LOCALE = 'en';

/**
 * If Crowdin manages `filePath`, return { locale, sourcePath }: the locale it
 * translates into and the English file it was generated from. Otherwise null.
 */
export function translationTarget(filePath, patterns) {
  for (const { source, translation } of patterns) {
    const m = translation.exec(filePath);
    if (!m || source.test(filePath)) continue;
    const [start, end] = m.indices.groups.locale;
    const sourcePath = filePath.slice(0, start) + SOURCE_LOCALE + filePath.slice(end);
    if (source.test(sourcePath)) return { locale: m.groups.locale, sourcePath };
  }
  return null;
}

/**
 * Every change must be a regular file at a Crowdin translation path.
 * Returns [{ path, reason }] for the ones that are not.
 */
export function checkChangedPaths(changes, patterns) {
  const violations = [];
  for (const { status, dstMode, path } of changes) {
    if (!translationTarget(path, patterns)) {
      violations.push({ path, reason: 'not a Crowdin translation path (see crowdin.yml)' });
    } else if (status !== 'D' && dstMode !== '100644') {
      violations.push({ path, reason: `unexpected file mode ${dstMode}` });
    }
  }
  return violations;
}

// ─── Markup comparison ───────────────────────────────────────────

// A tag opens with `<` immediately followed by a letter, as in the HTML
// tokenizer. The attribute text runs to the next `>`; values are dropped and
// only attribute names kept, since translators may legitimately translate a
// title or alt text but have no reason to add an attribute.
const TAG = /<([A-Za-z][\w.:-]*)([^>]*)/g;
const QUOTED = /"[^"]*"|'[^']*'|\{[^{}]*\}/g;
const ATTR_NAME = /([A-Za-z_:@][\w:.-]*)\s*=/g;

/** Set of `name[attr,attr]` signatures for every opening tag in `text`. */
export function tagSignatures(text) {
  const out = new Set();
  for (const [, name, rest] of text.matchAll(TAG)) {
    const attrs = [...rest.replace(QUOTED, '').matchAll(ATTR_NAME)].map((m) => m[1]);
    out.add(`${name}[${[...new Set(attrs)].sort().join(',')}]`);
  }
  return out;
}

// Undo the entity and whitespace tricks a browser would also undo before it
// reads a URL scheme, e.g. `java&#115;cript:` or `java\tscript:`.
function normalizeForSchemes(text) {
  return text
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&colon;/gi, ':')
    .replace(/&(tab|newline);/gi, '')
    .replace(/[\s\0-\x1f]+/g, '')
    .toLowerCase();
}

const RISKY_PATTERNS = [
  { label: 'javascript: URL', count: (t) => countMatches(normalizeForSchemes(t), /javascript:/g) },
  { label: 'vbscript: URL', count: (t) => countMatches(normalizeForSchemes(t), /vbscript:/g) },
  {
    label: 'data:text/html URL',
    count: (t) => countMatches(normalizeForSchemes(t), /data:text\/html/g),
  },
  // Anywhere in the text, not only inside a parsed tag, so a tag the TAG regex
  // misreads cannot hide one.
  { label: 'event handler attribute (on...=)', count: (t) => countMatches(t, /\bon[a-z]+\s*=/gi) },
];

function countMatches(text, re) {
  return text.match(re)?.length ?? 0;
}

/**
 * Compare a translated string or file against its English source. Returns a
 * list of human-readable problems: tags (with their attribute names) that the
 * English does not have, and script URLs or event handlers it has fewer of.
 */
export function compareMarkup(english, translated) {
  const problems = [];
  const englishTags = tagSignatures(english);
  for (const sig of tagSignatures(translated)) {
    if (!englishTags.has(sig)) problems.push(`tag <${sig}> is not in the English source`);
  }
  for (const { label, count } of RISKY_PATTERNS) {
    const extra = count(translated) - count(english);
    if (extra > 0) problems.push(`${extra} more ${label} than the English source`);
  }
  return problems;
}

/** Flatten a messages JSON object to { 'a.b.c': 'string' }. */
export function flattenMessages(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') flattenMessages(value, full, out);
    else out[full] = String(value);
  }
  return out;
}

/**
 * Compare every string of a translated messages file with the English string
 * at the same key. A key the English file lacks is compared with an empty
 * string, so it may hold text but no markup.
 */
export function checkMessages(englishJson, translatedJson) {
  const en = flattenMessages(englishJson);
  const tr = flattenMessages(translatedJson);
  const problems = [];
  for (const [key, value] of Object.entries(tr)) {
    for (const p of compareMarkup(en[key] ?? '', value)) problems.push(`${key}: ${p}`);
  }
  return problems;
}

/** Keys whose translated value was added, changed or removed between two versions. */
export function diffMessages(beforeJson, afterJson) {
  const before = flattenMessages(beforeJson);
  const after = flattenMessages(afterJson);
  const changes = [];
  for (const [key, value] of Object.entries(after)) {
    if (!(key in before)) changes.push({ key, kind: 'added', value });
    else if (before[key] !== value) changes.push({ key, kind: 'changed', value });
  }
  for (const key of Object.keys(before)) {
    if (!(key in after)) changes.push({ key, kind: 'removed', value: before[key] });
  }
  return changes;
}

/** Hostnames of absolute http(s) links in `translated` that `english` never links to. */
export function newLinkHosts(english, translated) {
  const hosts = (t) =>
    new Set([...t.matchAll(/https?:\/\/([^/\s)"'<>\]]+)/gi)].map((m) => m[1].toLowerCase()));
  const known = hosts(english);
  return [...hosts(translated)].filter((h) => !known.has(h)).sort();
}
