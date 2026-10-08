// Format MDX files using the same pipeline as Keystatic.
//
// YAML:  load → patch dates → add trailing \n to inline MDX fields → dump
// Body:  fromMarkdown → normalize MDAST → toMarkdown
//
// The MDAST normalization replicates ProseMirror behaviours:
//   - marks (bold/italic/strikethrough) wrapping a link get swapped so link is outermost
//   - list spread is set to false; list items with [paragraph, list] shape get spread: false
//
// Usage:
//   node scripts/keystatic-format-mdx.mjs <dir-or-file> [--check|--write] [-r]

import fs from 'node:fs/promises';
import path from 'node:path';
import { load, dump } from 'js-yaml';

import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { mdxFromMarkdown, mdxToMarkdown } from 'mdast-util-mdx';
import { mdxjs } from 'micromark-extension-mdxjs';
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal';
import {
  gfmAutolinkLiteralFromMarkdown,
  gfmAutolinkLiteralToMarkdown,
} from 'mdast-util-gfm-autolink-literal';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from 'mdast-util-gfm-strikethrough';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTableFromMarkdown, gfmTableToMarkdown } from 'mdast-util-gfm-table';

// ── MDAST config — identical to Keystatic's ui.tsx ───────────────────────────

const parseOptions = {
  extensions: [mdxjs(), gfmAutolinkLiteral(), gfmStrikethrough(), gfmTable()],
  mdastExtensions: [
    mdxFromMarkdown(),
    gfmAutolinkLiteralFromMarkdown(),
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
  ],
};

const serializeOptions = {
  extensions: [
    gfmAutolinkLiteralToMarkdown(),
    gfmStrikethroughToMarkdown(),
    gfmTableToMarkdown(),
    mdxToMarkdown(),
  ],
  rule: '-',
};

// ── Frontmatter ──────────────────────────────────────────────────────────────
// Keystatic: js-yaml dump() with zero options (updating.tsx)
// Date fields: serialize() overrides toISOString → bare YYYY-MM-DD (date/index.tsx)
// Inline fields (markdoc.inline): serialize() appends \n → dump uses block scalars

const FRONTMATTER_RE = /^---(?:\r?\n([^]*?))?\r?\n---\r?\n?/;

// markdoc.inline / mdx.inline fields whose serialize adds trailing \n
// (guides: excerpt is fields.mdx.inline — same trailing newline behavior as checklist markdoc inline fields)
const INLINE_FIELDS = new Set(['preview', 'do', 'dont', 'excerpt']);

// Schema-ordered field keys + defaults per collection path pattern
const COLLECTION_SCHEMAS = [
  {
    match: '/checklist-items/',
    order: ['title', 'preview', 'do', 'dont', 'titleBadges', 'firstPublished', 'lastUpdated'],
    defaults: { titleBadges: [] },
  },
  {
    match: '/guides/',
    order: ['title', 'estimatedTime', 'excerpt', 'relatedGuides', 'firstPublished', 'lastUpdated'],
    defaults: {},
  },
  {
    match: '/pages/',
    order: ['title', 'relatedGuides', 'firstPublished', 'lastUpdated'],
    defaults: {},
  },
  {
    match: '/news/',
    order: [
      'title',
      'date',
      'url',
      'source',
      'tags',
      'imageOverride',
      'firstPublished',
      'lastUpdated',
    ],
    defaults: {},
  },
  {
    match: '/changelog/',
    order: ['slug', 'date', 'type'],
    defaults: {},
  },
];

function patchDates(value) {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    const str = `${y}-${m}-${d}`;
    value.toISOString = () => str;
    return value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = patchDates(value[i]);
    return value;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) value[k] = patchDates(value[k]);
    return value;
  }
  return value;
}

function reserializeFrontmatter(raw, filePath) {
  let data = raw.trim() ? load(raw) : {};
  if (data == null || typeof data !== 'object' || Array.isArray(data)) data = {};

  patchDates(data);

  // Inline content fields end with \n in Keystatic (markdoc.inline / mdx.inline serialize)
  for (const key of INLINE_FIELDS) {
    if (typeof data[key] === 'string' && !data[key].endsWith('\n')) {
      data[key] += '\n';
    }
  }

  // Add missing schema defaults and reorder keys to match Keystatic's field order
  const schema = COLLECTION_SCHEMAS.find((s) => filePath.includes(s.match));
  if (schema) {
    for (const [k, v] of Object.entries(schema.defaults)) {
      if (!(k in data)) data[k] = v;
    }
    const ordered = {};
    for (const k of schema.order) {
      if (k in data) ordered[k] = data[k];
    }
    for (const k of Object.keys(data)) {
      if (!(k in ordered)) ordered[k] = data[k];
    }
    data = ordered;
  }

  return dump(data);
}

