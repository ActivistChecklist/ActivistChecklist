import { describe, it, expect } from 'vitest';

import { normalizeRelease, normalizeProduct, normalizeSnapshot } from '../lib/updates/snapshot';
import {
  classifyResult,
  buildLatestOsReminder,
  buildDeviceMaxOsWarning,
  buildOsCheckOptions,
  buildStuckOnOldOsClassification,
  buildAppleSupportEstimate,
  latestPickerMajor,
} from '../lib/updates/result-logic';

const NOW = new Date('2026-05-03T00:00:00Z');

function release(overrides) {
  return normalizeRelease({ id: 'r', label: 'R', releaseDate: '2024-01-01', ...overrides });
}

function deviceProduct(overrides = {}) {
  return normalizeProduct({
    id: 'iphone', label: 'Apple iPhone', kind: 'device', family: 'apple', formFactor: 'phone',
    endoflifeUrl: 'https://x', releases: [], ...overrides,
  });
}

function osProduct(overrides = {}) {
  return normalizeProduct({
    id: 'ios', label: 'Apple iOS', kind: 'os', family: 'apple', formFactor: 'os',
    endoflifeUrl: 'https://x', releases: [], ...overrides,
  });
}

describe('classifyResult — OS variants', () => {
  it('os-supported when not EOL', () => {
    const product = osProduct();
    const r = release({ id: '26', label: '26', releaseDate: '2025-09-15', latestVersion: '26.4.2' });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('os-supported');
  });

  it('os-eol when isEol=true', () => {
    const product = osProduct();
    const r = release({ isEol: true, eolFrom: '2025-03-31' });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('os-eol');
  });

  it('os-eol when eolFrom is in the past (even without isEol flag)', () => {
    const product = osProduct();
    const r = release({ eolFrom: '2024-01-01' });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('os-eol');
  });
});

describe('classifyResult — device decision tree', () => {
  it('rule 1: eolFrom in the past → device-eol', () => {
    const product = deviceProduct();
    const r = release({ eolFrom: '2020-01-01' });
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-eol');
    expect(c.reason).toBe('eolFrom-past');
  });

  it('rule 2: isEol=true → device-eol', () => {
    const product = deviceProduct();
    const r = release({ isEol: true });
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-eol');
    expect(c.reason).toBe('isEol-true');
  });

  it('rule 3: isMaintained=false → device-eol (regression: catches 161 Samsung devices)', () => {
    const product = deviceProduct();
    const r = release({ isMaintained: false, releaseDate: '2018-01-01' });
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-eol');
    expect(c.reason).toBe('unmaintained');
  });

  it('rule 4: eoasFrom in the past, no eolFrom → device-eol', () => {
    const product = deviceProduct();
    const r = release({ eoasFrom: '2024-01-01', releaseDate: '2018-01-01' });
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-eol');
    expect(c.reason).toBe('eoas-past');
  });

  it('rule 5: eolFrom in the future → device-supported', () => {
    const product = deviceProduct();
    const r = release({ eolFrom: '2032-01-01', releaseDate: '2025-01-01' });
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-supported');
    expect(c.reason).toBe('eolFrom-future');
  });

  it('rule 6: maintained, recent (<3y), no signals → device-supported', () => {
    const product = deviceProduct();
    const r = release({ releaseDate: '2024-06-01' });
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-supported');
    expect(c.reason).toBe('maintained-recent');
  });

  it('rule 7: maintained, mid-age (3-6y), no signals → device-uncertain', () => {
    const product = deviceProduct();
    const r = release({ releaseDate: '2022-01-01' }); // ~4.3 years old at NOW
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-uncertain');
    expect(c.reason).toBe('age-heuristic-mid');
  });

  it('rule 8: maintained, old (≥6y), no signals → device-eol via age heuristic', () => {
    const product = deviceProduct();
    const r = release({ releaseDate: '2018-01-01' }); // ~8.3 years old
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-eol');
    expect(c.reason).toBe('age-heuristic-old');
  });

  it('precedence: explicit eolFrom-past wins over age heuristic for old devices', () => {
    const product = deviceProduct();
    const r = release({ eolFrom: '2022-01-01', releaseDate: '2015-01-01' });
    expect(classifyResult({ product, release: r }, { now: NOW }).reason).toBe('eolFrom-past');
  });

  it('isMaintained=false beats the age heuristic for recent devices', () => {
    const product = deviceProduct();
    const r = release({ isMaintained: false, releaseDate: '2024-01-01' });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('device-eol');
  });

  it('exposes ageYears on the classification', () => {
    const product = deviceProduct();
    const r = release({ releaseDate: '2024-05-03' });
    const c = classifyResult({ product, release: r }, { now: NOW });
    // ~2 years
    expect(c.ageYears).toBeGreaterThan(1.9);
    expect(c.ageYears).toBeLessThan(2.1);
  });
});

