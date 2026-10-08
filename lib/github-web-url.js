/**
 * Public GitHub blob URL (no API). Branch ref may contain slashes (e.g. content/edits).
 * @param {string} branch
 * @param {string} locale
 * @param {string} relativeUnderContent — e.g. guides/foo.mdx or pages/about.mdx
 * @param {{ owner?: string, name?: string }} [repo] — fork override for draft preview; defaults to env
 */
export function githubBlobUrl(branch, locale, relativeUnderContent, repo) {
  const owner = repo?.owner ?? (process.env.KEYSTATIC_GITHUB_REPO_OWNER || 'ActivistChecklist');
  const name = repo?.name ?? (process.env.KEYSTATIC_GITHUB_REPO_NAME || 'ActivistChecklist');
  const path = `content/${locale}/${relativeUnderContent}`;
  const encodedPath = path
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `https://github.com/${owner}/${name}/blob/${encodeURIComponent(branch)}/${encodedPath}`;
}
