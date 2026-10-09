import 'server-only';

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

function getCanonical() {
  return {
    owner: process.env.KEYSTATIC_GITHUB_REPO_OWNER || 'ActivistChecklist',
    name: process.env.KEYSTATIC_GITHUB_REPO_NAME || 'ActivistChecklist',
  };
}

/**
 * @param {string | null | undefined} repoParam — `owner/name`
 * @returns {{ owner: string, name: string } | null}
 */
export function parseOwnerRepoParam(repoParam) {
  if (!repoParam || typeof repoParam !== 'string') {
    return null;
  }
  const trimmed = repoParam.trim();
  const m = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) {
    return null;
  }
  return { owner: m[1], name: m[2] };
}

/**
 * Allow previewing GitHub content from a fork (or the canonical repo).
 * Accepts: canonical repo; optional comma list PREVIEW_FORK_REPO_ALLOWLIST; otherwise
 * verifies via GitHub API that the repo is the canonical repo or a fork of it (parent chain).
 *
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function validatePreviewForkRepo(owner, name) {
  const canonical = getCanonical();
  const canonicalFull = `${canonical.owner}/${canonical.name}`;
  if (owner === canonical.owner && name === canonical.name) {
    return { ok: true };
  }

  const allowlistRaw = process.env.PREVIEW_FORK_REPO_ALLOWLIST || '';
  const allowed = allowlistRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.includes(`${owner}/${name}`)) {
    return { ok: true };
  }

  let o = owner;
  let n = name;
  for (let depth = 0; depth < 8; depth++) {
    const res = await fetch(`https://api.github.com/repos/${o}/${n}`, {
      headers: authHeaders(),
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return {
        ok: false,
        message: 'Repository not found or not accessible for preview',
      };
    }
    const data = await res.json();
    if (data.full_name === canonicalFull) {
      return { ok: true };
    }
    const parent = data.parent;
    if (!parent) {
      return {
        ok: false,
        message: 'Not a fork of the configured canonical repository',
      };
    }
    if (parent.full_name === canonicalFull) {
      return { ok: true };
    }
    o = parent.owner.login;
    n = parent.name;
  }

  return {
    ok: false,
    message: 'Could not verify fork relationship (chain too deep)',
  };
}
