import 'server-only';

import { getPreviewGrant } from './preview-session';

export function getCanonicalGithubRepo() {
  return {
    owner: process.env.KEYSTATIC_GITHUB_REPO_OWNER || 'ActivistChecklist',
    name: process.env.KEYSTATIC_GITHUB_REPO_NAME || 'ActivistChecklist',
  };
}

/**
 * Repo to use for GitHub Contents API reads: the one in the signed preview grant (canonical or
 * the previewer's fork, chosen by /preview/start), otherwise the canonical repo from env.
 */
export async function getGithubRepoForContentFetch() {
  const grant = await getPreviewGrant();
  if (grant) {
    return { owner: grant.owner, name: grant.name };
  }
  return getCanonicalGithubRepo();
}
