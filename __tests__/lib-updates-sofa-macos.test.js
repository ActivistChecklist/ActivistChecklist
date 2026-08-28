import { describe, it, expect } from 'vitest';

import {
  deriveMacProductsFromSofa,
  inferMacProductLine,
  modelIdentifierToSlug,
  parseReleaseDateFromMarketingName,
} from '../lib/updates/sofa-macos';

describe('inferMacProductLine', () => {
  it('returns null for non-string / unrecognised names', () => {
    expect(inferMacProductLine(null)).toBeNull();
    expect(inferMacProductLine(undefined)).toBeNull();
    expect(inferMacProductLine(42)).toBeNull();
    expect(inferMacProductLine('Apple Virtual Machine')).toBeNull();
    expect(inferMacProductLine('Virtual Machine (x86_64)')).toBeNull();
  });

  it('matches the most specific prefix (longer wins)', () => {
    expect(inferMacProductLine('MacBook Pro (14-inch, M4, Nov 2024)').productId).toBe('macbook-pro');
    expect(inferMacProductLine('MacBook Air (M2, 2022)').productId).toBe('macbook-air');
    expect(inferMacProductLine('iMac Pro (2017)').productId).toBe('imac-pro');
    expect(inferMacProductLine('iMac (24-inch, M3, 2023)').productId).toBe('imac');
    expect(inferMacProductLine('Mac mini (M4, 2024)').productId).toBe('mac-mini');
    expect(inferMacProductLine('Mac Pro (Rack, 2023)').productId).toBe('mac-pro');
    expect(inferMacProductLine('Mac Studio (M4 Max, 2025)').productId).toBe('mac-studio');
  });

  it('falls back to generic MacBook line for the 12-inch retina', () => {
    const line = inferMacProductLine('MacBook (Retina, 12-inch, 2017)');
    expect(line.productId).toBe('macbook');
  });

  it('attaches the canonical Apple support URL to each line', () => {
    expect(inferMacProductLine('MacBook Pro (M4, 2024)').endoflifeUrl).toMatch(/support\.apple\.com/);
    expect(inferMacProductLine('Mac Studio (M4 Max, 2025)').endoflifeUrl).toMatch(/support\.apple\.com/);
  });
});

describe('parseReleaseDateFromMarketingName', () => {
  it('returns null when the name has no year', () => {
    expect(parseReleaseDateFromMarketingName('Mac Studio (M1 Max)')).toBeNull();
    expect(parseReleaseDateFromMarketingName('MacBook Air (13-inch, M5)')).toBeNull();
    expect(parseReleaseDateFromMarketingName('MacBook Neo')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseReleaseDateFromMarketingName(null)).toBeNull();
    expect(parseReleaseDateFromMarketingName(undefined)).toBeNull();
    expect(parseReleaseDateFromMarketingName(42)).toBeNull();
  });

  it('parses month + year (Apple uses Nov for late-fall launches)', () => {
    expect(parseReleaseDateFromMarketingName('MacBook Pro (14-inch, M3, Nov 2023)')).toBe('2023-11-01');
    expect(parseReleaseDateFromMarketingName('MacBook Pro (14-inch, M4 Max, Nov 2024)')).toBe('2024-11-01');
  });

  it('parses Apple seasonal labels (Early/Mid/Late)', () => {
    expect(parseReleaseDateFromMarketingName('Mac mini (Late 2014)')).toBe('2014-10-01');
    expect(parseReleaseDateFromMarketingName('MacBook Air (11-inch, Early 2015)')).toBe('2015-03-01');
    expect(parseReleaseDateFromMarketingName('Mac Pro (Mid 2010)')).toBe('2010-06-01');
  });

  it('falls back to plain year (Jan 1)', () => {
    expect(parseReleaseDateFromMarketingName('MacBook Pro (13-inch, M2, 2022)')).toBe('2022-01-01');
    expect(parseReleaseDateFromMarketingName('Mac Pro (2019)')).toBe('2019-01-01');
  });

  it('prefers month over plain year when both are present', () => {
    // Real SOFA name with Nov 2024 — should pick Nov, not the year alone.
    expect(parseReleaseDateFromMarketingName('MacBook Pro (16-inch, M4 Pro, Nov 2024)')).toBe('2024-11-01');
  });
});

