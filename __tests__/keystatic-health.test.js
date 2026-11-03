import { describe, it, expect } from 'vitest';
import { keystaticHealthProblems } from '../lib/keystatic-health.mjs';

const BASE = 'https://cms.example.org';
const ADMIN = {
  status: 200,
  body: '<html lang="en"><title>Keystatic | Activist Checklist</title>',
};
const githubLogin = (params = {}) => {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', 'abc123');
  url.searchParams.set('redirect_uri', `${BASE}/api/keystatic/github/oauth/callback`);
  for (const [key, value] of Object.entries(params)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return { status: 307, location: url.toString() };
};

describe('keystaticHealthProblems', () => {
  it('is healthy when the admin loads and login redirects to GitHub', () => {
    expect(keystaticHealthProblems(BASE, ADMIN, githubLogin())).toEqual([]);
  });

  it('ignores a trailing slash on the base URL', () => {
    expect(keystaticHealthProblems(`${BASE}/`, ADMIN, githubLogin())).toEqual([]);
  });

  it('flags an admin page that is down', () => {
    const problems = keystaticHealthProblems(BASE, { status: 502, body: '' }, githubLogin());
    expect(problems).toEqual(['/keystatic/ returned 502']);
  });

  it('flags the Next.js error document even though it returns 200', () => {
    const page = { status: 200, body: '<html id="__next_error__"><title>Keystatic</title>' };
    expect(keystaticHealthProblems(BASE, page, githubLogin())).toHaveLength(1);
  });

  it('flags a 200 page that is not the admin', () => {
    const page = { status: 200, body: '<title>Activist Checklist</title>' };
    expect(keystaticHealthProblems(BASE, page, githubLogin())).toEqual([
      '/keystatic/ did not serve the Keystatic admin',
    ]);
  });

  it('names missing secrets when the login route returns 503', () => {
    const [problem] = keystaticHealthProblems(BASE, ADMIN, { status: 503, location: null });
    expect(problem).toMatch(/secrets are missing/);
  });

  it('flags a login route that answers without redirecting', () => {
    expect(keystaticHealthProblems(BASE, ADMIN, { status: 404, location: null })).toEqual([
      'login route returned 404 instead of a redirect to GitHub',
    ]);
  });

  it('flags a redirect that does not go to GitHub OAuth', () => {
    const login = { status: 302, location: 'https://evil.example/login/oauth/authorize' };
    expect(keystaticHealthProblems(BASE, ADMIN, login)).toEqual([
      'login route did not redirect to GitHub OAuth',
    ]);
    expect(keystaticHealthProblems(BASE, ADMIN, { status: 302, location: null })).toHaveLength(1);
  });

  it('flags a missing client id', () => {
    expect(keystaticHealthProblems(BASE, ADMIN, githubLogin({ client_id: null }))).toEqual([
      'GitHub OAuth redirect has no client_id',
    ]);
  });

  it('flags a callback on another host, which would break sign-in', () => {
    const login = githubLogin({
      redirect_uri: 'https://old-host.example/api/keystatic/github/oauth/callback',
    });
    expect(keystaticHealthProblems(BASE, ADMIN, login)).toEqual([
      `GitHub OAuth redirect_uri is not ${BASE}/api/keystatic/github/oauth/callback`,
    ]);
  });
});
