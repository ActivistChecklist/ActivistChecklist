/**
 * Mirrors Keystatic’s GitHubAppShellProvider fork resolution (see
 * packages/keystatic/src/app/shell/data.tsx): if the viewer has write access to the
 * configured repo, use it; otherwise use the viewer’s fork (first OWNER fork).
 *
 * @param {string} accessToken — GitHub user access token (Keystatic OAuth cookie)
 * @param {string} canonicalOwner
 * @param {string} canonicalName
 * @returns {Promise<{ owner: string, name: string }>}
 */
export async function resolveEffectiveRepoForViewer(accessToken, canonicalOwner, canonicalName) {
  const canonical = { owner: canonicalOwner, name: canonicalName };

  const query = `
    query EffectiveRepo($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        viewerPermission
        forks(affiliations: [OWNER], first: 1) {
          nodes {
            owner { login }
            name
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { owner: canonicalOwner, name: canonicalName },
    }),
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GraphQL ${res.status}: ${text.slice(0, 200)}`);
  }

  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join('; ') || 'GraphQL error');
  }

  const repo = body.data?.repository;
  if (!repo) {
    return canonical;
  }

  const writePermissions = new Set(['WRITE', 'ADMIN', 'MAINTAIN']);
  if (repo.viewerPermission && writePermissions.has(repo.viewerPermission)) {
    return canonical;
  }

  const fork = repo.forks?.nodes?.[0];
  if (fork?.owner?.login && fork?.name) {
    return { owner: fork.owner.login, name: fork.name };
  }

  return canonical;
}
