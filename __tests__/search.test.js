import { describe, it, expect } from 'vitest';
import {
  checklistItemAnchorId,
  highlightParts,
  rankPages,
  scrubQueryForAnalytics,
  toPageResult,
  toSiteUrl,
} from '../lib/search';

describe('toSiteUrl', () => {
  it('drops the /en prefix English pages are exported under', () => {
    expect(toSiteUrl('/en/vpn/')).toBe('/vpn/');
    expect(toSiteUrl('/en/')).toBe('/');
    expect(toSiteUrl('/en')).toBe('/');
    expect(toSiteUrl('/en/protest/#phone-baseline')).toBe('/protest/#phone-baseline');
  });

  it('keeps other locale prefixes, which are real URLs', () => {
    expect(toSiteUrl('/es/vpn/')).toBe('/es/vpn/');
    expect(toSiteUrl('/fr/')).toBe('/fr/');
  });

  it('does not treat a path that merely starts with "en" as the locale', () => {
    expect(toSiteUrl('/encryption/')).toBe('/encryption/');
  });

  it('maps an indexed checklist item anchor back to the item slug', () => {
    expect(toSiteUrl(`/en/protest/#${checklistItemAnchorId('faraday-bag')}`)).toBe(
      '/protest/#faraday-bag',
    );
    expect(toSiteUrl(`/es/protest/#${checklistItemAnchorId('faraday-bag')}`)).toBe(
      '/es/protest/#faraday-bag',
    );
  });
});

describe('rankPages', () => {
  it('ranks a guide above the news feed when news scores a little higher', () => {
    const ranked = rankPages([
      { url: '/news/', score: 10 },
      { url: '/signal/', score: 8 },
    ]);
    expect(ranked.map((p) => p.url)).toEqual(['/signal/', '/news/']);
  });

  it('demotes localized news and glossary pages too', () => {
    const ranked = rankPages([
      { url: '/es/glossary/', score: 10 },
      { url: '/es/proton/', score: 6 },
    ]);
    expect(ranked[0].url).toBe('/es/proton/');
  });

  it('still lets news win when it is by far the best match', () => {
    const ranked = rankPages([
      { url: '/news/', score: 100 },
      { url: '/signal/', score: 5 },
    ]);
    expect(ranked[0].url).toBe('/news/');
  });

  it('keeps Pagefind order for ties and does not mutate the input', () => {
    const input = [
      { url: '/a/', score: 1 },
      { url: '/b/', score: 1 },
    ];
    expect(rankPages(input).map((p) => p.url)).toEqual(['/a/', '/b/']);
    expect(input[0].url).toBe('/a/');
  });
});

describe('toPageResult', () => {
  const data = {
    url: '/en/protest/',
    meta: { title: 'Prepare for a Protest' },
    excerpt: 'A <mark>faraday</mark> bag',
    sub_results: [
      { url: '/en/protest/', title: 'Prepare for a Protest', excerpt: 'intro' },
      {
        url: `/en/protest/#${checklistItemAnchorId('faraday-bag')}`,
        title: 'Use a faraday bag',
        excerpt: 'x',
        anchor: { id: 'checklist-item-faraday-bag' },
      },
      { url: '/en/protest/#a', title: 'A', excerpt: 'a', anchor: { id: 'a' } },
      { url: '/en/protest/#b', title: 'B', excerpt: 'b', anchor: { id: 'b' } },
    ],
  };

  it('drops the anchorless page-level hit and caps the sections', () => {
    const result = toPageResult(data, 3, 2);
    expect(result.url).toBe('/protest/');
    expect(result.title).toBe('Prepare for a Protest');
    expect(result.sections.map((s) => s.url)).toEqual(['/protest/#faraday-bag', '/protest/#a']);
  });

  it('puts the section with the strongest hits first, not the first in the page', () => {
    const hits = (...scores) => scores.map((balanced_score) => ({ balanced_score }));
    const result = toPageResult(
      {
        url: '/en/essentials/',
        sub_results: [
          {
            url: '/en/essentials/#a',
            title: 'Mentions it once',
            anchor: {},
            weighted_locations: hits(512),
          },
          {
            url: '/en/essentials/#b',
            title: 'Also once',
            anchor: {},
            weighted_locations: hits(512),
          },
          {
            url: '/en/essentials/#c',
            title: 'About it',
            anchor: {},
            weighted_locations: hits(12800, 512, 512),
          },
        ],
      },
      1,
      2,
    );
    expect(result.sections.map((s) => s.title)).toEqual(['About it', 'Mentions it once']);
  });

  it('tolerates a page with no sub results or title', () => {
    const result = toPageResult({ url: '/en/x/', excerpt: '' }, 1, 3);
    expect(result.sections).toEqual([]);
    expect(result.title).toBe('');
  });
});

