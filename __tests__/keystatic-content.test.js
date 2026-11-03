import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import yaml from 'js-yaml';
import { createReader } from '@keystatic/core/reader';

// Opens every entry the way the Keystatic editor does. The editor refuses to
// open a whole entry over any one of these, and nothing else in the build
// notices, so they used to pile up until an editor hit them:
//  - a front matter key the collection schema does not declare, or a value of
//    the wrong type (a bare number where a select expects a string)
//  - a JSX tag in the body with no component definition, HTML tags included,
//    or a prop the definition does not declare
//  - MDX that does not parse, like an unclosed tag or a stray `{`
//
// `{#id}` heading anchors are fine: the body fields escape them for the editor
// (mdxBody in keystatic.config.tsx), and the round trip below checks that a
// save writes them back unchanged.
//
// Front matter goes through Keystatic's own reader. The body parser only
// exists in Keystatic's browser build (its Node build ships a stub that parses
// nothing), so the config is loaded a second time against that build.
// Not covered: saving. Serializing a table needs a DOM.

// The editor previews import site components vitest cannot load. They only
// matter when the editor renders an entry, not when it parses one.
vi.mock('@/components/keystatic/ChecklistItemEditorPreview', () => ({ default: () => null }));
vi.mock('@/components/keystatic/AlertEditorPreview', () => ({ default: () => null }));

const { default: config } = await import('../keystatic.config');

// Package exports send Node to the stub build. The browser build sits beside
// it in dist/ under a stable name.
function importBrowserBuild(file) {
  const dist = path.dirname(createRequire(import.meta.url).resolve('@keystatic/core'));
  return import(path.join(dist, file));
}

vi.resetModules();
vi.doMock('@keystatic/core', () => importBrowserBuild('keystatic-core.js'));
vi.doMock('@keystatic/core/content-components', () =>
  importBrowserBuild('keystatic-core-content-components.js'),
);
const { default: editorConfig } = await import('../keystatic.config');

const ROOT = path.join(__dirname, '..');
const reader = createReader(ROOT, config);
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function errorText(error) {
  const lines = String(error?.message ?? error)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set(lines)].join('; ');
}

// Same calls the editor makes on open: the body field gets the file contents
// after the front matter, inline editor fields get their front matter value.
function editorParseErrors(schema, raw, slug) {
  const match = raw.match(FRONTMATTER_RE);
  const frontmatter = match ? (yaml.load(match[1]) ?? {}) : {};
  const body = match ? raw.slice(match[0].length) : raw;
  const errors = [];
  for (const [key, field] of Object.entries(schema)) {
    const files = { other: new Map(), external: new Map(), slug };
    try {
      if (field.formKind === 'content') {
        field.parse(undefined, { ...files, content: new TextEncoder().encode(body) });
      } else if (field.formKind === 'assets') {
        field.parse(frontmatter[key], files);
      }
    } catch (error) {
      errors.push(`${key}: ${errorText(error)}`);
    }
  }
  return errors;
}

describe.each(Object.keys(config.collections))('Keystatic %s collection', (name) => {
  const dir = config.collections[name].path.replace(/\*$/, '');

  it('has entries to check', async () => {
    expect((await reader.collections[name].list()).length).toBeGreaterThan(0);
  });

  it('front matter matches the schema', async () => {
    const failures = [];
    for (const slug of await reader.collections[name].list()) {
      try {
        await reader.collections[name].readOrThrow(slug);
      } catch (error) {
        failures.push(`${dir}${slug}.mdx: ${errorText(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('every entry opens in the editor', async () => {
    const { schema } = editorConfig.collections[name];
    const failures = [];
    for (const slug of await reader.collections[name].list()) {
      const raw = fs.readFileSync(path.join(ROOT, `${dir}${slug}.mdx`), 'utf8');
      for (const error of editorParseErrors(schema, raw, slug)) {
        failures.push(`${dir}${slug}.mdx ${error}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('Keystatic body fields', () => {
  it('save {#id} heading anchors back unescaped', () => {
    const body = editorConfig.collections.pages.schema.body;
    const src =
      '## Downsides to using a VPN {#downsides}\n\nSome text.\n\n#### **Bold** heading {#dns}\n';
    const files = { other: new Map(), external: new Map(), slug: 'vpn' };
    const state = body.parse(undefined, { ...files, content: new TextEncoder().encode(src) });
    expect(state.doc.textContent).toContain('Downsides to using a VPN {#downsides}');
    const saved = body.serialize(state, { slug: 'vpn' });
    expect(new TextDecoder().decode(saved.content)).toBe(src);
  });
});

describe.each(Object.keys(config.singletons))('Keystatic %s singleton', (name) => {
  it('matches the schema', async () => {
    await expect(reader.singletons[name].readOrThrow()).resolves.toBeTruthy();
  });
});