describe('classifyResult — supportedOsRange cross-reference', () => {
  // Snapshot mirroring the real iOS / iPhone shape so the cross-reference rule
  // can navigate from device → osProduct → latestSupportedOsRelease.
  function makeSnapshot() {
    return normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'iphone', label: 'Apple iPhone', kind: 'device', family: 'apple', formFactor: 'phone',
          endoflifeUrl: 'https://x', releases: [
            { id: '13', label: '13', releaseDate: '2021-09-24', supportedOsRange: '15 - 26' },
            { id: '11', label: '11', releaseDate: '2019-09-20', supportedOsRange: '13 - 26' },
            { id: '8', label: '8', releaseDate: '2017-09-22', supportedOsRange: '11 - 16' },
          ],
        },
        {
          id: 'ios', label: 'Apple iOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '26', label: '26', releaseDate: '2025-09-15' },
            { id: '18', label: '18', releaseDate: '2024-09-16', isEol: true, eolFrom: '2026-04-22' },
            { id: '16', label: '16', releaseDate: '2022-09-12', isEol: true, eolFrom: '2025-09-15' },
          ],
        },
      ],
    });
  }

  it('iPhone 13 (4.6 yrs old, max iOS 26 = current) → device-supported via os-current rule', () => {
    // Without the snapshot rule, this would fall to age-heuristic-mid (yellow). Regression
    // test for the bug where endoflife shows "Yes still supported" but our app said "uncertain".
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '13');
    const c = classifyResult({ product, release: r }, { now: NOW, snapshot: snap });
    expect(c.variant).toBe('device-supported');
    expect(c.reason).toBe('os-current');
  });

  it('iPhone 11 (6.6 yrs old, max iOS 26 = current) → device-supported (overrides age heuristic)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '11');
    const c = classifyResult({ product, release: r }, { now: NOW, snapshot: snap });
    // 11 is over 6 years old — without supportedOsRange it would be age-heuristic-old (red).
    expect(c.variant).toBe('device-supported');
    expect(c.reason).toBe('os-current');
  });

  it('iPhone 8 (max iOS 16, iOS 16 is EOL) → device-eol via device-max-os-eol', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    // Strip the explicit eolFrom so we test the cross-reference path specifically.
    const r = { ...product.releases.find((x) => x.id === '8'), isEol: false, eolFrom: null, isMaintained: true };
    const c = classifyResult({ product, release: r }, { now: NOW, snapshot: snap });
    // Max iOS 16 is itself EOL → device is definitively EOL via the OS chain,
    // no need to fall through to the age heuristic.
    expect(c.variant).toBe('device-eol');
    expect(c.reason).toBe('device-max-os-eol');
    expect(c.effectiveEolFrom).toBe('2025-09-15'); // iOS 16's eolFrom
  });

  it('without snapshot, the rule is silently skipped', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '13');
    // No snapshot → falls through to age-heuristic-mid for a 4.6-year-old device.
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-uncertain');
  });

  it('explicit eolFrom-past beats os-current (red wins over green)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    // Hypothetical: iPhone 13 with a past eolFrom should still be red.
    const r = { ...product.releases.find((x) => x.id === '13'), eolFrom: '2025-01-01' };
    const c = classifyResult({ product, release: r }, { now: NOW, snapshot: snap });
    expect(c.variant).toBe('device-eol');
    expect(c.reason).toBe('eolFrom-past');
  });

  it('older Mac whose max OS is still maintained → device-supported via device-max-os-supported', () => {
    // 2018 MacBook Pro analogue: max macOS 15 (current = 26 in this snapshot, but
    // 15 still has updates). Without this rule, the age heuristic would have
    // misclassified it as device-eol just for being old.
    const snap = normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'macbook-pro', label: 'Apple MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
          endoflifeUrl: 'https://x',
          releases: [{ id: '13in-2018', label: '13-inch 2018', releaseDate: '2018-07-12', supportedOsRange: '15' }],
        },
        {
          id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x',
          releases: [
            { id: '26', label: '26', releaseDate: '2025-09-15' },
            { id: '15', label: '15', releaseDate: '2024-09-15', eolFrom: '2027-09-15' },
          ],
        },
      ],
    });
    const product = snap.products.find((p) => p.id === 'macbook-pro');
    const r = product.releases[0];
    const c = classifyResult({ product, release: r }, { now: NOW, snapshot: snap });
    expect(c.variant).toBe('device-supported');
    expect(c.reason).toBe('device-max-os-supported');
    expect(c.effectiveEolFrom).toBe('2027-09-15');
  });

  it('older Mac whose max OS is approaching EOL → device-eol-soon via device-max-os-soon', () => {
    // Hypothetical 2018 MacBook Pro pinned to macOS 13, eolFrom 6 months out.
    const snap = normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'macbook-pro', label: 'Apple MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
          endoflifeUrl: 'https://x',
          releases: [{ id: '13in-2017', label: '13-inch 2017', releaseDate: '2017-06-05', supportedOsRange: '13' }],
        },
        {
          id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x',
          releases: [
            { id: '26', label: '26', releaseDate: '2025-09-15' },
            { id: '13', label: '13', releaseDate: '2022-10-24', eolFrom: '2026-11-01' },
          ],
        },
      ],
    });
    const product = snap.products.find((p) => p.id === 'macbook-pro');
    const r = product.releases[0];
    const c = classifyResult({ product, release: r }, { now: NOW, snapshot: snap });
    expect(c.variant).toBe('device-eol-soon');
    expect(c.reason).toBe('device-max-os-soon');
    expect(c.effectiveEolFrom).toBe('2026-11-01');
  });
});

