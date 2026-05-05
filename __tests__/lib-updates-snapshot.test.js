import { describe, it, expect } from 'vitest';

import {
  platformGroupForFamily,
  normalizeRelease,
  normalizeProduct,
  normalizeSnapshot,
  findProduct,
  findRelease,
  osProductForDevice,
  latestSupportedOsRelease,
  parseOsRange,
  findOsReleaseByMajor,
} from '../lib/updates/snapshot';

describe('platformGroupForFamily', () => {
  it('maps apple → apple', () => {
    expect(platformGroupForFamily('apple')).toBe('apple');
  });
  it('maps microsoft → windows', () => {
    expect(platformGroupForFamily('microsoft')).toBe('windows');
  });
  it.each([['google'], ['samsung'], ['motorola'], ['oneplus'], ['nokia']])(
    '%s → android',
    (family) => {
      expect(platformGroupForFamily(family)).toBe('android');
    }
  );
  it('unknown family → other', () => {
    expect(platformGroupForFamily('beepboop')).toBe('other');
    expect(platformGroupForFamily(undefined)).toBe('other');
  });
});

describe('normalizeRelease', () => {
  it('materializes stripped defaults', () => {
    const r = normalizeRelease({ id: '12-pro', label: '12 Pro', releaseDate: '2020-10-23' });
    expect(r.isEol).toBe(false);
    expect(r.eolFrom).toBeNull();
    expect(r.isEoas).toBe(false);
    expect(r.eoasFrom).toBeNull();
    expect(r.isMaintained).toBe(true);
    expect(r.supportedOsRange).toBeNull();
  });

  it('preserves explicit booleans', () => {
    const r = normalizeRelease({
      id: 'galaxy-old',
      label: 'Galaxy Old',
      releaseDate: '2018-01-01',
      isEol: true,
      isMaintained: false,
    });
    expect(r.isEol).toBe(true);
    expect(r.isMaintained).toBe(false);
  });

  it('treats missing isMaintained as true (the default)', () => {
    const r = normalizeRelease({ id: 'x', label: 'x', releaseDate: '2025-01-01' });
    expect(r.isMaintained).toBe(true);
  });

  it('rejects non-http(s) latestVersionLink (XSS defense)', () => {
    const r = normalizeRelease({
      id: 'ios-x',
      label: 'iOS X',
      releaseDate: '2025-01-01',
      latestVersionLink: 'javascript:alert(1)',
    });
    expect(r.latestVersionLink).toBeNull();
  });

  it('preserves https latestVersionLink', () => {
    const r = normalizeRelease({
      id: 'ios-x',
      label: 'iOS X',
      releaseDate: '2025-01-01',
      latestVersionLink: 'https://developer.apple.com/notes',
    });
    expect(r.latestVersionLink).toBe('https://developer.apple.com/notes');
  });
});

describe('normalizeProduct', () => {
  it('rejects javascript: endoflifeUrl', () => {
    const p = normalizeProduct({
      id: 'mal',
      label: 'Mal',
      kind: 'device',
      family: 'apple',
      formFactor: 'phone',
      endoflifeUrl: 'javascript:alert(1)',
      releases: [],
    });
    expect(p.endoflifeUrl).toBeNull();
  });

  it('rejects data: endoflifeUrl', () => {
    const p = normalizeProduct({
      id: 'mal',
      label: 'Mal',
      kind: 'device',
      family: 'apple',
      formFactor: 'phone',
      endoflifeUrl: 'data:text/html,<script>',
      releases: [],
    });
    expect(p.endoflifeUrl).toBeNull();
  });

  it('preserves http and https URLs', () => {
    expect(
      normalizeProduct({
        id: 'p', label: 'P', kind: 'device', family: 'apple', formFactor: 'phone',
        endoflifeUrl: 'http://example.com', releases: [],
      }).endoflifeUrl
    ).toBe('http://example.com');
    expect(
      normalizeProduct({
        id: 'p', label: 'P', kind: 'device', family: 'apple', formFactor: 'phone',
        endoflifeUrl: 'https://endoflife.date/iphone', releases: [],
      }).endoflifeUrl
    ).toBe('https://endoflife.date/iphone');
  });

  it('aliases default to empty array', () => {
    const p = normalizeProduct({
      id: 'p', label: 'P', kind: 'device', family: 'apple', formFactor: 'phone',
      endoflifeUrl: 'https://x.example', releases: [],
    });
    expect(p.aliases).toEqual([]);
  });
});

describe('normalizeSnapshot', () => {
  it('throws on missing products array', () => {
    expect(() => normalizeSnapshot({})).toThrow('Invalid snapshot shape');
    expect(() => normalizeSnapshot(null)).toThrow();
  });

  it('roundtrips a valid snapshot', () => {
    const snap = normalizeSnapshot({
      schemaVersion: 1,
      generatedAt: '2026-05-03T00:00:00Z',
      source: 'https://endoflife.date/api/v1/',
      products: [
        {
          id: 'iphone',
          label: 'Apple iPhone',
          kind: 'device',
          family: 'apple',
          formFactor: 'phone',
          endoflifeUrl: 'https://endoflife.date/iphone',
          releases: [],
        },
      ],
    });
    expect(snap.products).toHaveLength(1);
    expect(snap.products[0].family).toBe('apple');
  });
});

