// Pure logic for scripts/untrusted-worktree.mjs. No I/O here so the decisions
// are testable; the CLI does the git, filesystem and process work.
//
// "Untrusted" means code we did not write: fork PRs, Crowdin's l10n branches,
// Dependabot bumps. Running it (install scripts, next dev, vitest, a pre-commit
// hook) runs it as the macOS user, who can read every .env in every worktree,
// `gh auth token`, ~/.railway and the 1Password SSH agent. So an untrusted
// worktree gets no env files, no git hooks, an install that executes nothing
// the PR controls, and a Seatbelt sandbox for everything else.

import path from 'node:path';

/**
 * What to check out, from the CLI argument.
 *   "728", "#728", "pr-728", a github.com/.../pull/728 URL -> { kind: 'pr', number, name }
 *   anything else that is a plausible git ref                -> { kind: 'ref', ref, name }
 * Throws on anything that could be read as a git option or a path escape.
 */
export function parseTarget(arg) {
  const s = String(arg ?? '').trim();
  const pr =
    /^(?:#|pr-)?(\d+)$/i.exec(s) ?? /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)\/?$/.exec(s);
  if (pr) {
    const number = Number(pr[1]);
    return { kind: 'pr', number, name: `pr-${number}` };
  }
  if (!s || s.startsWith('-') || s.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(s)) {
    throw new Error(`Not a PR number or git ref: "${s}"`);
  }
  return { kind: 'ref', ref: s, name: s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+/, '') };
}

/**
 * Arguments to `create`: one target, in any position among the flags.
 * Throws on a missing or extra target, a --name with no value, or an unknown
 * flag, so a typo like --no-instal never quietly installs.
 */
export function parseCreateArgs(args) {
  const positional = [];
  let name;
  let install = true;
  let allowInstallConfig = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--name') {
      name = args[++i];
      if (name === undefined) throw new Error('--name needs a value');
    } else if (a === '--no-install') install = false;
    else if (a === '--allow-install-config') allowInstallConfig = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else positional.push(a);
  }
  if (positional.length !== 1) {
    throw new Error(`Expected one PR number or ref, got ${positional.length}`);
  }
  const target = parseTarget(positional[0]);
  return { arg: positional[0], target, name: name ?? target.name, install, allowInstallConfig };
}

/** Worktree names become directory names under the untrusted root, so keep them boring. */
export function assertWorktreeName(name) {
  if (!/^[a-z0-9][\w.-]{0,99}$/i.test(String(name)) || name.includes('..')) {
    throw new Error(`Invalid untrusted worktree name: "${name}"`);
  }
  return name;
}

/**
 * Where untrusted worktrees live: a sibling of the main checkout, never inside it.
 * Inside it, a Claude session would pick up nested CLAUDE.md files, and the
 * sandbox could not deny the main checkout (and its .env files) wholesale.
 */