describe('modelIdentifierToSlug', () => {
  it('converts Mac15,3 style identifiers to URL-safe slugs', () => {
    expect(modelIdentifierToSlug('Mac15,3')).toBe('mac15-3');
    expect(modelIdentifierToSlug('MacBookPro18,3')).toBe('macbookpro18-3');
    expect(modelIdentifierToSlug('MacPro7,1-Rack')).toBe('macpro7-1-rack');
  });

  it('returns null for empty / non-string input', () => {
    expect(modelIdentifierToSlug(null)).toBeNull();
    expect(modelIdentifierToSlug('')).toBeNull();
    expect(modelIdentifierToSlug(',,,')).toBeNull();
  });
});

describe('deriveMacProductsFromSofa', () => {
  // Minimal SOFA-shaped Models map used by every test below.
  const sample = {
    'Mac15,3': {
      MarketingName: 'MacBook Pro (14-inch, M3, Nov 2023)',
      OSVersions: [26, 15, 14, 13],
    },
    'Mac15,4': {
      MarketingName: 'iMac (24-inch, M3, 2023)',
      OSVersions: [26, 15, 14],
    },
    'Mac14,3': {
      MarketingName: 'Mac mini (M2, 2023)',
      OSVersions: [26, 15, 14, 13, 12],
    },
    'VMM-x86_64': {
      MarketingName: 'Virtual Machine (x86_64)',
      OSVersions: [26],
    },
    'MacBookNeo': {
      // Real SOFA entry — pre-release, no year in name. Should be dropped.
      MarketingName: 'MacBook Neo',
      OSVersions: [26],
    },
  };

  it('returns [] for null / non-object input', () => {
    expect(deriveMacProductsFromSofa(null)).toEqual([]);
    expect(deriveMacProductsFromSofa(undefined)).toEqual([]);
    expect(deriveMacProductsFromSofa('not an object')).toEqual([]);
  });

  it('groups models into product lines', () => {
    const products = deriveMacProductsFromSofa(sample);
    const ids = products.map((p) => p.id);
    expect(ids).toContain('macbook-pro');
    expect(ids).toContain('imac');
    expect(ids).toContain('mac-mini');
  });

  it('skips VMs and undated pre-release entries', () => {
    const products = deriveMacProductsFromSofa(sample);
    const allLabels = products.flatMap((p) => p.releases.map((r) => r.label));
    expect(allLabels).not.toContain('Virtual Machine (x86_64)');
    expect(allLabels).not.toContain('MacBook Neo');
  });

  it('uses the highest OSVersion as supportedOsRange', () => {
    const products = deriveMacProductsFromSofa(sample);
    const mbp = products.find((p) => p.id === 'macbook-pro');
    expect(mbp.releases[0].supportedOsRange).toBe('26');
  });

  it('emits the canonical product fields', () => {
    const products = deriveMacProductsFromSofa(sample);
    const mbp = products.find((p) => p.id === 'macbook-pro');
    expect(mbp).toMatchObject({
      id: 'macbook-pro',
      label: 'Apple MacBook Pro',
      kind: 'device',
      family: 'apple',
      formFactor: 'laptop',
    });
    expect(mbp.endoflifeUrl).toMatch(/support\.apple\.com/);
  });

  it('sorts releases newest-first inside each product', () => {
    const multi = {
      'Mac10,1': { MarketingName: 'MacBook Pro (13-inch, 2018)', OSVersions: [15] },
      'Mac15,3': { MarketingName: 'MacBook Pro (14-inch, M3, Nov 2023)', OSVersions: [26] },
      'Mac14,7': { MarketingName: 'MacBook Pro (13-inch, M2, 2022)', OSVersions: [26] },
    };
    const products = deriveMacProductsFromSofa(multi);
    const dates = products[0].releases.map((r) => r.releaseDate);
    expect(dates).toEqual(['2023-11-01', '2022-01-01', '2018-01-01']);
  });

  it('drops models with no usable OSVersions array', () => {
    const broken = {
      'Mac15,3': { MarketingName: 'MacBook Pro (14-inch, M3, Nov 2023)', OSVersions: [26] },
      'Mac15,4': { MarketingName: 'iMac (24-inch, M3, 2023)' /* no OSVersions */ },
      'Mac15,5': { MarketingName: 'Mac mini (M2, 2023)', OSVersions: 'not an array' },
    };
    const products = deriveMacProductsFromSofa(broken);
    expect(products.map((p) => p.id)).toEqual(['macbook-pro']);
  });
});
