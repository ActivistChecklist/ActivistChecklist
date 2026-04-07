import { describe, expect, it } from 'vitest';
import { reviewCommentsScopeFromHostHeader, reviewCommentsScopeFromRequest } from './scopeFromHost';

describe('reviewCommentsScopeFromHostHeader', () => {
  it('partitions preview vs production by host string', () => {
    const prod = reviewCommentsScopeFromHostHeader('www.example.com');
    const preview = reviewCommentsScopeFromHostHeader('my-app-git-abc.vercel.app');
    expect(prod.scopeKey).not.toBe(preview.scopeKey);
    expect(prod.repoFullName).toBe(prod.scopeKey);
    expect(prod.prNumber).toBe('default');
    expect(prod.deploymentKey).toBe('default');
  });

  it('normalizes host to lowercase and trims', () => {
    const a = reviewCommentsScopeFromHostHeader('  WWW.EXAMPLE.COM  ');
    const b = reviewCommentsScopeFromHostHeader('www.example.com');
    expect(a.scopeKey).toBe(b.scopeKey);
    expect(a.scopeKey).toBe('www.example.com');
  });

  it('returns unknown scope when host is missing', () => {
    const u = reviewCommentsScopeFromHostHeader(null);
    expect(u.scopeKey).toBe('unknown');
    expect(u.repoFullName).toBe('unknown');
  });
});

describe('reviewCommentsScopeFromRequest', () => {
  it('prefers X-Forwarded-Host over Host (proxy / CDN)', () => {
    const req = new Request('https://edge-cdn.test/api/review-comments', {
      headers: {
        host: 'edge-cdn.test',
        'x-forwarded-host': 'www.customer-site.org',
      },
    });
    const scope = reviewCommentsScopeFromRequest(req);
    expect(scope.scopeKey).toBe('www.customer-site.org');
  });

  it('falls back to Host when X-Forwarded-Host is absent', () => {
    const req = new Request('https://www.customer-site.org/api/review-comments', {
      headers: { host: 'www.customer-site.org' },
    });
    expect(reviewCommentsScopeFromRequest(req).scopeKey).toBe('www.customer-site.org');
  });
});