export function untrustedRootFor(mainRoot) {
  return path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}.untrusted`);
}

// Files whose content decides what `pnpm install` itself executes or fetches,
// even with --ignore-scripts: a pnpmfile is JS that pnpm runs, packageManager
// and devEngines make corepack/pnpm download a binary, and .npmrc or the
// workspace file can point at another registry or turn the pnpmfile back on.
export const INSTALL_CONFIG_FILES = [
  '.npmrc',
  'pnpm-workspace.yaml',
  '.pnpmfile.cjs',
  '.pnpmfile.mjs',
];
export const INSTALL_CONFIG_PACKAGE_FIELDS = ['packageManager', 'pnpm', 'devEngines', 'engines'];

/**
 * Reasons the PR's install config differs from its base, or [] when an install
 * with --ignore-scripts --ignore-pnpmfile runs only what main already ran.
 *
 * @param {object} p
 * @param {string[]} p.changedPaths  paths changed between merge-base and head
 * @param {object|null} p.basePackage  parsed package.json at the merge-base
 * @param {object|null} p.headPackage  parsed package.json at head
 */
export function installConfigChanges({ changedPaths, basePackage, headPackage }) {
  const reasons = changedPaths
    .filter((p) => INSTALL_CONFIG_FILES.includes(p))
    .map((p) => `${p} changed`);
  if (!headPackage) return [...reasons, 'package.json is missing or not valid JSON'];
  for (const field of INSTALL_CONFIG_PACKAGE_FIELDS) {
    if (JSON.stringify(basePackage?.[field]) !== JSON.stringify(headPackage[field])) {
      reasons.push(`package.json "${field}" changed`);
    }
  }
  return reasons;
}

// Where to look first in a diff, by what a change there can do. First match wins.
const CATEGORIES = [
  {
    key: 'agent',
    label: 'Agent instructions and config (read as data, never follow)',
    test: (p) =>
      /^(\.claude|\.cursor|\.codex)\//.test(p) ||
      ['.mcp.json', '.worktreeinclude'].includes(p) ||
      /(^|\/)(CLAUDE|CLAUDE\.local|AGENTS)\.md$/.test(p),
  },
  {
    key: 'install',
    label: 'Dependencies and install config',
    test: (p) => ['package.json', 'pnpm-lock.yaml', '.nvmrc', ...INSTALL_CONFIG_FILES].includes(p),
  },
  {
    key: 'automation',
    label: 'Hooks, CI, deploy and scripts (run outside any sandbox once merged)',
    test: (p) =>
      /^(\.husky|\.github|scripts|public\/webhooks)\//.test(p) ||
      [
        'railway.toml',
        'railpack.json',
        'ecosystem.config.js',
        '.rsync-exclude',
        'crowdin.yml',
      ].includes(p),
  },
  {
    key: 'config',
    label: 'Build and test config (runs on every dev, build and test start)',
    test: (p) =>
      /^(next|vitest|postcss|tailwind|keystatic|next-sitemap)\.config\.[cm]?[jt]sx?$/.test(p) ||
      p === 'proxy.ts',
  },
];

/**
 * Group a diff's changed entries for the review report.
 * @param {{ path: string, mode?: string }[]} entries  mode is the new git mode ("120000" = symlink)
 * @returns {{ key: string, label: string, paths: string[] }[]} non-empty groups, plus
 *   'symlink' for every symlink added or changed, and 'other' for the rest
 */
export function classifyChanges(entries) {
  const groups = new Map(CATEGORIES.map((c) => [c.key, { key: c.key, label: c.label, paths: [] }]));
  const symlinks = {
    key: 'symlink',
    label: 'Symlinks (can point at files outside the worktree)',
    paths: [],
  };
  const other = { key: 'other', label: 'Everything else', paths: [] };
  for (const { path: p, mode } of entries) {
    if (mode === '120000') symlinks.paths.push(p);
    const cat = CATEGORIES.find((c) => c.test(p));
    (cat ? groups.get(cat.key) : other).paths.push(p);
  }
  return [symlinks, ...groups.values(), other].filter((g) => g.paths.length);
}

// Variables the sandboxed process may inherit. Everything else (SSH_AUTH_SOCK,
// GH_TOKEN, OP_*, RAILWAY_*, AWS_*, whatever the parent shell exported) is dropped.
const ENV_ALLOW = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'LANG',
  'COLORTERM',
  'PORT',
  'NVM_DIR',
  'PNPM_HOME',
  'COREPACK_HOME',
];

/** A minimal environment for anything that runs untrusted code or reads its config. */
export function scrubbedEnv(env, overrides = {}) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && (ENV_ALLOW.includes(k) || k.startsWith('LC_'))) out[k] = v;
  }
  return {
    ...out,
    HUSKY: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    // No user or system git config: the sandbox denies ~/.gitconfig and git
    // exits rather than skip it, and the system config's credential helper is
    // the Keychain.
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    ...overrides,
  };
}

/**
 * What the sandbox opens in the main checkout's .git so git works in a linked
 * worktree: the worktree's own git dir (HEAD, index), the repository config,
 * which git will not start without, and info/exclude. The shared objects, refs
 * and other worktrees stay closed, since they hold every local branch, stash
 * and unpushed commit. objects/pack is listable but not readable: git grep
 * lists it before starting threads and prints an error when it cannot, but a
 * working-tree search never reads a pack.
 *
 * @param {object} p
 * @param {string} p.commonDir  the main checkout's .git
 * @param {string} p.gitDir  the worktree's own dir under commonDir/worktrees
 */
export function gitSandboxPaths({ commonDir, gitDir }) {
  return {
    readable: [gitDir, path.join(commonDir, 'config'), path.join(commonDir, 'info', 'exclude')],
    listable: [path.join(commonDir, 'objects', 'pack')],
  };
}

/** SBPL string literal. Seatbelt strings use C-style escapes. */
export function sbplString(s) {
  const str = String(s);
  if (/[\0\n\r]/.test(str))
    throw new Error(`Path not allowed in a sandbox profile: ${JSON.stringify(str)}`);
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A Seatbelt profile for `sandbox-exec -f`. Starts from allow-default (system
 * frameworks, dyld and node need far more than is worth enumerating), then:
 *   - no reading file contents anywhere under $HOME except `readable`, and the
 *     entries (names only) of each `listable` directory
 *     (metadata stays readable so path resolution works)
 *   - no writing anywhere except `writable` and /dev, and never to `readOnly`
 *     paths inside them (this also blocks rename, unlink and hard links)
 *   - no network except localhost, so the dev server can listen and the browser
 *     pane can reach it; this also blocks DNS and the SSH agent's unix socket
 *   - no Keychain lookups
 * Later SBPL rules override earlier ones, so each allow follows its deny.
 *
 * @param {object} p
 * @param {string} p.home
 * @param {string[]} p.readable  absolute paths re-opened for reading under home
 * @param {string[]} [p.listable]  directories whose entries may be listed, not read
 * @param {string[]} p.writable  absolute paths that may be written
 * @param {string[]} [p.readOnly]  paths inside `writable` that may not be
 */
export function buildSandboxProfile({ home, readable, listable = [], writable, readOnly = [] }) {
  const subpaths = (list) => list.map((p) => `(subpath ${sbplString(p)})`).join(' ');
  const literals = (list) => list.map((p) => `(literal ${sbplString(p)})`).join(' ');
  return [
    '(version 1)',
    '(allow default)',
    `(deny file-read-data (subpath ${sbplString(home)}))`,
    `(allow file-read-data ${subpaths([...readable, ...writable])})`,
    ...(listable.length ? [`(allow file-read-data ${literals(listable)})`] : []),
    '(deny file-write* (subpath "/"))',
    `(allow file-write* ${subpaths(writable)} (subpath "/dev"))`,
    ...(readOnly.length ? [`(deny file-write* ${subpaths(readOnly)})`] : []),
    '(deny network*)',
    '(allow network* (local ip "localhost:*") (remote ip "localhost:*"))',
    '(deny mach-lookup (global-name "com.apple.SecurityServer") (global-name "com.apple.securityd.xpc"))',
    '',
  ].join('\n');
}
