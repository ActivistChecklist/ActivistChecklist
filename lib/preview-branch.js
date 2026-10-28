import 'server-only';

import { getPreviewGrant } from './preview-session';

/**
 * When draft mode is on and /preview/start issued a valid signed grant, returns the plain branch
 * name being previewed (for display and links). Otherwise null.
 */
export async function getPreviewBranch() {
  return (await getPreviewGrant())?.branch ?? null;
}

/**
 * The same branch as a fully qualified ref for GitHub API reads, so GitHub can only resolve it
 * as a branch (never a tag, pull request ref or commit with the same name).
 */
export async function getPreviewBranchRef() {
  const branch = await getPreviewBranch();
  return branch ? `refs/heads/${branch}` : null;
}
