import { cookies, draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

import { resolveEffectiveRepoForViewer } from '@/lib/github-effective-repo-sync.mjs';
import {
  decidePreviewStart,
  isPlainBranchName,
  parseOwnerRepoParam,
  parseRepoAllowlist,
  PREVIEW_GRANT_COOKIE,
  PREVIEW_GRANT_TTL_MS,
  safeSameOriginRedirectTarget,
  signPreviewGrant,
} from '@/lib/preview-grant';
import { getCanonicalGithubRepo } from '@/lib/preview-github-repo';
import { getPreviewGrantKey } from '@/lib/preview-session';

/**
 * `new URL(req.url)` requires an absolute URL; in some runtimes `req.url` is path-only.
 */
function parseRequestUrl(req: Request): URL {
  const raw = req.url;
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw);
    }
  } catch {
    // fall through
  }
  const host = req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return new URL(raw, `${proto}://${host}`);
}

/**
 * Keystatic substitutes `{branch}` raw (e.g. `content/edits`). Unencoded `/` in query values
 * can break clients; rebuilding `search` with URLSearchParams encodes as `%2F`. One redirect
 * fixes Admin-generated links; second request compares equal and continues.
 */
function canonicalPreviewSearch(
  origin: string,
  branch: string,
  to: string,
  repo: string | null,
): string {
  const u = new URL('/preview/start', origin);
  u.searchParams.set('branch', branch);
  u.searchParams.set('to', to);
  if (repo) {
    u.searchParams.set('repo', repo);
  }
  return u.search;
}

const cookieBase = {
  path: '/',
  sameSite: 'lax' as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
};

/** Unsigned cookies from before the signed grant existed; cleared so nothing reads stale values. */
const LEGACY_PREVIEW_COOKIES = ['ks-branch', 'ks-preview-owner', 'ks-preview-repo'];

const DENIED_MESSAGES = {
  'sign-in':
    'Draft preview needs a GitHub sign-in. Open /keystatic/, sign in with GitHub, then use the preview link again.',
  github: 'Could not reach GitHub to check this preview. Try again in a minute.',
  forbidden: 'You can only preview the main repository or your own fork.',
  'branch-not-found': 'That branch does not exist on the repository being previewed.',
};

/**
 * Whether `branch` is an existing branch (not a tag, pull ref or commit) on `repo`.
 */
async function branchExists(
  repo: { owner: string; name: string },
  branch: string,
  token: string | undefined,
): Promise<'yes' | 'no' | 'error'> {
  const serverToken = process.env.KEYSTATIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const bearer = token || serverToken;
  const encodedBranch = branch
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  let res: Response;
  try {
    res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/branches/${encodedBranch}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        cache: 'no-store',
      },
    );
  } catch {
    return 'error';
  }
  if (res.status === 404) {
    return 'no';
  }
  if (!res.ok) {
    return 'error';
  }
  const data = await res.json().catch(() => null);
  // GitHub answers for a renamed branch with the new one; only an exact match counts.
  return data?.name === branch ? 'yes' : 'no';
}

/**
 * Enables draft mode and issues a signed preview grant, then redirects to `to` (site path).
 * Used by Keystatic Admin preview links (see previewUrl on collections).
 *
 * Requires a GitHub sign-in through Keystatic (`keystatic-gh-access-token`); only `next dev` may
 * skip it. Which repo and branch are allowed is decided by `decidePreviewStart` in
 * lib/preview-grant.js. Content reads trust only the signed grant cookie, never the query string
 * or other cookies.
 */
export async function GET(req: Request) {
  const url = parseRequestUrl(req);
  const branch = url.searchParams.get('branch');
  const to = url.searchParams.get('to');
  const repoRaw = url.searchParams.get('repo');

  if (!branch || !to) {
    return new Response('Missing branch or to params', { status: 400 });
  }

  const repoNormalized = repoRaw?.trim() || null;
  const canonSearch = canonicalPreviewSearch(url.origin, branch, to, repoNormalized);
  if (url.search !== canonSearch) {
    const fix = new URL(url.href);
    fix.search = canonSearch;
    return NextResponse.redirect(fix);
  }

  const safePath = safeSameOriginRedirectTarget(to, url.origin);
  if (!safePath) {
    return new Response('Invalid to param (must be a same-origin path)', { status: 400 });
  }

  if (!isPlainBranchName(branch)) {
    return new Response('Invalid branch param', { status: 400 });
  }

  const requested = repoNormalized ? parseOwnerRepoParam(repoNormalized) : null;
  if (repoNormalized && !requested) {
    return new Response('Invalid repo param (use owner/name)', { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('keystatic-gh-access-token')?.value;
  const canonical = getCanonicalGithubRepo();

  const decision = await decidePreviewStart({
    branch,
    requested,
    token,
    // Inlined at build time, so production builds can never take the no-token path.
    isDevelopment: process.env.NODE_ENV === 'development',
    canonical,
    allowlist: parseRepoAllowlist(process.env.PREVIEW_FORK_REPO_ALLOWLIST),
    resolveViewerRepo: (t) => resolveEffectiveRepoForViewer(t, canonical.owner, canonical.name),
    branchExists,
  });
  if (!decision.ok) {
    return new Response(DENIED_MESSAGES[decision.reason], {
      status: decision.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const grant = signPreviewGrant(
    { owner: decision.repo.owner, name: decision.repo.name, branch },
    { key: getPreviewGrantKey(), now: Date.now() },
  );

  (await draftMode()).enable();
  cookieStore.set(PREVIEW_GRANT_COOKIE, grant, {
    ...cookieBase,
    maxAge: PREVIEW_GRANT_TTL_MS / 1000,
  });
  for (const name of LEGACY_PREVIEW_COOKIES) {
    cookieStore.delete(name);
  }

  // `redirect()` from next/navigation is the correct approach in Next.js 15: Next.js catches the
  // thrown NEXT_REDIRECT and applies all next/headers cookie mutations (draftMode + grant cookie)
  // onto the outgoing redirect response. Returning a manually-constructed NextResponse.redirect()
  // does NOT reliably merge those mutations in Next.js 15.
  redirect(safePath);
}
