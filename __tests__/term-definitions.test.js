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

// <Term> silently falls back to plain text when its slug has no definition,
// so a typo in content would quietly drop the popup. Catch that here.

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

  it('every <Term slug> used in content has a definition', () => {
    const missing = [];
    for (const file of listMdxFiles(CONTENT_DIR)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/<Term\s+slug=["']([^"']+)["']/g)) {
        if (!messages.definitions[match[1]]?.definition) {
          missing.push(`${path.relative(CONTENT_DIR, file)}: ${match[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
