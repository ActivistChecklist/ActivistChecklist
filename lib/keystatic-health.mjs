/**
 * Decides whether the production Keystatic admin is usable from two requests
 * the scheduled probe makes (scripts/healthcheck-keystatic.mjs):
 *
 * - GET {base}/keystatic/ must serve the real admin shell. A static export
 *   build swaps the page for a stub (next.config.js), and a crashed server
 *   renders Next's error document, both with status 200.
 * - GET {base}/api/keystatic/github/login/ must redirect to GitHub's OAuth
 *   page with our client id and a callback on the same host. The route returns
 *   503 when the GitHub app secrets are missing and 404 on a static build.
 *
 * Content the editor cannot open is caught earlier, in CI, by
 * __tests__/keystatic-content.test.js.
 *
 * @param {string} baseUrl - e.g. https://cms.example.org (no trailing slash needed)
 * @param {{ status: number, body: string }} page - response to /keystatic/
 * @param {{ status: number, location: string | null }} login - response to the login route, redirects not followed
 * @returns {string[]} problems, empty when healthy
 */
export function keystaticHealthProblems(baseUrl, page, login) {
  const base = baseUrl.replace(/\/+$/, '');
  const problems = [];

  if (page.status !== 200) {
    problems.push(`/keystatic/ returned ${page.status}`);
  } else if (page.body.includes('id="__next_error__"')) {
    problems.push(
      '/keystatic/ rendered the Next.js error page (crash, or a static build is deployed)',
    );
  } else if (!/<title>Keystatic\b/.test(page.body)) {
    problems.push('/keystatic/ did not serve the Keystatic admin');
  }

  if (login.status === 503) {
    problems.push(
      'login route returned 503: the KEYSTATIC_GITHUB_* secrets are missing on the host',
    );
  } else if (login.status < 300 || login.status >= 400) {
    problems.push(`login route returned ${login.status} instead of a redirect to GitHub`);
  } else {
    let target = null;
    try {
      target = new URL(login.location ?? '');
    } catch {
      // handled below
    }
    if (
      !target ||
      target.origin !== 'https://github.com' ||
      target.pathname !== '/login/oauth/authorize'
    ) {
      problems.push('login route did not redirect to GitHub OAuth');
    } else {
      if (!target.searchParams.get('client_id')) {
        problems.push('GitHub OAuth redirect has no client_id');
      }
      const callback = `${base}/api/keystatic/github/oauth/callback`;
      if (target.searchParams.get('redirect_uri') !== callback) {
        problems.push(`GitHub OAuth redirect_uri is not ${callback}`);
      }
    }
  }

  return problems;
}
