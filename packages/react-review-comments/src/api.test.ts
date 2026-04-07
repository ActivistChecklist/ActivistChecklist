import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createReviewCommentsApi } from './api';
import type { ReviewCommentsScope } from './types';

function mockFetch(impl: (input: RequestInfo | URL) => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl as typeof fetch);
}

describe('createReviewCommentsApi — request targets correct document + scope', () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchSpy = mockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ document: null, threads: [], documents: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const scopeA: ReviewCommentsScope = {
    scopeKey: 'www.a.com',
    repoFullName: 'www.a.com',
    prNumber: 'default',
    deploymentKey: 'default',
  };

  const scopeB: ReviewCommentsScope = {
    scopeKey: 'preview-xyz.vercel.app',
    repoFullName: 'preview-xyz.vercel.app',
    prNumber: 'default',
    deploymentKey: 'default',
  };

  it('fetchThreads encodes path, locale, and scope for the list endpoint', async () => {
    const api = createReviewCommentsApi('/api/review-comments');
    await api.fetchThreads({ path: '/guide/foo/', locale: 'es', scope: scopeA });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String((fetchSpy.mock.calls[0] as [RequestInfo])[0]);
    expect(url).toContain('/api/review-comments?');
    expect(url).toContain(`${encodeURIComponent('path')}=${encodeURIComponent('/guide/foo/')}`);
    expect(url).toContain(`${encodeURIComponent('locale')}=${encodeURIComponent('es')}`);
    expect(url).toContain(`${encodeURIComponent('scopeKey')}=${encodeURIComponent('www.a.com')}`);
  });

  it('different pages produce different path query values', async () => {
    const api = createReviewCommentsApi('/api/review-comments');
    await api.fetchThreads({ path: '/guide/a/', locale: 'en', scope: scopeA });
    await api.fetchThreads({ path: '/guide/b/', locale: 'en', scope: scopeA });

    const url1 = String((fetchSpy.mock.calls[0] as [RequestInfo])[0]);
    const url2 = String((fetchSpy.mock.calls[1] as [RequestInfo])[0]);
    expect(url1).toContain(encodeURIComponent('/guide/a/'));
    expect(url2).toContain(encodeURIComponent('/guide/b/'));
    expect(url1).not.toBe(url2);
  });

  it('different domains use different scopeKey in the same path/locale', async () => {
    const api = createReviewCommentsApi('/api/review-comments');
    await api.fetchThreads({ path: '/same/', locale: 'en', scope: scopeA });
    await api.fetchThreads({ path: '/same/', locale: 'en', scope: scopeB });

    const urlA = String((fetchSpy.mock.calls[0] as [RequestInfo])[0]);
    const urlB = String((fetchSpy.mock.calls[1] as [RequestInfo])[0]);
    expect(urlA).toContain(encodeURIComponent('www.a.com'));
    expect(urlB).toContain(encodeURIComponent('preview-xyz.vercel.app'));
  });

  it('fetchOverview uses the same api base (host-scoped data on the server)', async () => {
    const api = createReviewCommentsApi('/api/review-comments');
    await api.fetchOverview();
    const url = String((fetchSpy.mock.calls[0] as [RequestInfo])[0]);
    expect(url.endsWith('/api/review-comments/overview') || url.includes('/overview')).toBe(true);
  });
});
