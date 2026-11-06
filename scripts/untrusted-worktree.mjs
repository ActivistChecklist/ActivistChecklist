#!/usr/bin/env node
// Check out and run code we did not write (fork PRs, Crowdin's l10n branches,
// Dependabot bumps) without handing it our secrets. See CLAUDE.md "Untrusted code".
//
//   pnpm untrusted create <pr-number|ref> [--name NAME] [--no-install] [--allow-install-config]
//   pnpm untrusted run <name> -- <command...>     e.g. -- next dev --turbopack, -- vitest run
//   pnpm untrusted list
//   pnpm untrusted remove <name>
//
// create: fetches the PR head (refs/untrusted/pr-N) or resolves the ref, adds a
//   detached worktree beside the main checkout in <main>.untrusted/<name>, with
//   git hooks off, so .worktreeinclude never fills it and no hook from the PR's
//   tree runs on checkout or commit. Prints the changed files grouped by what
//   they can do. Then installs with --ignore-scripts --ignore-pnpmfile and a
//   scrubbed environment, but only when the PR leaves the install config alone
//   (scripts/lib/untrusted-worktree-core.mjs says which files count); otherwise
//   it stops so a human can read those diffs first.
// run: runs one command in the worktree under sandbox-exec (macOS Seatbelt): no
//   reads under $HOME except the worktree, node itself and the worktree's git
//   metadata (never the shared objects), no writes outside the worktree or to
//   its .git file, no network except localhost, no Keychain, a scrubbed
//   environment without your git config, and the worktree's node_modules/.bin
//   first on PATH. That covers next dev, vitest, prettier, git grep and anything
//   they import. pnpm itself cannot run inside (it writes to its shared store),
//   so call the binaries directly. git commands that read objects (status,
//   diff, log) fail inside.
//
// git outside the sandbox: run it at the worktree root (git -C <worktree>),
//   never from a subdirectory. The root's .git is read-only to sandboxed code,
//   but that code can plant a repository in any subdirectory, and git looking
//   upward from there would find it first and run whatever its config says.
//
// Set UNTRUSTED_WORKTREE_ROOT to keep the worktrees somewhere else.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertWorktreeName,
  buildSandboxProfile,
  classifyChanges,
  gitSandboxPaths,
  installConfigChanges,
  parseCreateArgs,
  scrubbedEnv,
  untrustedRootFor,
} from './lib/untrusted-worktree-core.mjs';

const git = (args, opts = {}) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...opts,
  }).trim();

const commonDir = fs.realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
const mainRoot = path.dirname(commonDir);
const root = path.resolve(process.env.UNTRUSTED_WORKTREE_ROOT || untrustedRootFor(mainRoot));
if (root === mainRoot || root.startsWith(mainRoot + path.sep)) {
  fail(`The untrusted root must be outside the main checkout, got ${root}`);
}

function fail(msg, code = 1) {
  console.error(`untrusted-worktree: ${msg}`);
  process.exit(code);
}

function worktreePath(name) {
  return path.join(root, assertWorktreeName(name));
}