describe('highlightParts', () => {
  const marked = (parts) => parts.filter((p) => p.match).map((p) => p.text);

  it('marks whole words that start with a query term, case-insensitively', () => {
    const parts = highlightParts('VPNs for Activists', 'vpn');
    expect(marked(parts)).toEqual(['VPNs']);
    expect(parts.map((p) => p.text).join('')).toBe('VPNs for Activists');
  });

  it('matches each word of a multi-word query', () => {
    expect(marked(highlightParts('Use a password manager', 'manager password'))).toEqual([
      'password',
      'manager',
    ]);
  });

  it('does not match inside a word', () => {
    expect(marked(highlightParts('Unsignal signal', 'signal'))).toEqual(['signal']);
  });

  it('treats regex characters in the query as plain text', () => {
    expect(() => highlightParts('C++ (and more)', '(')).not.toThrow();
    expect(marked(highlightParts('C++ (and more)', 'c++'))).toEqual(['C']);
  });

  it('keeps markup characters in the title as plain text for React to escape', () => {
    const parts = highlightParts('Travel & Flight <b>Security</b>', 'b security');
    expect(marked(parts)).toEqual(['b', 'Security', 'b']);
    expect(parts.map((p) => p.text).join('')).toBe('Travel & Flight <b>Security</b>');
  });

  it('matches accented words in other languages', () => {
    expect(marked(highlightParts('Protección básica', 'protec'))).toEqual(['Protección']);
  });

  it('marks only the term inside Japanese text, which has no spaces', () => {
    const parts = highlightParts('暗号化アプリの使い方', 'アプリ');
    expect(marked(parts)).toEqual(['アプリ']);
    expect(parts.map((p) => p.text).join('')).toBe('暗号化アプリの使い方');
    expect(marked(highlightParts('メッセージの保存期間', 'メッセージ'))).toEqual(['メッセージ']);
  });

  it('separates a Latin word from the Japanese text next to it', () => {
    expect(marked(highlightParts('Signalの設定方法', 'signal 設定'))).toEqual(['Signal', '設定']);
  });

  it('prefers the longer term where two overlap in Japanese text', () => {
    expect(marked(highlightParts('暗号化について', '暗号 暗号化'))).toEqual(['暗号化']);
  });

  it('returns the text unmarked for an empty query', () => {
    expect(highlightParts('Signal', '  ')).toEqual([{ text: 'Signal', match: false }]);
  });
});

describe('scrubQueryForAnalytics', () => {
  it('replaces email addresses', () => {
    expect(scrubQueryForAnalytics('contact me at someone@example.org please')).toBe(
      'contact me at [email] please',
    );
  });

  it('replaces phone numbers in common formats', () => {
    expect(scrubQueryForAnalytics('call +1 (555) 123-4567')).toBe('call [phone]');
    expect(scrubQueryForAnalytics('5551234567')).toBe('[phone]');
  });

  it('keeps short numbers like years and versions', () => {
    expect(scrubQueryForAnalytics('ios 18.2')).toBe('ios 18.2');
    expect(scrubQueryForAnalytics('protest 2026')).toBe('protest 2026');
  });

  it('trims, collapses whitespace and caps the length', () => {
    expect(scrubQueryForAnalytics('  signal   groups ')).toBe('signal groups');
    expect(scrubQueryForAnalytics('a'.repeat(300))).toHaveLength(100);
  });
});
