import 'server-only';

import { cookies, draftMode } from 'next/headers';
import { cache } from 'react';

export function getCanonicalGithubRepo() {
  return {
    owner: process.env.KEYSTATIC_GITHUB_REPO_OWNER || 'ActivistChecklist',
    name: process.env.KEYSTATIC_GITHUB_REPO_NAME || 'ActivistChecklist',
  };
}

/**
 * Fork target for draft preview (cookies), when set and draft mode is on.
 * @returns {Promise<{ owner: string, name: string } | null>}
 */
export const getPreviewForkRepoFromCookies = cache(async function getPreviewForkRepoFromCookies() {
  try {
    const dm = await draftMode();
    if (!dm.isEnabled) {
      return null;
    }
  } catch {
    return null;
  }

  const store = await cookies();
  const owner = store.get('ks-preview-owner')?.value;
  const name = store.get('ks-preview-repo')?.value;
  if (!owner || !name) {
    return null;
  }
  return { owner, name };
});

/**
 * Repo to use for GitHub Contents API during preview (fork) or default from env.
 */
export async function getGithubRepoForContentFetch() {
  const fork = await getPreviewForkRepoFromCookies();
  if (fork) {
    return fork;
  }
  return getCanonicalGithubRepo();
}
