import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
// Kept as a literal relative path and resolved via cwd: an absolute path built from
// import.meta.dirname would be an environment value flowing into a shell command.
const LIB = 'scripts/lib/api-restart.sh';

// Git in a scratch repo must not touch this checkout. vitest runs as the
// pre-commit hook, where git exports GIT_INDEX_FILE and friends; inherited, they
// would aim the scratch repo's commands at the real index. The user's global
// config (commit signing, a hooks path) stays out too.
function scratchEnv() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
  );
  return {
    ...env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
  };
}

// Runs a lib function from inside `dir` and returns its exit status and output.
function runLib(dir, fn, ...args) {
  const res = spawnSync(
    'bash',
    ['-c', 'source "$1" && cd "$2" && shift 2 && "$@"', 'bash', LIB, dir, fn, ...args],
    { cwd: REPO_ROOT, encoding: 'utf8', env: scratchEnv() },
  );
  if (res.error) throw res.error;
  return { status: res.status, out: res.stdout };
}

const needsRestart = (p) => runLib(REPO_ROOT, 'api_path_needs_restart', p).status === 0;

describe('api_path_needs_restart', () => {
  it('restarts for the API code, its PM2 config, its dependencies and its Node', () => {
    for (const p of [
      'api/server.js',
      'api/counter.js',
      'api/README.md',
      'lib/listmonk.js',
      'ecosystem.config.js',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.nvmrc',
    ]) {
      expect(needsRestart(p), p).toBe(true);
    }
  });

  it('leaves content and the static site alone', () => {
    for (const p of [
      'content/en/pages/privacy.mdx',
      'content/es/guides/essentials.mdx',
      'messages/en.json',
      'components/Header.jsx',
      'lib/utils.js',
      'scripts/build-deploy.sh',
      'public/webhooks/deploy.php',
      // Look-alikes of the real paths.
      'apiary/notes.md',
      'docs/api/server.js',
      'packages/highlight/package.json',
      'lib/listmonk.js.bak',
    ]) {
      expect(needsRestart(p), p).toBe(false);
    }
  });
});

// Every local file the API loads, following requires from the script PM2 starts.
function apiLoadedFiles() {
  const require = createRequire(import.meta.url);
  const ecosystem = require(path.join(REPO_ROOT, 'ecosystem.config.js'));
  const app = ecosystem.apps.find((a) => a.name === 'ac-api');
  const seen = new Set();
  const queue = [path.resolve(REPO_ROOT, app.script)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.[cm]?js$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(
      /(?:require\(\s*|import\(\s*|from\s+)['"](\.{1,2}\/[^'"]+)['"]/g,
    )) {
      queue.push(resolveLocal(path.dirname(file), m[1]));
    }
  }
  return [...seen].map((f) => path.relative(REPO_ROOT, f)).sort();
}

function resolveLocal(dir, spec) {
  const base = path.resolve(dir, spec);
  for (const candidate of [
    base,
    `${base}.js`,
    `${base}.cjs`,
    `${base}.json`,
    path.join(base, 'index.js'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`cannot resolve ${spec} from ${dir}`);
}

describe('the files the API loads', () => {
  // When the API starts loading another file outside api/, add it to
  // api_path_needs_restart, or deploys that change it will not restart the API.
  it('all restart the API when they change', () => {
    const files = apiLoadedFiles();
    expect(files).toContain('api/server.js');
    expect(files).toContain('lib/listmonk.js');
    expect(files.filter((f) => !needsRestart(f))).toEqual([]);
  });
});

describe('api_restart_reason', () => {
  let repo;

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  function git(...args) {
    const res = spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: scratchEnv() });
    if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
    return res.stdout.trim();
  }

  // Applies the changes and commits them; returns the new HEAD.
  function commit({ write = {}, remove = [], move = [] } = {}) {
    for (const [file, content] of Object.entries(write)) {
      mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      writeFileSync(path.join(repo, file), content);
    }
    for (const file of remove) git('rm', '-q', file);
    for (const [from, to] of move) {
      mkdirSync(path.dirname(path.join(repo, to)), { recursive: true });
      git('mv', from, to);
    }
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', 'change');
    return git('rev-parse', 'HEAD');
  }

  // A checkout with the API and some content, as of the commit ac-api runs.
  function deployedRepo() {
    repo = mkdtempSync(path.join(os.tmpdir(), 'api-restart-'));
    git('init', '-q', '-b', 'main');
    return commit({
      write: {
        'api/server.js': 'server v1\n',
        'api/contact.js': 'contact v1\n',
        'lib/listmonk.js': 'listmonk v1\n',
        'pnpm-lock.yaml': 'lock v1\n',
        'content/en/pages/privacy.mdx': 'privacy v1\n',
      },
    });
  }

  const reason = (rev) => runLib(repo, 'api_restart_reason', rev);

  it('leaves the API alone after a content-only deploy', () => {
    const running = deployedRepo();
    commit({ write: { 'content/en/pages/privacy.mdx': 'privacy v2\n' } });
    expect(reason(running)).toEqual({ status: 1, out: '' });
  });

  it('restarts when API code changed, naming the file', () => {
    const running = deployedRepo();
    commit({ write: { 'api/contact.js': 'contact v2\n' } });
    const r = reason(running);
    expect(r.status).toBe(0);
    expect(r.out).toBe(`api/contact.js changed since ${running.slice(0, 12)}`);
  });

  it('restarts when a dependency pin changed', () => {
    const running = deployedRepo();
    commit({ write: { 'pnpm-lock.yaml': 'lock v2\n' } });
    expect(reason(running).status).toBe(0);
  });

  // One deploy can carry several pushes: the API change is not in the newest commit.
  it('restarts when an earlier commit in the deploy changed the API', () => {
    const running = deployedRepo();
    commit({ write: { 'lib/listmonk.js': 'listmonk v2\n' } });
    commit({ write: { 'content/en/pages/privacy.mdx': 'privacy v2\n' } });
    expect(reason(running).status).toBe(0);
  });

  it('leaves the API alone when an API change was reverted before the deploy', () => {
    const running = deployedRepo();
    commit({ write: { 'api/server.js': 'server v2\n' } });
    commit({
      write: { 'api/server.js': 'server v1\n', 'content/en/pages/privacy.mdx': 'privacy v2\n' },
    });
    expect(reason(running).status).toBe(1);
  });

  // Rename detection would list only lib/contact.js, which is not an API path.
  it('restarts when a file moved out of api/', () => {
    const running = deployedRepo();
    commit({ move: [['api/contact.js', 'lib/contact.js']] });
    expect(reason(running).status).toBe(0);
  });

  it('restarts when a file the API loads was deleted', () => {
    const running = deployedRepo();
    commit({ remove: ['lib/listmonk.js'] });
    expect(reason(running).status).toBe(0);
  });

  it('restarts when there is no record of what the API runs', () => {
    deployedRepo();
    const r = reason('');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/no record/);
  });

  it('restarts when the recorded commit is not in the checkout', () => {
    deployedRepo();
    const r = reason('0123456789abcdef0123456789abcdef01234567');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/not in this checkout/);
  });

  it('restarts, without passing it to git, when the record is not a SHA', () => {
    deployedRepo();
    for (const junk of ['abc123', '--output=pwned', 'HEAD', `${'a'.repeat(40)}\n`]) {
      const r = reason(junk);
      expect(r.status, junk).toBe(0);
      expect(r.out, junk).toMatch(/not a commit SHA/);
    }
    expect(existsSync(path.join(repo, 'pwned'))).toBe(false);
  });
});
