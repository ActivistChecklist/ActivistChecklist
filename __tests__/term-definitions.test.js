import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import messages from '../messages/en.json';

// <Term> renders its children as plain text when the slug has no definition,
// so a typo'd or removed slug would otherwise ship silently. Every locale is
// checked against en.json because other locales fall back to it.

const CONTENT_DIR = path.join(process.cwd(), 'content');

function mdxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(full);
    return entry.name.endsWith('.mdx') ? [full] : [];
  });
}

function termUsages() {
  return mdxFiles(CONTENT_DIR).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    return [...source.matchAll(/<Term\b[^>]*>/g)].map(([tag]) => ({
      file: path.relative(process.cwd(), file),
      slug: tag.match(/\bslug=["']([^"']+)["']/)?.[1] ?? null,
    }));
  });
}

describe('<Term> definitions', () => {
  const usages = termUsages();

  it('finds <Term> usages in content', () => {
    expect(usages.length).toBeGreaterThan(0);
  });

  it('every <Term> slug has a term and definition in messages/en.json', () => {
    const missing = usages
      .filter(({ slug }) => {
        const def = slug && messages.definitions?.[slug];
        return !(typeof def?.term === 'string' && typeof def?.definition === 'string');
      })
      .map(({ file, slug }) => `${file}: ${slug ?? '(no slug)'}`);
    expect(missing).toEqual([]);
  });
});
