import { describe, it, expect } from 'vitest';

import { normalizeSnapshot } from '../lib/updates/snapshot';
import { buildSearchIndex, buildFuse, searchIndex, tidyReleaseLabel } from '../lib/updates/search';

const NOW = new Date('2026-05-03T00:00:00Z');

const SNAP = normalizeSnapshot({
  schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
  products: [
    {
      id: 'iphone', label: 'Apple iPhone', kind: 'device', family: 'apple', formFactor: 'phone',
      endoflifeUrl: 'https://x', releases: [
        { id: '17-pro', label: '17 Pro', releaseDate: '2025-09-19' },
        { id: '12-pro', label: '12 Pro', releaseDate: '2020-10-23' },
        { id: '6', label: '6', releaseDate: '2014-09-19', isEol: true },
      ],
    },
    {
      id: 'pixel', label: 'Google Pixel', kind: 'device', family: 'google', formFactor: 'phone',
      endoflifeUrl: 'https://x', releases: [
        { id: '10', label: 'Pixel 10', releaseDate: '2025-08-28' },
      ],
    },
    {
      id: 'macbook-pro', label: 'Apple MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
      endoflifeUrl: 'https://x', releases: [
        { id: '14in-2024-m4', label: 'MacBook Pro 14-inch (2024, M4)', releaseDate: '2024-11-08' },
        { id: '15in-2018', label: 'MacBook Pro 15-inch (2018)', releaseDate: '2018-07-12' },
      ],
    },
    {
      id: 'windows', label: 'Microsoft Windows', kind: 'os', family: 'microsoft', formFactor: 'os',
      endoflifeUrl: 'https://x', releases: [
        { id: '11-24h2-w', label: '11 24H2 (W)', releaseDate: '2024-10-01' },
        { id: '10-22h2', label: '10 22H2', releaseDate: '2022-10-18', isEol: true },
      ],
    },
    {
      id: 'ios', label: 'Apple iOS', kind: 'os', family: 'apple', formFactor: 'os',
      endoflifeUrl: 'https://x', releases: [
        { id: '26', label: '26', releaseDate: '2025-09-15' },
      ],
    },
  ],
});

describe('buildSearchIndex', () => {
  it('produces one row per release', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    // 3 + 1 + 2 + 2 + 1 = 9
    expect(rows).toHaveLength(9);
  });

  it('builds clean display label for phones (drops manufacturer prefix, prepends product family)', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const r = rows.find((x) => x.releaseId === '12-pro' && x.productId === 'iphone');
    expect(r.displayLabel).toBe('iPhone 12 Pro');
  });

  it('keeps Mac product release labels as-is (already include "MacBook Pro")', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const r = rows.find((x) => x.productId === 'macbook-pro' && x.releaseId === '14in-2024-m4');
    expect(r.displayLabel).toBe('MacBook Pro 14-inch (2024, M4)');
  });

  it('strips Windows (W) suffix from release labels', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const r = rows.find((x) => x.productId === 'windows' && x.releaseId === '11-24h2-w');
    expect(r.displayLabel).toBe('Windows 11 24H2');
  });

  it('marks platformGroup correctly for cross-family search filtering', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    expect(rows.find((x) => x.productId === 'iphone').platformGroup).toBe('apple');
    expect(rows.find((x) => x.productId === 'pixel').platformGroup).toBe('android');
    expect(rows.find((x) => x.productId === 'windows').platformGroup).toBe('windows');
  });

  it('recencyScore is higher for newer releases', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const newer = rows.find((x) => x.releaseId === '17-pro');
    const older = rows.find((x) => x.releaseId === '12-pro');
    const ancient = rows.find((x) => x.releaseId === '6');
    expect(newer.recencyScore).toBeGreaterThan(older.recencyScore);
    expect(older.recencyScore).toBeGreaterThan(ancient.recencyScore);
    expect(ancient.recencyScore).toBe(0); // > 10 years old → clamped
  });
});

