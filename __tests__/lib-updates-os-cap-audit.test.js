import { describe, it, expect } from 'vitest';

import { normalizeSnapshot } from '../lib/updates/snapshot';
import {
  auditProductOsCap,
  auditSnapshotOsCaps,
  isReleaseOsCapSuspect,
  formatOsCapFinding,
} from '../lib/updates/os-cap-audit';

/**
 * The shape that broke the page in September 2026: endoflife.date published the iOS 27
 * release but left every iPhone's `custom.supportedIosVersions` capped at 26, including
 * models that shipped six months before iOS 27.
 */
function iosSnapshot({ iphoneCeiling = '26', newestIphoneDate = '2026-03-11' } = {}) {
  return normalizeSnapshot({
    schemaVersion: 1, generatedAt: '2026-09-21T00:00:00Z', source: 'x',
    products: [
      {
        id: 'iphone', label: 'Apple iPhone', kind: 'device', family: 'apple', formFactor: 'phone',
        endoflifeUrl: 'https://x',
        releases: [
          { id: '17e', label: '17e', releaseDate: newestIphoneDate, supportedOsRange: iphoneCeiling },
          { id: '15', label: '15', releaseDate: '2023-09-22', supportedOsRange: `17 - ${iphoneCeiling}` },
          { id: '8', label: '8', releaseDate: '2017-09-22', supportedOsRange: '11 - 16' },
        ],
      },
      {
        id: 'ios', label: 'Apple iOS', kind: 'os', family: 'apple', formFactor: 'os',
        endoflifeUrl: 'https://x',
        releases: [
          { id: '27', label: '27', releaseDate: '2026-09-14', latestVersion: '27' },
          { id: '26', label: '26', releaseDate: '2025-09-15', latestVersion: '26.7' },
          { id: '18', label: '18', releaseDate: '2024-09-16', latestVersion: '18.7.10' },
          { id: '17', label: '17', releaseDate: '2023-09-18', isEol: true, eolFrom: '2025-05-13' },
          { id: '16', label: '16', releaseDate: '2022-09-12', latestVersion: '16.7.16' },
        ],
      },
    ],
  });
}

describe('auditProductOsCap', () => {
  it('flags a live line whose ceiling sits one major behind the family latest', () => {
    const snap = iosSnapshot();
    const iphone = snap.products.find((p) => p.id === 'iphone');
    const finding = auditProductOsCap(snap, iphone);
    expect(finding).not.toBeNull();
    expect(finding.ceilingMajor).toBe(26);
    expect(finding.familyLatestMajor).toBe(27);
    expect(finding.newestModelId).toBe('17e');
  });

  it('returns null once upstream bumps the ceiling to the family latest', () => {
    const snap = iosSnapshot({ iphoneCeiling: '27' });
    const iphone = snap.products.find((p) => p.id === 'iphone');
    expect(auditProductOsCap(snap, iphone)).toBeNull();
  });

  it('returns null when the newest model predates its own ceiling OS (dormant line)', () => {
    // Last model shipped before iOS 26 existed, so a ceiling of 26 is plausible history
    // rather than upstream lag.
    const snap = iosSnapshot({ newestIphoneDate: '2024-11-01' });
    const iphone = snap.products.find((p) => p.id === 'iphone');
    expect(auditProductOsCap(snap, iphone)).toBeNull();
  });

  it('returns null for a line more than one major behind (genuinely discontinued)', () => {
    // The 12" MacBook: last model 2017, real ceiling of macOS 13. Nothing stale here.
    const snap = normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-09-21T00:00:00Z', source: 'x',
      products: [
        {
          id: 'macbook', label: 'Apple MacBook', kind: 'device', family: 'apple', formFactor: 'laptop',
          endoflifeUrl: 'https://x',
          releases: [{ id: 'macbook10-1', label: 'MacBook (2017)', releaseDate: '2017-06-05', supportedOsRange: '10.12 - 13' }],
        },
        {
          id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x',
          releases: [
            { id: '27', label: '27', releaseDate: '2026-09-14' },
            { id: '26', label: '26', releaseDate: '2025-09-15' },
            { id: '13', label: '13', releaseDate: '2022-10-24' },
          ],
        },
      ],
    });
    const macbook = snap.products.find((p) => p.id === 'macbook');
    expect(auditProductOsCap(snap, macbook)).toBeNull();
  });

  it('returns null for lines that publish no OS ceiling at all (Samsung, Motorola)', () => {
    const snap = normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-09-21T00:00:00Z', source: 'x',
      products: [
        {
          id: 'samsung-mobile', label: 'Samsung Mobile', kind: 'device', family: 'samsung', formFactor: 'phone',
          endoflifeUrl: 'https://x',
          releases: [{ id: 'galaxy-s26', label: 'Galaxy S26', releaseDate: '2026-09-04' }],
        },
        {
          id: 'android', label: 'Android', kind: 'os', family: 'google', formFactor: 'os',
          endoflifeUrl: 'https://x',
          releases: [{ id: '17', label: '17', releaseDate: '2026-06-10' }],
        },
      ],
    });
    const samsung = snap.products.find((p) => p.id === 'samsung-mobile');
    expect(auditProductOsCap(snap, samsung)).toBeNull();
  });

  it('walks release order rather than major arithmetic, so 10.15 → 11 is adjacent', () => {
    // 11 - 1 = 10, which never matches a ceiling of 10.15. Position does.
    const snap = normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2021-01-01T00:00:00Z', source: 'x',
      products: [
        {
          id: 'macbook-pro', label: 'MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
          endoflifeUrl: 'https://x',
          releases: [{ id: 'mbp-2020', label: 'MacBook Pro (2020)', releaseDate: '2020-05-04', supportedOsRange: '10.15' }],
        },
        {
          id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x',
          releases: [
            { id: '11', label: '11', releaseDate: '2020-11-12' },
            { id: '10.15', label: '10.15', releaseDate: '2019-10-07' },
            { id: '10.14', label: '10.14', releaseDate: '2018-09-24' },
          ],
        },
      ],
    });
    const mbp = snap.products.find((p) => p.id === 'macbook-pro');
    const finding = auditProductOsCap(snap, mbp);
    expect(finding).not.toBeNull();
    expect(finding.ceilingMajor).toBe(10.15);
    expect(finding.familyLatestMajor).toBe(11);
  });

  it('ignores OS products and devices with no OS mapping (watches)', () => {
    const snap = iosSnapshot();
    const ios = snap.products.find((p) => p.id === 'ios');
    expect(auditProductOsCap(snap, ios)).toBeNull();
    expect(auditProductOsCap(snap, { ...ios, kind: 'device', formFactor: 'watch' })).toBeNull();
  });
});

