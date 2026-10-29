import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import messages from '../messages/en.json';
import { parseFrontmatter } from '@/lib/frontmatter.cjs';
import { flattenMessages } from '../scripts/lib/l10n-pr-check-core.mjs';

// English is Crowdin's source. Its AI pre-translation writes a non-breaking
// space back as the literal text "\u00a0", which then shows on the page, and
// Crowdin's QA check warns translators whose text leaves one out. English
// prose has no use for them: they arrive by pasting from a rich-text editor,
// or from a scraped news title that YAML stores as `\_`. Type a plain space.

const ROOT = path.join(__dirname, '..');
const NBSP = /[\u00a0\u202f]/;

function listMdxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMdxFiles(full);
    return entry.name.endsWith('.mdx') ? [full] : [];
  });
}

describe('English source text', () => {
  it('reads a YAML "\\_" escape as a non-breaking space', () => {
    expect(parseFrontmatter('---\ntitle: "a\\_b"\n---\n').data.title).toBe('a\u00a0b');
  });

  it('has no non-breaking spaces in MDX files', () => {
    const found = listMdxFiles(path.join(ROOT, 'content', 'en')).flatMap((file) => {
      const raw = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      const hits = raw
        .split('\n')
        .flatMap((line, i) => (NBSP.test(line) ? [`${rel}:${i + 1}`] : []));
      if (NBSP.test(JSON.stringify(parseFrontmatter(raw).data))) {
        hits.push(`${rel} (front matter)`);
      }
      return hits;
    });
    expect(found).toEqual([]);
  });

  it('has no non-breaking spaces in messages/en.json', () => {
    const keys = Object.entries(flattenMessages(messages))
      .filter(([, value]) => NBSP.test(value))
      .map(([key]) => key);
    expect(keys).toEqual([]);
  });
});
