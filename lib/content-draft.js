import 'server-only';

import { getChecklistItem, getGuide, getPage } from './content';
import { fetchMdxWithLocaleFallback } from './github-content.mjs';
import { getPreviewBranchRef } from './preview-branch';

/** GitHub only — no disk fallback (avoids showing committed content when preview ref is wrong). */
async function resolveWithGithub(branch, locale, relativePath) {
  let gh = null;
  try {
    gh = await fetchMdxWithLocaleFallback(branch, locale, relativePath);
  } catch {
    // miss
  }

  if (gh) {
    return gh;
  }

  return null;
}

/**
 * Guide MDX: with preview branch → GitHub API only; otherwise disk via lib/content.
 */
export async function resolveGuide(slug, locale) {
  const branch = await getPreviewBranchRef();
  if (branch) {
    return resolveWithGithub(branch, locale, `guides/${slug}.mdx`);
  }
  return getGuide(slug, locale);
}

/**
 * Static page MDX.
 */
export async function resolvePage(slug, locale) {
  const branch = await getPreviewBranchRef();
  if (branch) {
    return resolveWithGithub(branch, locale, `pages/${slug}.mdx`);
  }
  return getPage(slug, locale);
}

/**
 * Checklist item MDX (embedded in guides).
 */
export async function resolveChecklistItem(slug, locale) {
  const branch = await getPreviewBranchRef();
  if (branch) {
    return resolveWithGithub(branch, locale, `checklist-items/${slug}.mdx`);
  }
  return getChecklistItem(slug, locale);
}
