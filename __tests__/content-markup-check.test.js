import { describe, it, expect } from 'vitest';
import {
  bodyRendersAsMarkdown,
  collectStrings,
  findUnsafeMarkup,
} from '../lib/content-markup-check.mjs';

const labels = (text) => findUnsafeMarkup(text).map((h) => h.label);

describe('findUnsafeMarkup', () => {
  it('flags raw tags, including lowercase event handlers', () => {
    expect(labels('Hola <img src=x onerror="alert(1)">')).toEqual([
      'raw HTML tag',
      'event handler attribute',
    ]);
    expect(labels('a <b>bold</b>')).toEqual(['raw HTML tag']);
    expect(labels('trailing <img')).toEqual(['raw HTML tag']);
  });

  it('flags HTML comments and script URLs in any case', () => {
    expect(labels('<!-- x -->')).toEqual(['raw HTML comment or declaration']);
    expect(labels('[x](JavaScript:alert(1))')).toEqual(['javascript: URL']);
    expect(labels('[x](vbscript:x)')).toEqual(['vbscript: URL']);
    expect(labels('[x](data:text/html,hi)')).toEqual(['data:text/html URL']);
  });

  it('reports the line within the text', () => {
    expect(findUnsafeMarkup('ok\nok\n<script>')[0]).toMatchObject({
      line: 3,
      label: 'raw HTML tag',
    });
  });

  it('accepts ordinary markdown, autolinks and prose with < and "on"', () => {
    for (const text of [
      'Use [Signal](https://signal.org/) and **turn on** disappearing messages.',
      'See <https://ssd.eff.org/> or <mailto:help@example.org>',
      'Keep it < 5 minutes; 3 < 4',
      'Depend on nothing. one = two',
    ]) {
      expect(labels(text)).toEqual([]);
    }
  });
});

describe('collectStrings', () => {
  it('walks nested objects and arrays with key paths, skipping non-strings', () => {
    expect(
      collectStrings({
        title: 'T',
        date: new Date('2026-01-01'),
        count: 3,
        tags: ['a', { label: 'b' }],
      }),
    ).toEqual([
      { keyPath: 'title', value: 'T' },
      { keyPath: 'tags[0]', value: 'a' },
      { keyPath: 'tags[1].label', value: 'b' },
    ]);
  });
});

describe('bodyRendersAsMarkdown', () => {
  it('is true only for changelog and news in any locale', () => {
    expect(bodyRendersAsMarkdown('content/es/changelog/x.mdx')).toBe(true);
    expect(bodyRendersAsMarkdown('content/en/news/x.mdx')).toBe(true);
    expect(bodyRendersAsMarkdown('content/es/guides/x.mdx')).toBe(false);
    expect(bodyRendersAsMarkdown('content/es/checklist-items/news.mdx')).toBe(false);
  });
});