function registeredWorktrees() {
  return git(['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length))
    .filter((p) => p.startsWith(root + path.sep));
}

/**
 * The worktree's own git dir, found from the main checkout's records. Never
 * from <wt>/.git: sandboxed code can rewrite that file to point anywhere.
 */
function gitDirOf(wt) {
  const dir = path.join(commonDir, 'worktrees');
  const want = path.join(fs.realpathSync(wt), '.git');
  const id = fs.readdirSync(dir).find((id) => {
    try {
      // Relative when worktree.useRelativePaths is on.
      const recorded = fs.readFileSync(path.join(dir, id, 'gitdir'), 'utf8').trim();
      return path.resolve(dir, id, recorded) === want;
    } catch {
      return false;
    }
  });
  if (!id) fail(`No git dir for ${wt} under ${dir}`);
  return path.join(dir, id);
}

/**
 * Fails unless <wt>/.git is still the one-line file git wrote, pointing at
 * gitDir. A rewritten .git (or a hard link to it, which makes it writable
 * under another name) lets sandboxed code choose the config, and so the
 * fsmonitor or pager, of the next plain git command run there, outside the
 * sandbox. The profile makes .git read-only, so this trips only on a worktree
 * run before that rule existed, or on a way around it.
 */
function checkDotGit(wt, gitDir) {
  const file = path.join(wt, '.git');
  const st = fs.lstatSync(file, { throwIfNoEntry: false });
  const target =
    st?.isFile() && st.nlink === 1 && /^gitdir: (.+)\n?$/.exec(fs.readFileSync(file, 'utf8'))?.[1];
  if (!target || path.resolve(wt, target) !== gitDir) {
    fail(
      `${file} is not the file git wrote, so git there could run code outside the sandbox. ` +
        `Run no git in it. Delete it: rm -rf ${wt}, then pnpm untrusted remove ${path.basename(wt)}`,
    );
  }
}

function showJson(rev, file) {
  try {
    return JSON.parse(git(['show', `${rev}:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

/** [{ path, mode }] from `git diff --raw -z`, mode being the new side's. */
function changedEntries(base, head) {
  const parts = git(['diff', '--raw', '-z', '--no-renames', base, head]).split('\0');
  const entries = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    entries.push({ path: parts[i + 1], mode: parts[i].split(' ')[1] });
  }
  return entries;
}

function create(args) {
  let parsed;
  try {
    parsed = parseCreateArgs(args);
  } catch (err) {
    fail(
      `${err.message}\nusage: create <pr-number|ref> [--name NAME] [--no-install] [--allow-install-config]`,
    );
  }
  const { arg, target, name, install, allowInstallConfig } = parsed;
  const wt = worktreePath(name);
  if (fs.existsSync(wt))
    fail(`${wt} already exists. Remove it first: pnpm untrusted remove ${name}`);
  if (
    git(['config', '--bool', 'extensions.worktreeConfig'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }) !== 'true'
  ) {
    fail('extensions.worktreeConfig is off, so hooks cannot be turned off for just this worktree.');
  }

  git(['fetch', '--quiet', 'origin', 'main']);
  let head;
  if (target.kind === 'pr') {
    const ref = `refs/untrusted/pr-${target.number}`;
    git(['fetch', '--quiet', 'origin', `+refs/pull/${target.number}/head:${ref}`]);
    head = git(['rev-parse', '--verify', ref]);
  } else {
    head = git(['rev-parse', '--verify', '--end-of-options', `${target.ref}^{commit}`]);
  }
  const base = git(['merge-base', 'origin/main', head]);

  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  // Hooks off for the checkout itself too: a PR can commit .husky/_/post-checkout.
  git(['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--quiet', '--detach', wt, head]);
  git(['-C', wt, 'config', '--worktree', 'core.hooksPath', '/dev/null']);

  console.log(`\nUntrusted worktree: ${wt}`);
  console.log(
    `  HEAD ${head.slice(0, 10)} (${arg}), compared with its merge-base on origin/main ${base.slice(0, 10)}\n`,
  );
  for (const group of classifyChanges(changedEntries(base, head))) {
    console.log(`${group.label}:`);
    for (const p of group.key === 'other' && group.paths.length > 15
      ? [`${group.paths.length} files`]
      : group.paths) {
      console.log(`  ${p}`);
    }
  }

  let exitCode = 0;
  if (!install) {
    console.log('\nSkipped pnpm install (--no-install).');
  } else {
    const reasons = installConfigChanges({
      changedPaths: changedEntries(base, head).map((e) => e.path),
      basePackage: showJson(base, 'package.json'),
      headPackage: showJson(head, 'package.json'),
    });
    if (reasons.length && !allowInstallConfig) {
      console.log(`\nNot installing: this change touches install config (${reasons.join('; ')}).`);
      console.log(
        `Read those diffs. If they are fine: pnpm untrusted remove ${name}, then create again with --allow-install-config.`,
      );
      exitCode = 2;
    } else {
      console.log('\npnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile');
      const r = spawnSync(
        'pnpm',
        ['install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile'],
        {
          cwd: wt,
          env: scrubbedEnv(process.env),
          stdio: 'inherit',
        },
      );
      if (r.status !== 0) exitCode = r.status ?? 1;
    }
  }

  console.log(`
Next:
  Read the diff   git -C ${wt} diff ${base.slice(0, 10)}
  Run anything    pnpm untrusted run ${name} -- next dev --turbopack    (then open http://localhost:3000)
                  pnpm untrusted run ${name} -- vitest run
  Clean up        pnpm untrusted remove ${name}`);
  process.exit(exitCode);
}

function run(args) {
  if (process.platform !== 'darwin') fail('run needs macOS sandbox-exec.');
  const [name, ...rest] = args;
  const cmd = rest[0] === '--' ? rest.slice(1) : rest;
  if (!name || !cmd.length) fail('usage: run <name> -- <command...>');
  const wt = worktreePath(name);
  if (!registeredWorktrees().includes(wt))
    fail(`No untrusted worktree at ${wt}. See: pnpm untrusted list`);

  const realWt = fs.realpathSync(wt);
  const gitDir = gitDirOf(wt);
  checkDotGit(realWt, gitDir);

  const home = fs.realpathSync(os.homedir());
  const tmp = path.join(wt, '.untrusted-tmp');
  fs.mkdirSync(tmp, { recursive: true });
  // The command needs this node's install prefix to start, and git needs a few
  // files from the main checkout's .git; nothing else under $HOME.
  const gitPaths = gitSandboxPaths({ commonDir, gitDir });
  const readable = [
    fs.realpathSync(path.dirname(path.dirname(process.execPath))),
    ...gitPaths.readable,
  ];
  const profile = path.join(root, `${name}.sb`);
  fs.writeFileSync(
    profile,
    buildSandboxProfile({
      home,
      readable,
      listable: gitPaths.listable,
      writable: [realWt],
      readOnly: [path.join(realWt, '.git')],
    }),
    { mode: 0o600 },
  );

  const r = spawnSync('sandbox-exec', ['-f', profile, ...cmd], {
    cwd: wt,
    // pnpm stays outside: it writes to its shared store, and it would honour the
    // PR's packageManager. The worktree's own bin dir gives next, vitest, prettier.
    env: scrubbedEnv(process.env, {
      TMPDIR: tmp,
      // git reads a global ignore file from here, and warns on every run when
      // the default, ~/.config/git/ignore, is denied.
      XDG_CONFIG_HOME: tmp,
      PATH: `${path.join(wt, 'node_modules', '.bin')}:${process.env.PATH}`,
    }),
    stdio: 'inherit',
  });
  checkDotGit(realWt, gitDir);
  process.exit(r.status ?? 1);
}

function list() {
  const wts = registeredWorktrees();
  console.log(wts.length ? wts.join('\n') : `No untrusted worktrees under ${root}`);
}

function remove(args) {
  const name = args[0];
  if (!name) fail('usage: remove <name>');
  const wt = worktreePath(name);
  if (registeredWorktrees().includes(wt)) git(['worktree', 'remove', '--force', wt]);
  fs.rmSync(path.join(root, `${name}.sb`), { force: true });
  const ref = `refs/untrusted/${name}`;
  if (spawnSync('git', ['show-ref', '--verify', '--quiet', ref]).status === 0)
    git(['update-ref', '-d', ref]);
  console.log(`Removed ${wt}`);
}

const [command, ...args] = process.argv.slice(2);
const commands = { create, run, list, remove };
if (!commands[command])
  fail('usage: create | run | list | remove (see the header of scripts/untrusted-worktree.mjs)');
try {
  commands[command](args);
} catch (err) {
  fail(err.message);
}
