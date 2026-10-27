import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import messages from '../messages/en.json';

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

  // <Term> drops a source link that is missing its name or isn't https / site-relative
  it('every source link has a name and an https or site-relative url', () => {
    for (const [slug, entry] of definitions) {
      if (entry.url === undefined && entry.source === undefined) continue;
      expect(entry.url, slug).toMatch(/^(https:\/\/|\/(?!\/))/);
      expect(entry.source?.trim(), slug).toBeTruthy();
    }
  });

  it('every internal source link points at an existing page and checklist item', () => {
    for (const [slug, entry] of definitions) {
      if (!entry.url?.startsWith('/')) continue;
      const [, page, anchor] = entry.url.match(/^\/([^/#]+)\/(?:#(.+))?$/) ?? [];
      expect(page, `${slug}: ${entry.url}`).toBeTruthy();
      const file = ['guides', 'pages']
        .map((dir) => path.join(CONTENT_DIR, 'en', dir, `${page}.mdx`))
        .find((candidate) => fs.existsSync(candidate));
      expect(file, `${slug}: no page for ${entry.url}`).toBeTruthy();
      if (anchor) {
        expect(fs.readFileSync(file, 'utf8'), `${slug}: no #${anchor} on ${page}`).toContain(
          `slug="${anchor}"`,
        );
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