describe('classifyResult — eol-soon warning state', () => {
  function deviceProductLocal(overrides = {}) {
    return normalizeProduct({
      id: 'pixel', label: 'Google Pixel', kind: 'device', family: 'google', formFactor: 'phone',
      endoflifeUrl: 'https://x', releases: [], ...overrides,
    });
  }
  function osProductLocal(overrides = {}) {
    return normalizeProduct({
      id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
      endoflifeUrl: 'https://x', releases: [], ...overrides,
    });
  }

  it('device with eolFrom 6 months out → device-eol-soon', () => {
    const product = deviceProductLocal();
    const r = normalizeRelease({
      id: 'pixel-7',
      label: 'Pixel 7',
      releaseDate: '2022-10-13',
      eolFrom: '2026-11-01',
    });
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-eol-soon');
    expect(c.reason).toBe('eolFrom-soon');
    expect(c.effectiveEolFrom).toBe('2026-11-01');
  });

  it('device with eolFrom 2 years out → still device-supported', () => {
    const product = deviceProductLocal();
    const r = normalizeRelease({
      id: 'pixel-9', label: 'Pixel 9', releaseDate: '2024-08-22', eolFrom: '2028-08-01',
    });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('device-supported');
  });

  it('os with eolFrom 4 months out → os-eol-soon', () => {
    const product = osProductLocal();
    const r = normalizeRelease({ id: '14', label: '14', releaseDate: '2023-09-26', eolFrom: '2026-09-15' });
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('os-eol-soon');
  });

  it('Mac whose top macOS reaches EOL within 9 months → device-eol-soon', () => {
    // Build a snapshot so the cross-reference path can find the OS major and read its eolFrom.
    const snap = normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'macbook-pro', label: 'Apple MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
          endoflifeUrl: 'https://x', releases: [
            // 2018 MBP — Apple still ships macOS 15 to it but 15 will EOL soon.
            { id: '13in-2018', label: 'MacBook Pro 13-inch (2018)', releaseDate: '2018-07-12', supportedOsRange: '15' },
          ],
        },
        {
          id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '15', label: 'macOS 15 (Sequoia)', releaseDate: '2024-09-16', latestVersion: '15.7.5', codename: 'Sequoia', eolFrom: '2026-12-01' },
          ],
        },
      ],
    });
    const product = snap.products.find((p) => p.id === 'macbook-pro');
    const r = product.releases[0];
    const c = classifyResult({ product, release: r }, { now: NOW, snapshot: snap });
    expect(c.variant).toBe('device-eol-soon');
    expect(c.reason).toBe('os-eolFrom-soon');
    expect(c.effectiveEolFrom).toBe('2026-12-01');
  });

  it('eolFrom in the past stays device-eol, never device-eol-soon', () => {
    const product = deviceProductLocal();
    const r = normalizeRelease({
      id: 'pixel-old', label: 'Old', releaseDate: '2020-01-01', eolFrom: '2026-04-30',
    });
    const c = classifyResult({ product, release: r }, { now: NOW });
    expect(c.variant).toBe('device-eol');
    expect(c.reason).toBe('eolFrom-past');
  });

  it('eolFrom 1 month away → device-eol-soon (well inside the warning window)', () => {
    const product = deviceProductLocal();
    const r = normalizeRelease({
      id: 'p', label: 'P', releaseDate: '2022-01-01', eolFrom: '2026-06-03',
    });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('device-eol-soon');
  });

  it('eolFrom roughly 9 months away → still device-eol-soon (boundary inclusive)', () => {
    const product = deviceProductLocal();
    // ~9 months from 2026-05-03 ≈ 2027-02-01. The 9-month cutoff is months ≤ 9, so this lands inside.
    const r = normalizeRelease({
      id: 'p', label: 'P', releaseDate: '2024-02-01', eolFrom: '2027-01-25',
    });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('device-eol-soon');
  });

  it('eolFrom well past 9 months away → device-supported', () => {
    const product = deviceProductLocal();
    const r = normalizeRelease({
      id: 'p', label: 'P', releaseDate: '2024-02-01', eolFrom: '2027-06-01',
    });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('device-supported');
  });

  it('isMaintained=false beats eol-soon (red wins over yellow)', () => {
    const product = deviceProductLocal();
    // Edge case: a release with eolFrom in the warning window AND isMaintained=false.
    // Rule 2 (unmaintained) fires before rule 4 (eolFrom future) → device-eol.
    const r = normalizeRelease({
      id: 'p', label: 'P', releaseDate: '2022-01-01', eolFrom: '2026-09-01', isMaintained: false,
    });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('device-eol');
  });

  it('explicit isEol=true with future eolFrom → device-eol (red beats yellow)', () => {
    const product = deviceProductLocal();
    const r = normalizeRelease({
      id: 'p', label: 'P', releaseDate: '2022-01-01', eolFrom: '2026-09-01', isEol: true,
    });
    expect(classifyResult({ product, release: r }, { now: NOW }).variant).toBe('device-eol');
  });
});

