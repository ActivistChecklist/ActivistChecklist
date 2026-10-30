import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pure helpers for draft preview authorization (no Next.js imports, so vitest can load them).
 *
 * /preview/start decides which GitHub repo and branch a signed-in GitHub user may preview,
 * then stores that decision in one HMAC-signed cookie. Content reads trust only that cookie,
 * so a visitor cannot point the server at another repo or ref by editing cookies.
 */

export const PREVIEW_GRANT_COOKIE = 'ks-preview';

/** Matches the GitHub user token lifetime Keystatic uses; sign in again after this. */
export const PREVIEW_GRANT_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * @param {string | null | undefined} repoParam: `owner/name`
 * @returns {{ owner: string, name: string } | null}
 */
export function parseOwnerRepoParam(repoParam) {
  if (!repoParam || typeof repoParam !== 'string') {
    return null;
  }
  const m = repoParam.trim().match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) {
    return null;
  }
  return { owner: m[1], name: m[2] };
}

/**
 * A branch name as Git allows it (`git check-ref-format --branch` rules), e.g. `main`,
 * `content/edits` or `traducción-es`. Rejects full refs such as `refs/pull/1/head`, so the name
 * can only be read back as `refs/heads/<name>`. The caller still confirms the branch exists.
 *
 * @param {unknown} branch
 * @returns {branch is string}
 */
export function isPlainBranchName(branch) {
  if (typeof branch !== 'string' || branch.length === 0 || Buffer.byteLength(branch) > 255) {
    return false;
  }
  // Control characters, space and the characters Git reserves for ref syntax.
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(branch) || branch.includes('@{') || branch === '@') {
    return false;
  }
  if (branch.startsWith('-') || branch.startsWith('refs/')) {
    return false;
  }
  if (branch.endsWith('.') || branch.includes('..')) {
    return false;
  }
  // Also rejects a leading or trailing `/` and `//` (empty components).
  return branch
    .split('/')
    .every((part) => part !== '' && !part.startsWith('.') && !part.endsWith('.lock'));
}

/**
 * True for a repo-relative content path such as `content/en/guides/signal.mdx`: every segment
 * is a plain file or folder name. Slugs in previewed MDX (e.g. `<ChecklistItem slug="...">`)
 * come from whoever wrote the branch, and `..` segments would let a GitHub API URL built from
 * them escape `/repos/<owner>/<name>/contents/`.
 *
 * @param {unknown} repoPath
 * @returns {boolean}
 */
export function isSafeRepoContentPath(repoPath) {
  if (typeof repoPath !== 'string' || repoPath.length === 0 || repoPath.length > 300) {
    return false;
  }
  return repoPath
    .split('/')
    .every((part) => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(part) && !part.includes('..'));
}

/**
 * Only allow same-origin relative paths (blocks open redirects via `to`). Returns the path to
 * redirect to, or null.
 *
 * @param {string} to
 * @param {string} origin
 * @returns {string | null}
 */
export function safeSameOriginRedirectTarget(to, origin) {
  const raw = to.trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return null;
  }
  let target;
  try {
    target = new URL(raw, origin);
  } catch {
    return null;
  }
  if (target.origin !== new URL(origin).origin) {
    return null;
  }
  // `/.//evil.example` normalizes to the pathname `//evil.example`, which a browser would treat
  // as another host if sent back as a relative Location.
  if (target.pathname.startsWith('//') || target.pathname.includes('..')) {
    return null;
  }
  return target.pathname + target.search + target.hash;
}

function sameRepo(a, b) {
  return (
    a != null &&
    b != null &&
    a.owner.toLowerCase() === b.owner.toLowerCase() &&
    a.name.toLowerCase() === b.name.toLowerCase()
  );
}

/**
 * Which repo a preview may read from.
 *
 * No `requested` repo: the viewer's own effective repo (what Keystatic edits: the canonical repo
 * for writers, otherwise their fork), or canonical when there is no signed-in viewer.
 * With `requested`: allowed only if it is canonical, the viewer's effective repo, or listed in
 * the operator-set allowlist. Any other fork is refused, so a link cannot make someone else's
 * browser preview content from a repo the viewer does not own. Allowlisted repos are trusted
 * like canonical: any signed-in viewer may be sent to them.
 *
 * @param {{
 *   requested: { owner: string, name: string } | null,
 *   canonical: { owner: string, name: string },
 *   viewerRepo: { owner: string, name: string } | null,
 *   allowlist: string[],
 * }} input
 * @returns {{ ok: true, repo: { owner: string, name: string } } | { ok: false }}
 */
