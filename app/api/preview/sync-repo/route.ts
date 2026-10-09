import { cookies } from 'next/headers';

import { resolveEffectiveRepoForViewer } from '@/lib/github-effective-repo-sync.mjs';
import { getCanonicalGithubRepo } from '@/lib/preview-github-repo';
import { validatePreviewForkRepo } from '@/lib/preview-fork-validation';

const cookieBase = {
  path: '/',
  sameSite: 'lax' as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
};

/**
 * POST: resolve the same effective GitHub repo Keystatic uses (upstream vs viewer’s fork)
 * and persist `ks-preview-owner` / `ks-preview-repo` for draft preview fetches.
 * Uses `keystatic-gh-access-token` (same OAuth session as Keystatic admin).
 */
export async function POST() {
  const store = await cookies();
  const token = store.get('keystatic-gh-access-token')?.value;
  if (!token) {
    return new Response(null, { status: 204 });
  }

  const canonical = getCanonicalGithubRepo();

  let effective;
  try {
    effective = await resolveEffectiveRepoForViewer(token, canonical.owner, canonical.name);
  } catch {
    return new Response(null, { status: 204 });
  }

  if (effective.owner === canonical.owner && effective.name === canonical.name) {
    store.delete('ks-preview-owner');
    store.delete('ks-preview-repo');
    return Response.json({ repo: 'canonical' });
  }

  const check = await validatePreviewForkRepo(effective.owner, effective.name);
  if (!check.ok) {
    return new Response(null, { status: 204 });
  }

  store.set('ks-preview-owner', effective.owner, cookieBase);
  store.set('ks-preview-repo', effective.name, cookieBase);

  return Response.json({ repo: 'fork', owner: effective.owner, name: effective.name });
}