describe('effectiveDeviceEolFrom', () => {
  function snap() {
    return normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'macbook-pro', label: 'Apple MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
          endoflifeUrl: 'https://x', releases: [
            { id: 'mbp-2018', label: 'MBP 2018', releaseDate: '2018-07-12', supportedOsRange: '15' },
            { id: 'mbp-direct', label: 'MBP direct EOL', releaseDate: '2020-01-01', eolFrom: '2027-01-01', supportedOsRange: '15' },
          ],
        },
        {
          id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '15', label: 'macOS 15', releaseDate: '2024-09-16', latestVersion: '15.7.5', codename: 'Sequoia', eolFrom: '2027-09-15' },
          ],
        },
        {
          id: 'apple-watch', label: 'Apple Watch', kind: 'device', family: 'apple', formFactor: 'watch',
          endoflifeUrl: 'https://x', releases: [
            { id: 'aw1', label: 'Series 1', releaseDate: '2016-09-16' },
          ],
        },
      ],
    });
  }

  it('returns the device eolFrom directly when present', async () => {
    const { effectiveDeviceEolFrom } = await import('../lib/updates/result-logic');
    const s = snap();
    const product = s.products.find((p) => p.id === 'macbook-pro');
    const r = product.releases.find((x) => x.id === 'mbp-direct');
    expect(effectiveDeviceEolFrom(s, product, r)).toBe('2027-01-01');
  });

  it('falls back to max-supported macOS eolFrom when no device date', async () => {
    const { effectiveDeviceEolFrom } = await import('../lib/updates/result-logic');
    const s = snap();
    const product = s.products.find((p) => p.id === 'macbook-pro');
    const r = product.releases.find((x) => x.id === 'mbp-2018');
    expect(effectiveDeviceEolFrom(s, product, r)).toBe('2027-09-15');
  });

  it('returns null for devices with no eolFrom and no supportedOsRange', async () => {
    const { effectiveDeviceEolFrom } = await import('../lib/updates/result-logic');
    const s = snap();
    const product = s.products.find((p) => p.id === 'apple-watch');
    const r = product.releases[0];
    expect(effectiveDeviceEolFrom(s, product, r)).toBeNull();
  });

  it('returns null when called without a snapshot', async () => {
    const { effectiveDeviceEolFrom } = await import('../lib/updates/result-logic');
    const s = snap();
    const product = s.products.find((p) => p.id === 'macbook-pro');
    const r = product.releases.find((x) => x.id === 'mbp-2018');
    expect(effectiveDeviceEolFrom(null, product, r)).toBeNull();
  });
});