describe('isReleaseOsCapSuspect', () => {
  it('trusts nothing at the suspect line ceiling', () => {
    const snap = iosSnapshot();
    const iphone = snap.products.find((p) => p.id === 'iphone');
    const iphone15 = iphone.releases.find((r) => r.id === '15');
    expect(isReleaseOsCapSuspect(snap, iphone, iphone15)).toBe(true);
  });

  it('leaves genuinely older models in the same line alone', () => {
    // The iPhone 8 really does top out at iOS 16 — its ceiling is below the line's,
    // so it keeps its truncated picker and its max-OS warning.
    const snap = iosSnapshot();
    const iphone = snap.products.find((p) => p.id === 'iphone');
    const iphone8 = iphone.releases.find((r) => r.id === '8');
    expect(isReleaseOsCapSuspect(snap, iphone, iphone8)).toBe(false);
  });

  it('is false for every release once the line is healthy', () => {
    const snap = iosSnapshot({ iphoneCeiling: '27' });
    const iphone = snap.products.find((p) => p.id === 'iphone');
    for (const r of iphone.releases) {
      expect(isReleaseOsCapSuspect(snap, iphone, r)).toBe(false);
    }
  });

  it('is false for releases with no range at all', () => {
    const snap = iosSnapshot();
    const iphone = snap.products.find((p) => p.id === 'iphone');
    expect(isReleaseOsCapSuspect(snap, iphone, { ...iphone.releases[0], supportedOsRange: null })).toBe(false);
    expect(isReleaseOsCapSuspect(snap, iphone, null)).toBe(false);
  });
});

describe('auditSnapshotOsCaps', () => {
  it('reports one finding per affected device line and skips the rest', () => {
    const snap = iosSnapshot();
    const findings = auditSnapshotOsCaps(snap);
    expect(findings.map((f) => f.productId)).toEqual(['iphone']);
  });

  it('returns an empty array for a healthy or malformed snapshot', () => {
    expect(auditSnapshotOsCaps(iosSnapshot({ iphoneCeiling: '27' }))).toEqual([]);
    expect(auditSnapshotOsCaps(null)).toEqual([]);
    expect(auditSnapshotOsCaps({})).toEqual([]);
  });
});

describe('formatOsCapFinding', () => {
  it('names the product, both versions and the model that proves the line is live', () => {
    const [finding] = auditSnapshotOsCaps(iosSnapshot());
    const line = formatOsCapFinding(finding);
    expect(line).toContain('iphone');
    expect(line).toContain('26');
    expect(line).toContain('27');
    expect(line).toContain('17e');
  });
});
