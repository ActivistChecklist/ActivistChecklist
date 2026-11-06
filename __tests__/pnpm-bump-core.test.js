import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  COOLDOWN_DAYS,
  checkBump,
  integrityToHex,
  parsePackageManager,
  pickUpgrade,
} from '../scripts/lib/pnpm-bump-core.mjs';

const ROOT = path.join(__dirname, '..');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-04T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();

// Shaped like `npm view pnpm dist-tags time versions --json`. `releases` maps
// version -> days since it was published.
function registry(releases, distTags) {
  return {
    'dist-tags': distTags,
    versions: Object.keys(releases),
    time: Object.fromEntries(Object.entries(releases).map(([v, n]) => [v, daysAgo(n)])),
  };
}

describe('COOLDOWN_DAYS', () => {
  it('matches the npm cooldown in .github/dependabot.yml', () => {
    const yml = fs.readFileSync(path.join(ROOT, '.github/dependabot.yml'), 'utf8');
    const days = (key) => Number(new RegExp(`${key}: (\\d+)`).exec(yml)?.[1]);
    expect(COOLDOWN_DAYS).toEqual({
      minor: days('semver-minor-days'),
      patch: days('semver-patch-days'),
    });
  });
});

describe('parsePackageManager', () => {
  it('reads an exact pnpm pin with or without the corepack hash', () => {
    const hash = 'a'.repeat(128);
    expect(parsePackageManager(`pnpm@12.16.1+sha512.${hash}`)).toEqual({
      version: '12.16.1',
      hash,
    });
    expect(parsePackageManager('pnpm@12.16.1')).toEqual({ version: '12.16.1', hash: null });
  });

  it('refuses another package manager, a range, or a missing field', () => {
    expect(() => parsePackageManager('yarn@4.5.0')).toThrow(/exact pnpm release/);
    expect(() => parsePackageManager('pnpm@^12.16.1')).toThrow(/exact pnpm release/);
    expect(() => parsePackageManager(undefined)).toThrow(/exact pnpm release/);
  });
});

describe('pickUpgrade', () => {
  const tags = { 'latest-11': '11.28.9', 'latest-12': '12.16.1', 'next-12': '12.17.0' };

  it('picks the latest-<major> release once due, and lists what it skips over', () => {
    const reg = registry(
      { '11.28.9': 9, '12.4.1': 60, '12.15.0': 14, '12.16.0': 9, '12.16.1': 8, '13.0.0': 5 },
      tags,
    );
    expect(pickUpgrade(reg, '12.4.1', NOW)).toEqual({
      target: { version: '12.16.1', date: daysAgo(8), skipped: ['12.16.0', '12.15.0'] },
      waiting: [],
    });
  });

  it('never goes past the latest-<major> tag, so next-* releases and prereleases are ignored', () => {
    const reg = registry({ '12.16.1': 8, '12.17.0': 5, '12.18.0-rc.0': 4 }, tags);
    expect(pickUpgrade(reg, '12.16.0', NOW).target.version).toBe('12.16.1');
  });

  it('falls back to an older due release while the newest is inside its wait', () => {
    const reg = registry({ '12.15.0': 14, '12.16.0': 9, '12.16.1': 1 }, tags);
    expect(pickUpgrade(reg, '12.4.1', NOW)).toEqual({
      target: { version: '12.16.0', date: daysAgo(9), skipped: ['12.15.0'] },
      waiting: [
        { version: '12.16.1', date: daysAgo(1), dueAt: new Date(NOW + 2 * DAY).toISOString() },
      ],
    });
  });

  it('waits longer for a minor release than for a patch', () => {
    const reg = registry({ '12.16.1': 2.5 }, tags);
    expect(pickUpgrade(reg, '12.4.1', NOW).target).toBeNull();
    expect(pickUpgrade(reg, '12.16.0', NOW).target.version).toBe('12.16.1');
  });

  it('counts a release as due at exactly the end of its wait', () => {
    const reg = registry({ '12.16.1': COOLDOWN_DAYS.patch }, tags);
    expect(pickUpgrade(reg, '12.16.0', NOW).target.version).toBe('12.16.1');
  });

  it('never treats a release with no publish time as due', () => {
    const reg = registry({ '12.16.1': 30 }, tags);
    delete reg.time['12.16.1'];
    expect(pickUpgrade(reg, '12.16.0', NOW)).toEqual({
      target: null,
      waiting: [{ version: '12.16.1', date: null, dueAt: null }],
    });
  });

  it('compares numerically, not as strings', () => {
    const reg = registry({ '12.9.0': 30, '12.10.0': 30 }, { 'latest-12': '12.10.0' });
    expect(pickUpgrade(reg, '12.9.0', NOW).target.version).toBe('12.10.0');
  });

  it('does nothing when already current, or when pinned ahead of the tag', () => {
    const reg = registry({ '12.16.1': 8, '12.17.0': 5 }, tags);
    const none = { target: null, waiting: [] };
    expect(pickUpgrade(reg, '12.16.1', NOW)).toEqual(none);
    expect(pickUpgrade(reg, '12.17.0', NOW)).toEqual(none);
  });

  it('refuses when npm has no latest-<major> tag, or the pin is not exact', () => {
    const reg = registry({ '13.0.0': 30 }, tags);
    expect(() => pickUpgrade(reg, '13.0.0', NOW)).toThrow(/no latest-13 dist-tag/);
    expect(() => pickUpgrade(reg, '12', NOW)).toThrow(/exact pnpm version/);
  });
});