describe('searchIndex', () => {
  it('empty query + no priority → no results (we do not flood with all 800+ rows)', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const fuse = buildFuse(rows);
    expect(searchIndex(rows, fuse, '', null)).toEqual([]);
  });

  it('fuzzy-matches "iPhone 12" → iPhone 12 Pro near top', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const fuse = buildFuse(rows);
    const results = searchIndex(rows, fuse, 'iPhone 12', null);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].releaseId).toBe('12-pro');
  });

  it('orders newer releases ahead of older ones for similarly-relevant queries (recency boost)', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const fuse = buildFuse(rows);
    const results = searchIndex(rows, fuse, 'iPhone', null);
    const order = results.map((r) => r.releaseId);
    expect(order.indexOf('17-pro')).toBeLessThan(order.indexOf('12-pro'));
    expect(order.indexOf('12-pro')).toBeLessThan(order.indexOf('6'));
  });

  it('respects an explicit limit option', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const fuse = buildFuse(rows);
    expect(searchIndex(rows, fuse, 'a', null, { limit: 3 }).length).toBeLessThanOrEqual(3);
  });

  it('priority context puts matching products first; non-priority matches still appear', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const fuse = buildFuse(rows);
    // Priority = iPhone, search "Pro" — both iPhone Pros and MacBook Pros match.
    // The first result must be an iPhone (priority bubbles up); non-priority items
    // still appear afterward at full opacity.
    const results = searchIndex(rows, fuse, 'Pro', ['iphone']);
    expect(results[0].productId).toBe('iphone');
    expect(results.some((r) => r.productId === 'macbook-pro')).toBe(true);
  });

  it('non-priority results without query still surface', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const fuse = buildFuse(rows);
    // Priority = iPhone (3 releases) → first 3 are iPhones, then the rest by recency.
    const results = searchIndex(rows, fuse, '', ['iphone']);
    expect(results.length).toBeGreaterThan(3);
    expect(results.slice(0, 3).every((r) => r.productId === 'iphone')).toBe(true);
    expect(results.slice(3).some((r) => r.productId !== 'iphone')).toBe(true);
  });

  it('year tokens in the query bias toward closer-year items, not recency', () => {
    const rows = buildSearchIndex(SNAP, { now: NOW });
    const fuse = buildFuse(rows);
    // Two MacBook Pro entries: 2024 (newer) and 2018 (older). Search "macbook pro 2018"
    // should rank the 2018 model first even though 2024 is newer.
    const results = searchIndex(rows, fuse, 'macbook pro 2018', null);
    const labels = results.map((r) => r.displayLabel);
    const idx2018 = labels.findIndex((l) => l.includes('2018'));
    const idx2024 = labels.findIndex((l) => l.includes('2024'));
    expect(idx2018).toBeGreaterThanOrEqual(0);
    expect(idx2018).toBeLessThan(idx2024);
  });

  it('ranking can shift dramatically when a year digit is appended (cmdk scroll-jump scenario)', () => {
    // Repro the user-reported "scroll stuck halfway down" bug: typing
    // "macbook pro 202" matches all 2020s MacBook Pros equally, then typing
    // the trailing "0" pushes a 2020-specific model to the top via the
    // year-proximity boost. The previous top result drops several rows. cmdk's
    // value-tracking auto-scroll then drags the dropdown scroll position down
    // to wherever the previously-highlighted item ended up.
    //
    // This test confirms the ranking shift exists; the UI fix in
    // DeviceSearchInput overrides cmdk's auto-scroll by resetting scrollTop
    // in a rAF-deferred effect after each query change.
    const richSnap = normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'macbook-pro', label: 'Apple MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
          endoflifeUrl: 'https://x', releases: [
            { id: 'mbp-m1-2020', label: 'MacBook Pro (13-inch, M1, 2020)', releaseDate: '2020-11-17' },
            { id: 'mbp-m4-2024', label: 'MacBook Pro (14-inch, M4, Nov 2024)', releaseDate: '2024-11-08' },
            { id: 'mbp-m3-2023', label: 'MacBook Pro (14-inch, M3, Nov 2023)', releaseDate: '2023-11-07' },
            { id: 'mbp-m2-2022', label: 'MacBook Pro (13-inch, M2, 2022)', releaseDate: '2022-06-24' },
            { id: 'mbp-m1pro-2021', label: 'MacBook Pro (14-inch, M1 Pro, 2021)', releaseDate: '2021-10-26' },
          ],
        },
      ],
    });
    const rows = buildSearchIndex(richSnap, { now: NOW });
    const fuse = buildFuse(rows);

    const partial = searchIndex(rows, fuse, 'macbook pro 202', null);
    const full = searchIndex(rows, fuse, 'macbook pro 2020', null);
    const partialTop = partial[0]?.releaseId;
    const fullTop = full[0]?.releaseId;

    // The full query targets 2020 specifically; partial matches all 2020s.
    expect(fullTop).toBe('mbp-m1-2020');
    expect(partialTop).not.toBe('mbp-m1-2020'); // a different model leads "macbook pro 202"
    // And the partial-query top falls several rows in the full-query result —
    // exactly the rank shift that triggers cmdk's mid-list auto-scroll.
    const fullIdxOfPartialTop = full.findIndex((r) => r.releaseId === partialTop);
    expect(fullIdxOfPartialTop).toBeGreaterThan(0);
  });
});

describe('tidyReleaseLabel', () => {
  it('strips Windows edition suffixes (W/E)', () => {
    expect(tidyReleaseLabel('windows', '11 24H2 (W)')).toBe('11 24H2');
    expect(tidyReleaseLabel('windows', '10 22H2 (E)')).toBe('10 22H2');
    expect(tidyReleaseLabel('windows', '11 24H2')).toBe('11 24H2');
  });

  it("converts Android single-quoted codenames to parens", () => {
    expect(tidyReleaseLabel('android', "16 'Baklava'")).toBe('16 (Baklava)');
    expect(tidyReleaseLabel('android', "15 'Vanilla Ice Cream'")).toBe('15 (Vanilla Ice Cream)');
    expect(tidyReleaseLabel('android', "13 'Tiramisu'")).toBe('13 (Tiramisu)');
  });

  it('leaves Android labels without codename quotes alone', () => {
    expect(tidyReleaseLabel('android', '15')).toBe('15');
  });

  it('passes other product labels through untouched', () => {
    expect(tidyReleaseLabel('macos', 'macOS 14 (Sonoma)')).toBe('macOS 14 (Sonoma)');
    expect(tidyReleaseLabel('ios', '17')).toBe('17');
  });

  it('returns the input unchanged for non-string labels', () => {
    expect(tidyReleaseLabel('android', null)).toBeNull();
    expect(tidyReleaseLabel('android', undefined)).toBeUndefined();
  });
});