describe('buildLatestOsReminder', () => {
  // Build a snapshot mirroring the real shape so the helper has full context to navigate.
  function makeSnapshot() {
    return normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'iphone', label: 'Apple iPhone', kind: 'device', family: 'apple', formFactor: 'phone',
          endoflifeUrl: 'https://x', releases: [
            { id: '12-pro', label: '12 Pro', releaseDate: '2020-10-23', supportedOsRange: '14 - 26' },
            { id: '8', label: '8', releaseDate: '2017-09-22', supportedOsRange: '11 - 16' },
          ],
        },
        {
          id: 'ios', label: 'Apple iOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '26', label: '26', releaseDate: '2025-09-15', latestVersion: '26.4.2' },
            { id: '18', label: '18', releaseDate: '2024-09-16', isEol: true, latestVersion: '18.7.8' },
            { id: '16', label: '16', releaseDate: '2022-09-12', isEol: true, latestVersion: '16.7.15' },
          ],
        },
        {
          id: 'samsung-mobile', label: 'Samsung Mobile', kind: 'device', family: 'samsung', formFactor: 'phone',
          endoflifeUrl: 'https://x', releases: [
            { id: 'galaxy-s25', label: 'Galaxy S25', releaseDate: '2025-01-01' },
          ],
        },
        {
          id: 'android', label: 'Android', kind: 'os', family: 'google', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '16', label: '16', releaseDate: '2025-08-15', latestVersion: '16.0.0' },
          ],
        },
        {
          id: 'oneplus', label: 'OnePlus', kind: 'device', family: 'oneplus', formFactor: 'phone',
          endoflifeUrl: 'https://x', releases: [
            { id: '12', label: 'OnePlus 12', releaseDate: '2024-01-23' },
          ],
        },
        {
          id: 'apple-watch', label: 'Apple Watch', kind: 'device', family: 'apple', formFactor: 'watch',
          endoflifeUrl: 'https://x', releases: [
            { id: 'series-10', label: 'Series 10', releaseDate: '2024-09-20' },
          ],
        },
      ],
    });
  }

  it('iPhone with supportedOsRange and max == family latest → specific-version (at family latest)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '12-pro');
    const reminder = buildLatestOsReminder(snap, product, r);
    expect(reminder.case).toBe('specific-version');
    expect(reminder.targetMajor).toBe(26);
    expect(reminder.version).toBe('26.4.2');
    expect(reminder.isAtFamilyLatest).toBe(true);
  });

  it('older iPhone whose max < family latest → specific-version (NOT at family latest)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '8');
    const reminder = buildLatestOsReminder(snap, product, r);
    expect(reminder.case).toBe('specific-version');
    expect(reminder.targetMajor).toBe(16);
    expect(reminder.version).toBe('16.7.15');
    expect(reminder.isAtFamilyLatest).toBe(false);
  });

  it('Samsung (no supportedOsRange) → family-latest fallback', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'samsung-mobile');
    const r = product.releases[0];
    const reminder = buildLatestOsReminder(snap, product, r);
    expect(reminder.case).toBe('family-latest');
    expect(reminder.version).toBe('16.0.0');
  });

  it('OnePlus → oneplus case (no clean OS to point at)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'oneplus');
    const r = product.releases[0];
    expect(buildLatestOsReminder(snap, product, r)).toEqual({ case: 'oneplus' });
  });

  it('watch → null (skip the OS reminder for watches)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'apple-watch');
    const r = product.releases[0];
    expect(buildLatestOsReminder(snap, product, r)).toBeNull();
  });
});