describe('integrityToHex', () => {
  it('turns npm integrity into the hash corepack writes', () => {
    // pnpm@12.4.1, from `npm view pnpm@12.4.1 dist.integrity` and the
    // packageManager line corepack wrote for it.
    expect(
      integrityToHex(
        'sha512-LoHjmdc/6DkNqyXgaqeIq3pZCCSNL1o3D4K0gRR6ano2e/gEj5pv22Rg8hpm8FQt7bi5TKLIcjWWdBkgsWVtTA==',
      ),
    ).toBe(
      '2e81e399d73fe8390dab25e06aa788ab7a5908248d2f5a370f82b481147a6a7a367bf8048f9a6fdb6460f21a66f0542dedb8b94ca2c8723596741920b1656d4c',
    );
  });

  it('refuses anything that is not sha512', () => {
    expect(() => integrityToHex('sha1-2jmj7l5rSw0yVb/vlWAYkK/YBwk=')).toThrow(/sha512 integrity/);
  });
});

describe('checkBump', () => {
  const digest = (s) => createHash('sha512').update(s).digest();
  const integrity = (s) => `sha512-${digest(s).toString('base64')}`;
  const hex = (s) => digest(s).toString('hex');

  const packageJson = (pm, extra = '') => `{
  "name": "x",${extra}
  "packageManager": "${pm}"
}
`;
  const deps = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      next:
        specifier: ^16.3.3
        version: 16.3.3
`;
  const lockfile = (v, rest = deps) => `---
lockfileVersion: '9.0'

importers:

  .:
    configDependencies: {}
    packageManagerDependencies:
      pnpm:
        specifier: ${v}
        version: ${v}

packages:

  pnpm@${v}:
    resolution: {integrity: sha512-x}
---
${rest}`;

  const before = {
    packageJson: packageJson(`pnpm@12.4.1+sha512.${hex('old')}`),
    lockfile: lockfile('12.4.1'),
  };
  const clean = {
    packageJson: packageJson(`pnpm@12.16.1+sha512.${hex('new')}`),
    lockfile: lockfile('12.16.1'),
  };
  const bump = (after, from = before) =>
    checkBump({ before: from, after, version: '12.16.1', integrity: integrity('new') });

  it('accepts a bump that moves only pnpm', () => {
    expect(() => bump(clean)).not.toThrow();
  });

  it('refuses a packageManager hash npm did not publish', () => {
    const after = { ...clean, packageJson: packageJson(`pnpm@12.16.1+sha512.${hex('evil')}`) };
    expect(() => bump(after)).toThrow(/packageManager is .* but npm says/);
  });

  it('refuses any other package.json change', () => {
    const after = {
      ...clean,
      packageJson: packageJson(
        `pnpm@12.16.1+sha512.${hex('new')}`,
        '\n  "scripts": {"postinstall": "curl x"},',
      ),
    };
    expect(() => bump(after)).toThrow(/package\.json changed beyond packageManager/);
  });

  it('refuses when the lockfile still records the old pnpm', () => {
    expect(() => bump({ ...clean, lockfile: lockfile('12.4.1') })).toThrow(
      /does not record pnpm 12\.16\.1 \(specifier 12\.4\.1, version 12\.4\.1\)/,
    );
  });

  it('refuses when the dependency lockfile moved too', () => {
    const after = { ...clean, lockfile: lockfile('12.16.1', deps.replaceAll('16.3.3', '16.3.4')) };
    expect(() => bump(after)).toThrow(/dependency lockfile .* moved too/);
  });

  it("refuses a lockfile without pnpm's own document", () => {
    expect(() => bump({ ...clean, lockfile: deps }, { ...before, lockfile: deps })).toThrow(
      /two YAML documents/,
    );
  });

  // The bump compares against HEAD, so the committed pin must already be one it
  // can read, with package.json and the lockfile agreeing on the version. This
  // also catches a hand edit to packageManager that skipped the lockfile.
  it('accepts the repo as committed, as a bump to its own version', () => {
    const files = {
      packageJson: fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
      lockfile: fs.readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8'),
    };
    const { version, hash } = parsePackageManager(JSON.parse(files.packageJson).packageManager);
    expect(hash).not.toBeNull();
    const own = `sha512-${Buffer.from(hash, 'hex').toString('base64')}`;
    expect(() => checkBump({ before: files, after: files, version, integrity: own })).not.toThrow();
  });
});
