import { describe, expect, it } from 'vitest';

import {
  choosePreviewRepo,
  decidePreviewStart,
  isPlainBranchName,
  isSafeRepoContentPath,
  parseOwnerRepoParam,
  parseRepoAllowlist,
  PREVIEW_GRANT_TTL_MS,
  safeSameOriginRedirectTarget,
  signPreviewGrant,
  verifyPreviewGrant,
} from '@/lib/preview-grant';

const KEY = 'test-key';
const NOW = 1_800_000_000_000;
const GRANT = { owner: 'ActivistChecklist', name: 'ActivistChecklist', branch: 'content/edits' };

function encodePayload(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

describe('signPreviewGrant / verifyPreviewGrant', () => {
  it('round-trips a grant before it expires', () => {
    const value = signPreviewGrant(GRANT, { key: KEY, now: NOW });
    expect(verifyPreviewGrant(value, { key: KEY, now: NOW + 1000 })).toEqual(GRANT);
  });

  it('rejects an expired grant', () => {
    const value = signPreviewGrant(GRANT, { key: KEY, now: NOW });
    expect(verifyPreviewGrant(value, { key: KEY, now: NOW + PREVIEW_GRANT_TTL_MS })).toBeNull();
  });

  it('rejects a grant signed with another key', () => {
    const value = signPreviewGrant(GRANT, { key: 'other', now: NOW });
    expect(verifyPreviewGrant(value, { key: KEY, now: NOW })).toBeNull();
  });

  it('rejects a payload swapped to another repo', () => {
    const value = signPreviewGrant(GRANT, { key: KEY, now: NOW });
    const sig = value.split('.')[1];
    const forged = `${encodePayload({ o: 'attacker', n: 'ActivistChecklist', b: 'main', exp: NOW + 1e9 })}.${sig}`;
    expect(verifyPreviewGrant(forged, { key: KEY, now: NOW })).toBeNull();
  });

  it.each([undefined, null, '', 'nodot', '.sig', 'a.b.c', 'payload.'])(
    'rejects malformed value %p',
    (value) => {
      expect(verifyPreviewGrant(value, { key: KEY, now: NOW })).toBeNull();
    },
  );

  it('rejects a correctly signed grant whose fields are not well formed', () => {
    const bad = signPreviewGrant({ ...GRANT, branch: 'refs/pull/1/head' }, { key: KEY, now: NOW });
    expect(verifyPreviewGrant(bad, { key: KEY, now: NOW })).toBeNull();
  });
});

describe('isPlainBranchName', () => {
  it.each([
    'main',
    'content/edits',
    'dev/sr-001_fix.2',
    'claude/x-839c9e',
    'traducción-es',
    'jeremy+edits',
    'fix-#12',
    'edits@oct',
    'x'.repeat(255),
  ])('accepts %s', (b) => {
    expect(isPlainBranchName(b)).toBe(true);
  });

  it.each([
    '',
    'refs/heads/main',
    'refs/pull/1/head',
    '../main',
    'a..b',
    '/main',
    'main/',
    'a//b',
    '-main',
    'main.lock',
    'a/.hidden',
    'main.lock/x',
    'main.',
    'main?x',
    'main branch',
    'a~1',
    'a^b',
    'a:b',
    'a*b',
    'a[b',
    'a\\b',
    'a@{1}',
    '@',
    'tab\there',
    'x'.repeat(256),
    'é'.repeat(128),
    42,
  ])('rejects %p', (b) => {
    expect(isPlainBranchName(b)).toBe(false);
  });
});

describe('choosePreviewRepo', () => {
  const canonical = { owner: 'ActivistChecklist', name: 'ActivistChecklist' };
  const fork = { owner: 'volunteer', name: 'ActivistChecklist' };

  it('defaults to the viewer repo, or canonical without a viewer', () => {
    expect(
      choosePreviewRepo({ requested: null, canonical, viewerRepo: fork, allowlist: [] }),
    ).toEqual({
      ok: true,
      repo: fork,
    });
    expect(
      choosePreviewRepo({ requested: null, canonical, viewerRepo: null, allowlist: [] }),
    ).toEqual({
      ok: true,
      repo: canonical,
    });
  });

  it('allows canonical and the viewer repo case-insensitively', () => {
    const lower = { owner: 'activistchecklist', name: 'activistchecklist' };
    expect(
      choosePreviewRepo({ requested: lower, canonical, viewerRepo: fork, allowlist: [] }),
    ).toEqual({
      ok: true,
      repo: canonical,
    });
    expect(
      choosePreviewRepo({
        requested: { owner: 'Volunteer', name: 'activistchecklist' },
        canonical,
        viewerRepo: fork,
        allowlist: [],
      }),
    ).toEqual({ ok: true, repo: fork });
  });

  it("refuses someone else's fork unless allowlisted", () => {
    const other = { owner: 'attacker', name: 'ActivistChecklist' };
    expect(
      choosePreviewRepo({ requested: other, canonical, viewerRepo: fork, allowlist: [] }),
    ).toEqual({ ok: false });
    expect(
      choosePreviewRepo({ requested: other, canonical, viewerRepo: null, allowlist: [] }),
    ).toEqual({ ok: false });
    expect(
      choosePreviewRepo({
        requested: other,
        canonical,
        viewerRepo: fork,
        allowlist: ['attacker/ActivistChecklist'],
      }),
    ).toEqual({ ok: true, repo: other });
  });
});

describe('parseOwnerRepoParam / parseRepoAllowlist', () => {
  it('parses owner/name and rejects anything else', () => {
    expect(parseOwnerRepoParam(' a-b/c.d ')).toEqual({ owner: 'a-b', name: 'c.d' });
    expect(parseOwnerRepoParam('a/b/c')).toBeNull();
    expect(parseOwnerRepoParam('a')).toBeNull();
    expect(parseOwnerRepoParam(null)).toBeNull();
  });

  it('splits and trims the allowlist', () => {
    expect(parseRepoAllowlist(' a/b, ,c/d ')).toEqual(['a/b', 'c/d']);
    expect(parseRepoAllowlist(undefined)).toEqual([]);
  });
});

describe('isSafeRepoContentPath', () => {
  it.each([
    'content/en/guides/signal.mdx',
    'content/es/checklist-items/signal-disappearing.mdx',
    'content/en/pages/nested/about_us.mdx',
  ])('accepts %s', (p) => {
    expect(isSafeRepoContentPath(p)).toBe(true);
  });

  it.each([
    'content/en/checklist-items/../../../../../../repos/o/r/contents/x.mdx',
    'content/en/checklist-items/../x.mdx',
    'content/en/./x.mdx',
    'content/en//x.mdx',
    '/content/en/x.mdx',
    'content/en/x.mdx?ref=main',
    'content/en/x%2F..%2Fy.mdx',
    'content/en/.hidden.mdx',
    '',
    null,
  ])('rejects %p', (p) => {
    expect(isSafeRepoContentPath(p)).toBe(false);
  });
});

describe('safeSameOriginRedirectTarget', () => {
  const origin = 'https://cms.example';

  it('keeps same-origin paths with query and hash', () => {
    expect(safeSameOriginRedirectTarget('/signal/?a=1#top', origin)).toBe('/signal/?a=1#top');
  });

  it('returns the normalized path, so encoded dot segments stay on this origin', () => {
    expect(safeSameOriginRedirectTarget('/%2e%2e/x', origin)).toBe('/x');
  });

  it.each([
    'https://evil.example/',
    '//evil.example',
    '/.//evil.example',
    '/\\evil.example',
    'signal/',
    '',
  ])('rejects %p', (to) => {
    expect(safeSameOriginRedirectTarget(to, origin)).toBeNull();
  });
});

describe('decidePreviewStart', () => {
  const canonical = { owner: 'ActivistChecklist', name: 'ActivistChecklist' };
  const fork = { owner: 'volunteer', name: 'ActivistChecklist' };

  function decide(overrides = {}) {
    const calls = { resolve: 0, branch: [] };
    const input = {
      branch: 'main',
      requested: null,
      token: 'user-token',
      isDevelopment: false,
      canonical,
      allowlist: [],
      resolveViewerRepo: async () => {
        calls.resolve += 1;
        return fork;
      },
      branchExists: async (repo, branch, token) => {
        calls.branch.push({ repo, branch, token });
        return 'yes';
      },
      ...overrides,
    };
    return decidePreviewStart(input).then((result) => ({ result, calls }));
  }

  it('grants a signed-in viewer their own repo after checking the branch there', async () => {
    const { result, calls } = await decide();
    expect(result).toEqual({ ok: true, repo: fork });
    expect(calls.branch).toEqual([{ repo: fork, branch: 'main', token: 'user-token' }]);
  });

  it('refuses a visitor without a token outside development, before calling GitHub', async () => {
    const { result, calls } = await decide({ token: undefined });
    expect(result).toEqual({ ok: false, status: 401, reason: 'sign-in' });
    expect(calls.resolve).toBe(0);
    expect(calls.branch).toEqual([]);
  });

  it('lets local development preview canonical without a token', async () => {
    const { result } = await decide({ token: undefined, isDevelopment: true });
    expect(result).toEqual({ ok: true, repo: canonical });
  });

  it('treats a rejected token as signed out, not as an anonymous viewer', async () => {
    const err = Object.assign(new Error('GitHub GraphQL 401'), { status: 401 });
    const { result, calls } = await decide({
      isDevelopment: true,
      resolveViewerRepo: async () => {
        throw err;
      },
    });
    expect(result).toEqual({ ok: false, status: 401, reason: 'sign-in' });
    expect(calls.branch).toEqual([]);
  });

  it('reports other GitHub failures as unavailable', async () => {
    const { result } = await decide({
      resolveViewerRepo: async () => {
        throw new Error('GitHub GraphQL 502');
      },
    });
    expect(result).toEqual({ ok: false, status: 502, reason: 'github' });
    expect((await decide({ branchExists: async () => 'error' })).result).toEqual({
      ok: false,
      status: 502,
      reason: 'github',
    });
  });

  it("refuses another user's fork", async () => {
    const { result, calls } = await decide({
      requested: { owner: 'attacker', name: 'ActivistChecklist' },
    });
    expect(result).toEqual({ ok: false, status: 403, reason: 'forbidden' });
    expect(calls.branch).toEqual([]);
  });

  it('refuses a branch GitHub does not report as an existing branch', async () => {
    const { result } = await decide({ branchExists: async () => 'no' });
    expect(result).toEqual({ ok: false, status: 404, reason: 'branch-not-found' });
  });
});