describe('buildDeviceMaxOsWarning', () => {
  function makeSnapshot() {
    return normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'iphone', label: 'Apple iPhone', kind: 'device', family: 'apple', formFactor: 'phone',
          endoflifeUrl: 'https://x', releases: [
            { id: '12-pro', label: '12 Pro', releaseDate: '2020-10-23', supportedOsRange: '14 - 26' },
            { id: '8', label: '8', releaseDate: '2017-09-22', supportedOsRange: '11 - 16' },
            { id: '6', label: '6', releaseDate: '2014-09-19', supportedOsRange: '8 - 12' },
          ],
        },
        {
          id: 'ios', label: 'Apple iOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '26', label: '26', releaseDate: '2025-09-15', latestVersion: '26.4.2' },
            { id: '18', label: '18', releaseDate: '2024-09-16', latestVersion: '18.7.8' },
            { id: '16', label: '16', releaseDate: '2022-09-12', isEol: true, eolFrom: '2025-09-15', latestVersion: '16.7.15' },
            { id: '12', label: '12', releaseDate: '2018-09-17', isEol: true, eolFrom: '2023-01-23', latestVersion: '12.5.8' },
          ],
        },
      ],
    });
  }

  it('returns null when device max == family latest (no warning needed)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '12-pro');
    const reminder = buildLatestOsReminder(snap, product, r);
    expect(buildDeviceMaxOsWarning(snap, product, r, reminder)).toBeNull();
  });

  it('iPhone 8 (max iOS 16, family latest 26, 16 still EOL) → older-os-eol', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '8');
    const reminder = buildLatestOsReminder(snap, product, r);
    const warn = buildDeviceMaxOsWarning(snap, product, r, reminder);
    expect(warn.kind).toBe('older-os-eol');
    expect(warn.maxMajor).toBe(16);
    expect(warn.latestMajor).toBe(26);
  });

  it('iPhone 6 (max iOS 12, EOL since 2023) → older-os-eol', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '6');
    const reminder = buildLatestOsReminder(snap, product, r);
    const warn = buildDeviceMaxOsWarning(snap, product, r, reminder);
    expect(warn.kind).toBe('older-os-eol');
    expect(warn.maxVersion).toBe('12.5.8');
  });

  it('returns null when reminder is null (e.g. watch or oneplus)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '12-pro');
    expect(buildDeviceMaxOsWarning(snap, product, r, null)).toBeNull();
  });

  it('surfaces codenames on the warning so consumers can render "13 (Ventura)"', () => {
    // macOS-shaped snapshot: device caps at macOS 14 Sonoma; family latest is macOS 26 Tahoe.
    const snap = normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'macbook-pro', label: 'Apple MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
          endoflifeUrl: 'https://x', releases: [
            { id: 'mbp-2018', label: 'MacBook Pro (2018)', releaseDate: '2018-07-12', supportedOsRange: '10.13 - 14' },
          ],
        },
        {
          id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '26', label: 'macOS 26 (Tahoe)', releaseDate: '2025-09-15', latestVersion: '26.4.1', codename: 'Tahoe' },
            { id: '14', label: 'macOS 14 (Sonoma)', releaseDate: '2023-09-26', latestVersion: '14.8.5', codename: 'Sonoma', eolFrom: '2026-09-01' },
          ],
        },
      ],
    });
    const product = snap.products.find((p) => p.id === 'macbook-pro');
    const r = product.releases[0];
    const reminder = buildLatestOsReminder(snap, product, r);
    const warn = buildDeviceMaxOsWarning(snap, product, r, reminder);
    expect(warn.kind).toBe('older-os');
    expect(warn.maxCodename).toBe('Sonoma');
    expect(warn.latestCodename).toBe('Tahoe');
  });
});

describe('buildOsCheckOptions', () => {
  function makeSnapshot() {
    return normalizeSnapshot({
      schemaVersion: 1, generatedAt: '2026-05-03T00:00:00Z', source: 'x',
      products: [
        {
          id: 'iphone', label: 'Apple iPhone', kind: 'device', family: 'apple', formFactor: 'phone',
          endoflifeUrl: 'https://x', releases: [
            { id: '12-pro', label: '12 Pro', releaseDate: '2020-10-23', supportedOsRange: '14 - 26' },
            { id: '8', label: '8', releaseDate: '2017-09-22', supportedOsRange: '11 - 16' },
          ],
        },
        {
          id: 'ios', label: 'Apple iOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '26', label: '26', releaseDate: '2025-09-15', latestVersion: '26.4.2' },
            { id: '18', label: '18', releaseDate: '2024-09-16', isEol: true, latestVersion: '18.7.8' },
          ],
        },
        {
          id: 'macbook-pro', label: 'Apple MacBook Pro', kind: 'device', family: 'apple', formFactor: 'laptop',
          endoflifeUrl: 'https://x', releases: [
            { id: 'mbp-2024', label: 'MacBook Pro (2024)', releaseDate: '2024-11-08', supportedOsRange: '26' },
            { id: 'mbp-2017', label: 'MacBook Pro (2017)', releaseDate: '2017-06-05', supportedOsRange: '13' },
          ],
        },
        {
          id: 'macos', label: 'Apple macOS', kind: 'os', family: 'apple', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '26', label: 'macOS 26 (Tahoe)', releaseDate: '2025-09-15', latestVersion: '26.0.1', codename: 'Tahoe' },
            { id: '15', label: 'macOS 15 (Sequoia)', releaseDate: '2024-09-16', latestVersion: '15.7.5', codename: 'Sequoia' },
            { id: '14', label: 'macOS 14 (Sonoma)', releaseDate: '2023-09-26', latestVersion: '14.8.5', codename: 'Sonoma' },
            { id: '13', label: 'macOS 13 (Ventura)', releaseDate: '2022-10-24', isEol: true, latestVersion: '13.7.8', codename: 'Ventura' },
          ],
        },
        {
          id: 'samsung-mobile', label: 'Samsung Mobile', kind: 'device', family: 'samsung', formFactor: 'phone',
          endoflifeUrl: 'https://x', releases: [
            { id: 'galaxy-s25', label: 'Galaxy S25', releaseDate: '2025-01-01' },
          ],
        },
        {
          id: 'android', label: 'Android', kind: 'os', family: 'google', formFactor: 'os',
          endoflifeUrl: 'https://x', releases: [
            { id: '16', label: '16', releaseDate: '2025-08-15', latestVersion: '16.0.0' },
            { id: '15', label: '15', releaseDate: '2024-10-15', latestVersion: '15.0.2' },
          ],
        },
      ],
    });
  }

  it('iPhone 12 Pro returns iOS 26 only (one major still supported within range)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '12-pro');
    const opts = buildOsCheckOptions(snap, product, r);
    expect(opts).toEqual([
      { major: 26, latestVersion: '26.4.2', codename: null, eolFrom: null },
    ]);
  });

  it('iPhone 8 (max iOS 16) returns nothing (16 is EOL, no non-EOL within range)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'iphone');
    const r = product.releases.find((x) => x.id === '8');
    expect(buildOsCheckOptions(snap, product, r)).toEqual([]);
  });

  it('MacBook Pro 2024 returns 3 macOS majors (26, 15, 14) with codenames', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'macbook-pro');
    const r = product.releases.find((x) => x.id === 'mbp-2024');
    const opts = buildOsCheckOptions(snap, product, r);
    expect(opts).toHaveLength(3);
    expect(opts.map((o) => o.major)).toEqual([26, 15, 14]);
    expect(opts[0].codename).toBe('Tahoe');
    expect(opts[2].codename).toBe('Sonoma');
  });

  it('MacBook Pro 2017 (max macOS 13) returns nothing (13 EOL, no in-range majors)', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'macbook-pro');
    const r = product.releases.find((x) => x.id === 'mbp-2017');
    expect(buildOsCheckOptions(snap, product, r)).toEqual([]);
  });

  it('Samsung phone (no supportedOsRange) returns ALL non-EOL Android majors', () => {
    const snap = makeSnapshot();
    const product = snap.products.find((p) => p.id === 'samsung-mobile');
    const r = product.releases[0];
    const opts = buildOsCheckOptions(snap, product, r);
    // No range scoping — both Android 15 and 16 are returned, sorted desc.
    expect(opts.map((o) => o.major)).toEqual([16, 15]);
  });
});