// ── MDAST normalization (replicates ProseMirror behaviour) ───────────────────

function normalizeTree(node) {
  if (!node.children) return;

  // Process children first (bottom-up)
  for (const child of node.children) normalizeTree(child);

  // Marks wrapping a single link → link wrapping the mark
  // ProseMirror keeps link as outermost: **[text](url)** → [**text**](url)
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (
      (child.type === 'strong' || child.type === 'emphasis' || child.type === 'delete') &&
      child.children.length === 1 &&
      child.children[0].type === 'link'
    ) {
      const link = child.children[0];
      node.children[i] = { ...link, children: [{ type: child.type, children: link.children }] };
    }
  }

  // List spread normalization (prosemirror/editor/mdx/serialize.ts)
  if (node.type === 'list') {
    node.spread = false;
  }
  if (node.type === 'listItem') {
    node.spread =
      node.children.length === 2 &&
      node.children[0].type === 'paragraph' &&
      node.children[1].type === 'list'
        ? false
        : undefined;
  }
}

// ── MDX body ─────────────────────────────────────────────────────────────────

function reserializeBody(body) {
  const ast = fromMarkdown(body, parseOptions);
  normalizeTree(ast);
  return toMarkdown(ast, serializeOptions);
}

// ── Per-file ─────────────────────────────────────────────────────────────────

function formatFile(text, filePath) {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { changed: false, output: text, reason: 'no frontmatter' };

  const fmRaw = match[1] ?? '';
  const body = text.slice(match[0].length);

  let fmYaml, newBody;
  try {
    fmYaml = reserializeFrontmatter(fmRaw, filePath);
  } catch (err) {
    return { changed: false, output: text, reason: `yaml error: ${err.message}` };
  }
  try {
    newBody = reserializeBody(body);
  } catch (err) {
    return { changed: false, output: text, reason: `mdx error: ${err.message}` };
  }

  const output = `---\n${fmYaml}---\n${newBody}`;
  return { changed: output !== text, output, reason: output !== text ? 'changed' : 'ok' };
}

// ── File walking ─────────────────────────────────────────────────────────────

async function* walk(dir, recursive) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) yield* walk(full, recursive);
    else if (entry.isFile()) yield full;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { target: null, recursive: false, check: false, write: false };
  for (const a of argv) {
    if (a === '-r' || a === '--recursive') args.recursive = true;
    else if (a === '--check') args.check = true;
    else if (a === '--write') args.write = true;
    else if (!a.startsWith('-') && !args.target) args.target = a;
  }
  if (!args.target) die('Usage: node keystatic-format-mdx.mjs <path> --check|--write [-r]');
  if (args.check === args.write) die('Pick exactly one of --check or --write');
  return args;
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = path.resolve(args.target);
  const stat = await fs.stat(target);

  const files = [];
  if (stat.isFile()) {
    files.push(target);
  } else {
    for await (const f of walk(target, args.recursive)) {
      if (f.endsWith('.mdx')) files.push(f);
    }
  }

  let scanned = 0,
    changed = 0,
    skipped = 0;
  const changedList = [],
    skippedList = [];

  for (const filePath of files) {
    scanned++;
    const text = await fs.readFile(filePath, 'utf8');
    const res = formatFile(text, filePath);

    if (res.reason !== 'changed' && res.reason !== 'ok') {
      skipped++;
      skippedList.push({ file: filePath, reason: res.reason });
      continue;
    }
    if (res.changed) {
      changed++;
      changedList.push(filePath);
      if (args.write) await fs.writeFile(filePath, res.output, 'utf8');
    }
  }

  const rel = (f) => path.relative(process.cwd(), f);
  if (args.check) {
    if (changed) {
      console.error(`Would change ${changed}/${scanned} file(s):`);
      changedList.forEach((f) => console.error(`  ${rel(f)}`));
      process.exitCode = 1;
    } else {
      console.log(`No changes needed (${scanned} file(s) scanned).`);
    }
  } else {
    console.log(`Wrote ${changed}/${scanned} file(s).`);
  }
  if (skipped) {
    console.log(`Skipped ${skipped}:`);
    skippedList.forEach((s) => console.log(`  ${rel(s.file)} — ${s.reason}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
