import { describe, it, expect } from 'vitest';

import {
  deriveMacProductsFromSofa,
  estimateReleaseDate,
  inferMacProductLine,
  modelIdentifierToSlug,
  parseReleaseDateFromMarketingName,
  sofaTrackingFloor,
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
    'Mac17,5': {
      // Real SOFA entry. Apple's M5-era names carry no year, so it must survive
      // the undated path rather than being mistaken for a pre-release placeholder.
      MarketingName: 'MacBook Neo',
      OSVersions: [27, 26],
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

  it('skips VMs, which match no product-line prefix', () => {
    const products = deriveMacProductsFromSofa(sample);
    const allLabels = products.flatMap((p) => p.releases.map((r) => r.label));
    expect(allLabels).not.toContain('Virtual Machine (x86_64)');
  });

  it('keeps undated models (Apple stopped putting years in M5-era names)', () => {
    const products = deriveMacProductsFromSofa(sample);
    const allLabels = products.flatMap((p) => p.releases.map((r) => r.label));
    expect(allLabels).toContain('MacBook Neo');
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

describe('sofaTrackingFloor', () => {
  it('returns the oldest macOS major any model supports', () => {
    expect(sofaTrackingFloor({
      a: { OSVersions: [27, 26] },
      b: { OSVersions: [27, 26, 15, 14, 13, 12] },
    })).toBe(12);
  });

  it('ignores models with missing or unusable OSVersions', () => {
    expect(sofaTrackingFloor({
      a: { OSVersions: [26] },
      b: {},
      c: { OSVersions: 'nope' },
      d: null,
    })).toBe(26);
  });

  it('returns null for empty / non-object input', () => {
    expect(sofaTrackingFloor({})).toBeNull();
    expect(sofaTrackingFloor(null)).toBeNull();
    expect(sofaTrackingFloor('x')).toBeNull();
  });
});

describe('estimateReleaseDate', () => {
  const macosDates = { '26': '2025-09-15', '15': '2024-09-16', '12': '2021-10-25' };

  it('dates a model to the release of the oldest macOS it can boot', () => {
    expect(estimateReleaseDate(26, 12, macosDates)).toBe('2025-09-15');
  });

  it('refuses when the minimum sits at SOFA tracking floor', () => {
    // A minimum of 12 when SOFA tracks nothing below 12 is clamped by the feed's
    // window, not the hardware — this is the 2017 iMac Pro, which would otherwise
    // be dated to 2021.
    expect(estimateReleaseDate(12, 12, macosDates)).toBeNull();
    expect(estimateReleaseDate(11, 12, macosDates)).toBeNull();
  });

  it('returns null when the macOS major has no known release date', () => {
    expect(estimateReleaseDate(27, 12, macosDates)).toBeNull();
    expect(estimateReleaseDate(26, 12, null)).toBeNull();
  });

  it('returns null for a non-numeric minimum', () => {
    expect(estimateReleaseDate(NaN, 12, macosDates)).toBeNull();
    expect(estimateReleaseDate(undefined, 12, macosDates)).toBeNull();
  });
});

describe('deriveMacProductsFromSofa — undated models', () => {
  const macosReleaseDates = { '26': '2025-09-15', '15': '2024-09-16', '12': '2021-10-25' };

  const models = {
    'Mac17,5': { MarketingName: 'MacBook Neo', OSVersions: [27, 26] },
    'Mac17,2': { MarketingName: 'MacBook Pro 14-inch (M5)', OSVersions: [27, 26] },
    'Mac15,3': { MarketingName: 'MacBook Pro (14-inch, M3, Nov 2023)', OSVersions: [27, 26, 15, 14, 13, 12] },
    'iMacPro1,1': { MarketingName: 'iMac Pro', OSVersions: [15, 14, 13, 12] },
  };

  it('estimates a date from the oldest bootable macOS and flags it', () => {
    const products = deriveMacProductsFromSofa(models, { macosReleaseDates });
    const neo = products.find((p) => p.id === 'macbook').releases[0];
    expect(neo.label).toBe('MacBook Neo');
    expect(neo.releaseDate).toBe('2025-09-15');
    expect(neo.releaseDateIsEstimate).toBe(true);
  });

  it('never flags a date parsed from the marketing name', () => {
    const products = deriveMacProductsFromSofa(models, { macosReleaseDates });
    const m3 = products.find((p) => p.id === 'macbook-pro').releases
      .find((r) => r.id === 'mac15-3');
    expect(m3.releaseDate).toBe('2023-11-01');
    expect(m3.releaseDateIsEstimate).toBeUndefined();
  });

  it('leaves a model clamped at the tracking floor undated rather than guessing', () => {
    const products = deriveMacProductsFromSofa(models, { macosReleaseDates });
    const imacPro = products.find((p) => p.id === 'imac-pro').releases[0];
    expect(imacPro.releaseDate).toBeNull();
    expect(imacPro.releaseDateIsEstimate).toBeUndefined();
  });

  it('honours an explicit trackingFloor over one computed from the map', () => {
    // The real fetcher passes the RAW SOFA floor because the map it hands in has
    // the legacy file merged into it, whose old majors would sink the computed one.
    const withLegacy = { ...models, 'MacBookAir6,1': { MarketingName: 'MacBook Air (11-inch, Mid 2013)', OSVersions: [11] } };
    const guessed = deriveMacProductsFromSofa(withLegacy, { macosReleaseDates });
    expect(guessed.find((p) => p.id === 'imac-pro').releases[0].releaseDate).toBe('2021-10-25');

    const guarded = deriveMacProductsFromSofa(withLegacy, { macosReleaseDates, trackingFloor: 12 });
    expect(guarded.find((p) => p.id === 'imac-pro').releases[0].releaseDate).toBeNull();
  });

  it('leaves the date null when no macOS dates are supplied', () => {
    const products = deriveMacProductsFromSofa(models);
    const neo = products.find((p) => p.id === 'macbook').releases[0];
    expect(neo.releaseDate).toBeNull();
    expect(neo.releaseDateIsEstimate).toBeUndefined();
  });

  it('sorts an undatable model last within its line, behind estimates and real dates', () => {
    const mixed = {
      // Undatable: minimum is at the tracking floor.
      'Mac13,2': { MarketingName: 'Mac Studio (M1 Ultra)', OSVersions: [27, 12] },
      'Mac14,13': { MarketingName: 'Mac Studio (M2 Max, 2023)', OSVersions: [27, 13] },
      // Undated name, but a minimum above the floor, so it gets an estimate.
      'Mac17,1': { MarketingName: 'Mac Studio (M5 Ultra)', OSVersions: [27, 26] },
    };
    const products = deriveMacProductsFromSofa(mixed, { macosReleaseDates, trackingFloor: 12 });
    const studio = products.find((p) => p.id === 'mac-studio');
    expect(studio.releases.map((r) => r.id)).toEqual(['mac17-1', 'mac14-13', 'mac13-2']);
    expect(studio.releases[0].releaseDateIsEstimate).toBe(true);
    expect(studio.releases[2].releaseDate).toBeNull();
  });
});