describe('latestPickerMajor', () => {
  it('returns null for null/empty/non-array input', () => {
    expect(latestPickerMajor(null)).toBeNull();
    expect(latestPickerMajor(undefined)).toBeNull();
    expect(latestPickerMajor([])).toBeNull();
    expect(latestPickerMajor('not an array')).toBeNull();
  });

  it('returns the first option (buildOsCheckOptions sorts highest-major first)', () => {
    const opts = [
      { major: 16, latestVersion: '16.1', codename: null },
      { major: 15, latestVersion: '15.4', codename: null },
      { major: 14, latestVersion: '14.7', codename: null },
    ];
    expect(latestPickerMajor(opts)).toBe(opts[0]);
  });

  it('returns the single option when only one major is available', () => {
    const opts = [{ major: 11, latestVersion: '11.0', codename: null }];
    expect(latestPickerMajor(opts)).toBe(opts[0]);
  });

  it('preserves codename + latestVersion fields on the returned option', () => {
    const opts = [
      { major: 26, latestVersion: '26.1', codename: 'Tahoe', eolFrom: null },
      { major: 25, latestVersion: '25.5', codename: null, eolFrom: '2026-01-01' },
    ];
    const latest = latestPickerMajor(opts);
    expect(latest.codename).toBe('Tahoe');
    expect(latest.latestVersion).toBe('26.1');
  });
});

describe('buildStuckOnOldOsClassification', () => {
  const now = new Date('2026-05-03T00:00:00Z');

  it('returns a device-eol classification with the user-stuck reason', () => {
    const r = release({ releaseDate: '2020-01-01' });
    const c = buildStuckOnOldOsClassification(r, now);
    expect(c.variant).toBe('device-eol');
    expect(c.reason).toBe('user-stuck-on-old-os');
    expect(c.effectiveEolFrom).toBeNull();
  });

  it('computes ageYears from releaseDate', () => {
    const r = release({ releaseDate: '2020-05-03' });
    const c = buildStuckOnOldOsClassification(r, now);
    // 6 years ago.
    expect(c.ageYears).toBeGreaterThan(5.9);
    expect(c.ageYears).toBeLessThan(6.1);
  });

  it('returns null ageYears when releaseDate is missing or invalid', () => {
    expect(buildStuckOnOldOsClassification({}, now).ageYears).toBeNull();
    expect(buildStuckOnOldOsClassification(null, now).ageYears).toBeNull();
    expect(buildStuckOnOldOsClassification({ releaseDate: 'not a date' }, now).ageYears).toBeNull();
  });

  it('matches the shape classifyResult emits so DeviceEol can render it directly', () => {
    const r = release({ releaseDate: '2019-01-01', isEol: true });
    const real = classifyResult({ product: deviceProduct(), release: r }, { now });
    const synth = buildStuckOnOldOsClassification(r, now);
    // Same set of keys → no consumer needs special-casing.
    expect(Object.keys(synth).sort()).toEqual(Object.keys(real).sort());
  });
});

