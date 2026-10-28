import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import messages from '../messages/en.json';
import {
  inlineMarkdownHrefs,
  isInternalHref,
  isSafeHref,
  termLinkSlug,
} from '@/lib/inline-markdown';

// <Term> renders its children as plain text when the slug has no definition,
// so a typo'd or removed slug would otherwise ship silently. Every locale is
// checked against en.json because other locales fall back to it.

const CONTENT_DIR = path.join(__dirname, '..', 'content');

function listMdxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMdxFiles(full);
    return entry.name.endsWith('.mdx') ? [full] : [];
  });
}

const definitions = Object.entries(messages.definitions).filter(
  ([, value]) => typeof value === 'object',
);

// Content adds a popup with [text](term:slug). Older translations may still use
// <Term slug="...">, matched whatever order its attributes are in, so a <Term>
// without a slug is caught too.
function termUsages() {
  return listMdxFiles(CONTENT_DIR).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(CONTENT_DIR, file);
    const links = [...source.matchAll(/\]\((term:[^)]*)\)/g)].map(([, href]) => ({
      file: relative,
      slug: termLinkSlug(href),
      usage: href,
    }));
    const tags = [...source.matchAll(/<Term\b[^>]*>/g)].map(([tag]) => ({
      file: relative,
      slug: tag.match(/\bslug=["']([^"']+)["']/)?.[1] ?? null,
      usage: tag,
    }));
    return [...links, ...tags];
  });
}

describe('term definitions', () => {
  it('every definition has a term and a definition', () => {
    for (const [slug, entry] of definitions) {
      expect(typeof entry.term, slug).toBe('string');
      expect(entry.term.trim(), slug).not.toBe('');
      expect(typeof entry.definition, slug).toBe('string');
      expect(entry.definition.trim(), slug).not.toBe('');
    }
  });

  // definitions are inline Markdown; an HTML tag would show up as literal text
  it('definitions use Markdown, not HTML tags', () => {
    for (const [slug, entry] of definitions) {
      expect(entry.definition, slug).not.toMatch(/<\/?[a-zA-Z][\w-]*[\s>]/);
    }
  });

  // <Term> drops a link whose url isn't https or site-relative
  it('every source and inline link has a safe url', () => {
    for (const [slug, entry] of definitions) {
      for (const href of inlineMarkdownHrefs(entry.definition)) {
        if (href.startsWith('term:')) continue;
        expect(isSafeHref(href), `${slug}: ${href}`).toBe(true);
      }
      if (entry.url === undefined && entry.source === undefined) continue;
      expect(isSafeHref(entry.url ?? ''), `${slug}: ${entry.url}`).toBe(true);
      expect(entry.source?.trim(), slug).toBeTruthy();
    }
  });

  // a [text](term:slug) link to a missing or malformed slug renders as plain text
  it('every term link points at another existing definition', () => {
    for (const [slug, entry] of definitions) {
      for (const href of inlineMarkdownHrefs(entry.definition)) {
        if (!href.startsWith('term:')) continue;
        const target = termLinkSlug(href);
        expect(target, `${slug}: malformed ${href}`).toBeTruthy();
        expect(target, `${slug} links to itself`).not.toBe(slug);
        expect(
          messages.definitions[target]?.definition,
          `${slug}: no definition for ${href}`,
        ).toBeTruthy();
      }
    }
  });

  it('every internal link points at an existing page and anchor', () => {
    for (const [slug, entry] of definitions) {
      const hrefs = [entry.url, ...inlineMarkdownHrefs(entry.definition)];
      for (const href of hrefs.filter((h) => h && isInternalHref(h))) {
        const [, page, anchor] = href.match(/^\/([^/#]+)\/(?:#(.+))?$/) ?? [];
        expect(page, `${slug}: ${href}`).toBeTruthy();
        const file = ['guides', 'pages']
          .map((dir) => path.join(CONTENT_DIR, 'en', dir, `${page}.mdx`))
          .find((candidate) => fs.existsSync(candidate));
        expect(file, `${slug}: no page for ${href}`).toBeTruthy();
        if (anchor) {
          // a checklist item slug or a custom heading id
          const source = fs.readFileSync(file, 'utf8');
          const found = source.includes(`slug="${anchor}"`) || source.includes(`{#${anchor}}`);
          expect(found, `${slug}: no #${anchor} on ${page}`).toBe(true);
        }
      }
    }
  });

  it('finds term usages in content', () => {
    expect(termUsages().length).toBeGreaterThan(0);
  });

  it('every term usage in content has a slug with a definition', () => {
    const missing = termUsages()
      .filter(({ slug }) => !(slug && messages.definitions[slug]?.definition))
      .map(({ file, usage }) => `${file}: ${usage}`);
    expect(missing).toEqual([]);
  });
});