// Test fixture used by lookup helpers below.
const FIXTURE = normalizeSnapshot({
  schemaVersion: 1,
  generatedAt: '2026-05-03T00:00:00Z',
  source: 'https://endoflife.date/api/v1/',
  products: [
    {
      id: 'iphone', label: 'Apple iPhone', kind: 'device', family: 'apple', formFactor: 'phone',
      endoflifeUrl: 'https://endoflife.date/iphone',
      releases: [
        { id: '12-pro', label: '12 Pro', releaseDate: '2020-10-23', supportedOsRange: '14 - 26' },
        { id: '7', label: '7', releaseDate: '2016-09-16', isEol: true, eolFrom: '2023-09-12', supportedOsRange: '10 - 15' },
      ],
    },
    {
      id: 'ios', label: 'Apple iOS', kind: 'os', family: 'apple', formFactor: 'os',
      endoflifeUrl: 'https://endoflife.date/ios',
      releases: [
        { id: '26', label: '26', releaseDate: '2025-09-15', latestVersion: '26.4.2' },
        { id: '18', label: '18', releaseDate: '2024-09-16', isEol: true, eolFrom: '2026-04-22', latestVersion: '18.7.8' },
        { id: '15', label: '15', releaseDate: '2021-09-20', isEol: true, eolFrom: '2025-03-31', latestVersion: '15.8.7' },
      ],
    },
    {
      id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
      endoflifeUrl: 'https://endoflife.date/macos',
      releases: [
        { id: '26', label: '26', releaseDate: '2025-09-15', latestVersion: '26.0.1' },
      ],
    },
    {
      id: 'macbook-pro', label: 'Apple MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
      endoflifeUrl: 'https://support.apple.com/HT201624',
      releases: [
        { id: '14in-2024-m4', label: 'MacBook Pro 14-inch (2024, M4)', releaseDate: '2024-11-08', supportedOsRange: '26' },
      ],
    },
  ],
});

describe('findProduct / findRelease', () => {
  it('finds an existing product', () => {
    expect(findProduct(FIXTURE, 'iphone').label).toBe('Apple iPhone');
  });

  it('returns null for missing product', () => {
    expect(findProduct(FIXTURE, 'nope')).toBeNull();
  });

  it('returns null for missing snapshot or id', () => {
    expect(findProduct(null, 'iphone')).toBeNull();
    expect(findProduct(FIXTURE, '')).toBeNull();
  });

  it('finds release with product reference', () => {
    const result = findRelease(FIXTURE, 'iphone', '12-pro');
    expect(result.product.id).toBe('iphone');
    expect(result.release.label).toBe('12 Pro');
  });

  it('returns null when the release id is wrong', () => {
    expect(findRelease(FIXTURE, 'iphone', 'never-shipped')).toBeNull();
  });
});

describe('osProductForDevice', () => {
  it('iPhone → iOS', () => {
    const iphone = findProduct(FIXTURE, 'iphone');
    expect(osProductForDevice(FIXTURE, iphone).id).toBe('ios');
  });

  it('MacBook Pro → macOS', () => {
    const mbp = findProduct(FIXTURE, 'macbook-pro');
    expect(osProductForDevice(FIXTURE, mbp).id).toBe('macos');
  });

  it('returns null for OS products', () => {
    const ios = findProduct(FIXTURE, 'ios');
    expect(osProductForDevice(FIXTURE, ios)).toBeNull();
  });
});

describe('latestSupportedOsRelease', () => {
  it('picks the highest non-EOL major version', () => {
    const ios = findProduct(FIXTURE, 'ios');
    expect(latestSupportedOsRelease(ios).id).toBe('26');
  });

  it('returns null when all releases are EOL', () => {
    const allEol = normalizeProduct({
      id: 'ancient', label: 'Ancient', kind: 'os', family: 'apple', formFactor: 'os',
      endoflifeUrl: 'https://x', releases: [
        { id: '10', label: '10', releaseDate: '2010-01-01', isEol: true },
        { id: '11', label: '11', releaseDate: '2011-01-01', isEol: true },
      ],
    });
    expect(latestSupportedOsRelease(allEol)).toBeNull();
  });

  it('returns null for null product', () => {
    expect(latestSupportedOsRelease(null)).toBeNull();
  });
});

describe('parseOsRange', () => {
  it('parses range "14 - 26"', () => {
    expect(parseOsRange('14 - 26')).toEqual({ min: 14, max: 26 });
  });

  it('parses single-value "26"', () => {
    expect(parseOsRange('26')).toEqual({ min: 26, max: 26 });
  });

  it('parses range without spaces "14-26"', () => {
    expect(parseOsRange('14-26')).toEqual({ min: 14, max: 26 });
  });

  it('returns null for non-string / empty / garbage input', () => {
    expect(parseOsRange(null)).toBeNull();
    expect(parseOsRange('')).toBeNull();
    expect(parseOsRange('abc')).toBeNull();
  });
});

describe('findOsReleaseByMajor', () => {
  it('finds iOS 18 by major', () => {
    const ios = findProduct(FIXTURE, 'ios');
    expect(findOsReleaseByMajor(ios, 18).label).toBe('18');
  });

  it('returns null for missing major', () => {
    const ios = findProduct(FIXTURE, 'ios');
    expect(findOsReleaseByMajor(ios, 99)).toBeNull();
  });

  it('returns null for null product', () => {
    expect(findOsReleaseByMajor(null, 1)).toBeNull();
  });
});