describe('buildAppleSupportEstimate', () => {
  const now = new Date('2026-05-03T00:00:00Z');

  function appleProduct(formFactor) {
    return normalizeProduct({
      id: 'iphone', label: 'Apple iPhone', kind: 'device', family: 'apple', formFactor,
      endoflifeUrl: 'https://x', releases: [],
    });
  }

  it('returns null for non-Apple devices (Pixel, Samsung publish their own)', () => {
    const r = release({ releaseDate: '2024-01-01' });
    const pixel = normalizeProduct({
      id: 'pixel', label: 'Google Pixel', kind: 'device', family: 'google', formFactor: 'phone',
      endoflifeUrl: 'https://x', releases: [],
    });
    expect(buildAppleSupportEstimate(pixel, r, now)).toBeNull();
  });

  it('returns null when eolFrom is set (we have real data, no estimate needed)', () => {
    const r = release({ releaseDate: '2024-01-01', eolFrom: '2030-01-01' });
    expect(buildAppleSupportEstimate(appleProduct('phone'), r, now)).toBeNull();
  });

  it('returns null without a releaseDate', () => {
    const r = release({ releaseDate: null });
    expect(buildAppleSupportEstimate(appleProduct('phone'), r, now)).toBeNull();
  });

  it('returns null for unmapped form factors (e.g. os)', () => {
    const r = release({ releaseDate: '2024-01-01' });
    expect(buildAppleSupportEstimate(appleProduct('os'), r, now)).toBeNull();
  });

  it('iPhone released 8 months ago → years-range case (about 4 to 6 years left)', () => {
    const r = release({ releaseDate: '2025-09-01' });
    const est = buildAppleSupportEstimate(appleProduct('phone'), r, now);
    expect(est.case).toBe('years-range');
    expect(est.minYears).toBe(5);
    expect(est.maxYears).toBe(7);
    expect(est.remainingMinYears).toBeGreaterThanOrEqual(4);
    expect(est.remainingMaxYears).toBeGreaterThanOrEqual(6);
  });

  it('iPhone released ~5 yrs ago → years-up-to (past min, max still positive)', () => {
    // 2021-05-03 → exactly 5 years before NOW so remainingMin ≈ 0, remainingMax ≈ 2
    const r = release({ releaseDate: '2021-05-03' });
    const est = buildAppleSupportEstimate(appleProduct('phone'), r, now);
    expect(est.case).toBe('years-up-to');
    expect(est.remainingMaxYears).toBe(2);
  });

  it('iPhone released ~6.5 yrs ago → months-up-to (under a year of max remaining)', () => {
    // 2019-11-15 → 6.5 yrs ago, max 7y window → ~6 months remaining
    const r = release({ releaseDate: '2019-11-15' });
    const est = buildAppleSupportEstimate(appleProduct('phone'), r, now);
    expect(est.case).toBe('months-up-to');
    expect(est.remainingMaxMonths).toBeGreaterThan(0);
    expect(est.remainingMaxMonths).toBeLessThanOrEqual(12);
  });

  it('iPhone past the 7-year window → null (already EOL by heuristic, no estimate to give)', () => {
    const r = release({ releaseDate: '2014-01-01' });
    expect(buildAppleSupportEstimate(appleProduct('phone'), r, now)).toBeNull();
  });

  it('uses laptop window (7-10 yr) for both laptop and desktop form factors', () => {
    const r = release({ releaseDate: '2024-01-01' });
    const laptop = buildAppleSupportEstimate(appleProduct('laptop'), r, now);
    const desktop = buildAppleSupportEstimate(appleProduct('desktop'), r, now);
    expect(laptop.minYears).toBe(7);
    expect(laptop.maxYears).toBe(10);
    expect(desktop.minYears).toBe(7);
    expect(desktop.maxYears).toBe(10);
    expect(desktop.deviceLabelKey).toBe('laptop');
  });

  it('uses watch window (4-6 yr) for Apple Watch', () => {
    const r = release({ releaseDate: '2024-01-01' });
    const est = buildAppleSupportEstimate(appleProduct('watch'), r, now);
    expect(est.minYears).toBe(4);
    expect(est.maxYears).toBe(6);
    expect(est.deviceLabelKey).toBe('watch');
  });
});
