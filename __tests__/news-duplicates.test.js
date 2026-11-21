import { describe, it, expect } from 'vitest';
import {
  normalizeNewsUrl,
  findNewsItemsWithUrl,
  parseGitCatFileBatch,
} from '../lib/news-duplicates.cjs';

const CLDC = 'https://cldc.org/the-feds-came-to-minnesota-pretending-to-be-organizers/';

describe('normalizeNewsUrl', () => {
  it('treats scheme, www, trailing slash and fragments as the same link', () => {
    const base = normalizeNewsUrl(CLDC);
    expect(
      normalizeNewsUrl(
        'http://www.cldc.org/the-feds-came-to-minnesota-pretending-to-be-organizers',
      ),
    ).toBe(base);
    expect(normalizeNewsUrl(`${CLDC}#comments`)).toBe(base);
  });

  it('drops tracking parameters but keeps the rest of the query', () => {
    expect(normalizeNewsUrl(`${CLDC}?utm_source=signal&fbclid=abc`)).toBe(normalizeNewsUrl(CLDC));
    expect(normalizeNewsUrl('https://example.com/story?id=7&utm_medium=email')).toBe(
      'example.com/story?id=7',
    );
    expect(normalizeNewsUrl('https://example.com/story?id=7')).not.toBe(
      normalizeNewsUrl('https://example.com/story?id=8'),
    );
  });

  it('keeps the path case, since some sites use it', () => {
    expect(normalizeNewsUrl('https://Example.com/Story')).toBe('example.com/Story');
  });

  it('falls back to the trimmed text for something that is not a URL', () => {
    expect(normalizeNewsUrl('  Not A URL ')).toBe('not a url');
  });
});

describe('findNewsItemsWithUrl', () => {
  const items = [
    { slug: 'feds', frontmatter: { url: CLDC } },
    { slug: 'other', frontmatter: { url: 'https://theintercept.com/2026/11/13/story/' } },
    { slug: 'no-url', frontmatter: {} },
  ];

  it('finds an item with the same article link', () => {
    expect(
      findNewsItemsWithUrl(items, `${CLDC.replace('https:', 'http:')}?utm_source=x`).map(
        (i) => i.slug,
      ),
    ).toEqual(['feds']);
  });

  it('returns nothing for a new link or an empty one', () => {
    expect(findNewsItemsWithUrl(items, 'https://cldc.org/a-different-story/')).toEqual([]);
    expect(findNewsItemsWithUrl(items, '')).toEqual([]);
  });
});

describe('parseGitCatFileBatch', () => {
  it('splits objects by their byte size, including multibyte text', () => {
    const first = 'title: café\n';
    const second = 'url: x\n';
    const output = Buffer.concat([
      Buffer.from(`aaa blob ${Buffer.byteLength(first)}\n`),
      Buffer.from(`${first}\n`),
      Buffer.from('origin/main:content/en/news/gone.mdx missing\n'),
      Buffer.from(`bbb blob ${Buffer.byteLength(second)}\n`),
      Buffer.from(`${second}\n`),
    ]);
    expect(parseGitCatFileBatch(output)).toEqual([first, null, second]);
  });

  it('returns nothing for empty output', () => {
    expect(parseGitCatFileBatch(Buffer.alloc(0))).toEqual([]);
  });
});