export function choosePreviewRepo({ requested, canonical, viewerRepo, allowlist }) {
  if (!requested) {
    return { ok: true, repo: viewerRepo ?? canonical };
  }
  if (sameRepo(requested, canonical)) {
    return { ok: true, repo: canonical };
  }
  if (sameRepo(requested, viewerRepo)) {
    return { ok: true, repo: viewerRepo };
  }
  const allowed = allowlist.map(parseOwnerRepoParam).some((entry) => sameRepo(entry, requested));
  return allowed ? { ok: true, repo: requested } : { ok: false };
}

/**
 * The whole /preview/start authorization decision, with GitHub calls passed in so it can be
 * tested. Any GitHub account counts as signed in, and a non-writer gets their own fork, so
 * previewed content is untrusted input: this gate limits whose content a browser can be
 * pointed at, while lib/frontmatter.cjs and the MDX pipeline keep that content from running.
 *
 * @param {{
 *   branch: string,
 *   requested: { owner: string, name: string } | null,
 *   token: string | undefined,
 *   isDevelopment: boolean,
 *   canonical: { owner: string, name: string },
 *   allowlist: string[],
 *   resolveViewerRepo: (token: string) => Promise<{ owner: string, name: string }>,
 *   branchExists: (
 *     repo: { owner: string, name: string },
 *     branch: string,
 *     token: string | undefined,
 *   ) => Promise<'yes' | 'no' | 'error'>,
 * }} input
 * @returns {Promise<
 *   | { ok: true, repo: { owner: string, name: string } }
 *   | { ok: false, status: number, reason: 'sign-in' | 'github' | 'forbidden' | 'branch-not-found' }
 * >}
 */
export async function decidePreviewStart({
  branch,
  requested,
  token,
  isDevelopment,
  canonical,
  allowlist,
  resolveViewerRepo,
  branchExists,
}) {
  let viewerRepo = null;
  if (token) {
    try {
      viewerRepo = await resolveViewerRepo(token);
    } catch (err) {
      // 401 means an expired or revoked token; anything else is GitHub having a bad moment.
      return err?.status === 401
        ? { ok: false, status: 401, reason: 'sign-in' }
        : { ok: false, status: 502, reason: 'github' };
    }
  } else if (!isDevelopment) {
    return { ok: false, status: 401, reason: 'sign-in' };
  }

  const choice = choosePreviewRepo({ requested, canonical, viewerRepo, allowlist });
  if (!choice.ok) {
    return { ok: false, status: 403, reason: 'forbidden' };
  }

  const found = await branchExists(choice.repo, branch, token);
  if (found === 'error') {
    return { ok: false, status: 502, reason: 'github' };
  }
  if (found !== 'yes') {
    return { ok: false, status: 404, reason: 'branch-not-found' };
  }
  return { ok: true, repo: choice.repo };
}

/**
 * Parse the comma-separated PREVIEW_FORK_REPO_ALLOWLIST value.
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseRepoAllowlist(raw) {
  return (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function hmac(key, payload) {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

/**
 * @param {{ owner: string, name: string, branch: string }} grant
 * @param {{ key: string | Buffer, now: number, ttlMs?: number }} opts
 * @returns {string} cookie value
 */
export function signPreviewGrant(
  { owner, name, branch },
  { key, now, ttlMs = PREVIEW_GRANT_TTL_MS },
) {
  const payload = Buffer.from(
    JSON.stringify({ o: owner, n: name, b: branch, exp: now + ttlMs }),
  ).toString('base64url');
  return `${payload}.${hmac(key, payload)}`;
}

/**
 * Returns the grant if the signature is valid, it has not expired, and its fields are still
 * well formed. Anything else (tampered, expired, legacy, garbage) returns null.
 *
 * @param {string | null | undefined} value
 * @param {{ key: string | Buffer, now: number }} opts
 * @returns {{ owner: string, name: string, branch: string } | null}
 */
export function verifyPreviewGrant(value, { key, now }) {
  if (typeof value !== 'string') {
    return null;
  }
  const dot = value.indexOf('.');
  if (dot <= 0 || dot !== value.lastIndexOf('.')) {
    return null;
  }
  const payload = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1), 'base64url');
  const expected = Buffer.from(hmac(key, payload), 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data.exp !== 'number' || data.exp <= now) {
    return null;
  }
  const repo = parseOwnerRepoParam(`${data.o}/${data.n}`);
  if (!repo || !isPlainBranchName(data.b)) {
    return null;
  }
  return { owner: repo.owner, name: repo.name, branch: data.b };
}
