import matter from 'gray-matter';

import { DEFAULT_LOCALE } from './i18n-config.mjs';
import { getGithubRepoForContentFetch } from './preview-github-repo.js';

function authHeaders() {
  const token = process.env.KEYSTATIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Fetch raw file text from the GitHub Contents API (branch/ref can be any commit-ish).
 * Draft preview uses only this — no local `git` commands. If this returns null,
 * lib/content-draft.js returns null for that path (no disk fallback while previewing).
 * @param {string} repoPath — e.g. content/en/guides/foo.mdx
 * @returns {Promise<string|null>}
 */
export async function fetchGithubFileText(ref, repoPath) {
  const { owner, name } = await getGithubRepoForContentFetch();
  const encoded = repoPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${encoded}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    next: { revalidate: 0 },
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API ${res.status} for ${repoPath}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data || data.type !== 'file' || typeof data.content !== 'string') {
    return null;
  }
  return Buffer.from(data.content, 'base64').toString('utf8');
}

/**
 * Same shape as readMdxFileWithFallback in content.js: guides/foo.mdx under content/{locale}/.
 * GitHub API only.
 * @param {string} relativePath — e.g. guides/my-guide.mdx
 */
export async function fetchMdxWithLocaleFallback(ref, locale, relativePath) {
  const primary = `content/${locale}/${relativePath}`;
  let raw = await fetchGithubFileText(ref, primary);
  let isFallback = false;
  if (!raw && locale !== DEFAULT_LOCALE) {
    raw = await fetchGithubFileText(ref, `content/${DEFAULT_LOCALE}/${relativePath}`);
    isFallback = true;
  }
  if (!raw) {
    return null;
  }
  const resolvedRepoPath = isFallback ? `content/${DEFAULT_LOCALE}/${relativePath}` : primary;
  const { data, content } = matter(raw);
  const slug = relativePath.replace(/^.*\//, '').replace(/\.mdx$/, '');
  return {
    frontmatter: data,
    content,
    slug,
    isFallback,
    resolvedRepoPath,
  };
}
