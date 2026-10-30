import {
  applyBump,
  bumpEnginesRange,
  parseVersion,
  pickUpgrade,
  readNvmrc,
} from '../scripts/lib/node-bump-core.mjs';

// Shaped like nodejs.org/dist/index.json entries (newest first there, but the
// code must not rely on that order).
const rel = (version, security = false) => ({ version, date: '2026-10-21', security });

describe('parseVersion', () => {
  it('accepts exact versions with or without a v prefix', () => {
    expect(parseVersion('22.23.4')).toEqual([22, 23, 4]);
    expect(parseVersion('v24.1.0')).toEqual([24, 1, 0]);
  });

  it('rejects ranges and partial versions', () => {
    expect(parseVersion('22')).toBeNull();
    expect(parseVersion('lts/*')).toBeNull();
    expect(parseVersion('^22.1.0')).toBeNull();
  });
});

describe('pickUpgrade', () => {
  it('picks the newest release on the pinned major and ignores other majors', () => {
    const releases = [rel('v26.13.0'), rel('v22.23.6'), rel('v24.30.0'), rel('v22.23.5')];
    expect(pickUpgrade(releases, '22.23.4')).toMatchObject({
      version: '22.23.6',
      skipped: ['22.23.5'],
    });
  });

  it('compares numerically, not as strings', () => {
    expect(pickUpgrade([rel('v22.9.0'), rel('v22.10.0')], '22.9.0').version).toBe('22.10.0');
  });

  it('returns null when already on the newest release of the major', () => {
    expect(pickUpgrade([rel('v22.23.4'), rel('v22.22.0'), rel('v24.0.0')], '22.23.4')).toBeNull();
  });

  it('flags security when a skipped intermediate release was the security one', () => {
    const releases = [rel('v22.23.6'), rel('v22.23.5', true), rel('v22.23.4', true)];
    expect(pickUpgrade(releases, '22.23.4').security).toBe(true);
  });

  it('does not count security releases at or below the current pin', () => {
    const releases = [rel('v22.23.5'), rel('v22.23.4', true), rel('v22.23.3', true)];
    expect(pickUpgrade(releases, '22.23.4').security).toBe(false);
  });

  it('refuses a non-exact pin', () => {
    expect(() => pickUpgrade([rel('v22.23.5')], '22')).toThrow(/exact version/);
  });
});

describe('readNvmrc', () => {
  it('skips blank lines and comments like nvm-pnpm.sh does', () => {
    expect(readNvmrc('# pinned for TLS fixes\n\n22.23.4\n')).toBe('22.23.4');
    expect(readNvmrc('22.23.4\r\n')).toBe('22.23.4');
  });
});

describe('bumpEnginesRange', () => {
  it('raises only the pinned major term', () => {
    expect(bumpEnginesRange('^22.23.4 || ^24.22.1 || >=26.12.1', '22.23.5')).toBe(
      '^22.23.5 || ^24.22.1 || >=26.12.1',
    );
    expect(bumpEnginesRange('^22.23.4 || ^24.22.1 || >=26.12.1', '24.23.0')).toBe(
      '^22.23.4 || ^24.23.0 || >=26.12.1',
    );
  });

  it('does not match a longer major that shares a prefix', () => {
    expect(() => bumpEnginesRange('^220.1.0', '22.1.1')).toThrow(/no \^22/);
  });

  it('throws when the range has no caret term for that major', () => {
    expect(() => bumpEnginesRange('>=22.12', '22.23.5')).toThrow(/no \^22\.x\.y term/);
  });
});

describe('applyBump', () => {
  const packageJson = `{
  "name": "x",
  "engines": {
    "node": "^22.23.4 || ^24.22.1"
  },
  "devDependencies": {
    "@types/node": "22.23.4"
  }
}
`;
  const railpack = `{
  "provider": "node",
  "packages": {
    "node": "22.23.4"
  }
}
`;

  it('rewrites all three files and leaves unrelated text alone', () => {
    const out = applyBump(
      { nvmrc: '# was 22.23.4 before\n22.23.4\n', railpack, packageJson },
      '22.23.5',
    );
    expect(out.nvmrc).toBe('# was 22.23.4 before\n22.23.5\n');
    expect(JSON.parse(out.railpack).packages.node).toBe('22.23.5');
    expect(out.packageJson).toBe(
      packageJson.replace('"^22.23.4 || ^24.22.1"', '"^22.23.5 || ^24.22.1"'),
    );
    expect(out.engines).toEqual({ from: '^22.23.4 || ^24.22.1', to: '^22.23.5 || ^24.22.1' });
  });

  it('refuses when railpack.json and .nvmrc disagree', () => {
    expect(() => applyBump({ nvmrc: '22.22.0\n', railpack, packageJson }, '22.23.5')).toThrow(
      /railpack\.json pins node "22\.23\.4" but \.nvmrc pins "22\.22\.0"/,
    );
  });

  it('refuses when package.json has no engines.node', () => {
    expect(() =>
      applyBump({ nvmrc: '22.23.4\n', railpack, packageJson: '{"name":"x"}' }, '22.23.5'),
    ).toThrow(/no engines\.node/);
  });
});
