import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createReviewCommentsApi } from './api';

function mockFetch(impl: (input: RequestInfo | URL) => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl as typeof fetch);
}

describe('createReviewCommentsApi — list and overview requests', () => {
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

  it('fetchThreads sends only path and locale (scope comes from request Host on the server)', async () => {
    const api = createReviewCommentsApi('/api/review-comments');
    await api.fetchThreads({ path: '/guide/foo/', locale: 'es' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String((fetchSpy.mock.calls[0] as [RequestInfo])[0]);
    expect(url).toContain('/api/review-comments?');
    expect(url).toContain(`${encodeURIComponent('path')}=${encodeURIComponent('/guide/foo/')}`);
    expect(url).toContain(`${encodeURIComponent('locale')}=${encodeURIComponent('es')}`);
    expect(url).not.toContain('scopeKey');
  });

  it('different pages produce different path query values', async () => {
    const api = createReviewCommentsApi('/api/review-comments');
    await api.fetchThreads({ path: '/guide/a/', locale: 'en' });
    await api.fetchThreads({ path: '/guide/b/', locale: 'en' });

    const url1 = String((fetchSpy.mock.calls[0] as [RequestInfo])[0]);
    const url2 = String((fetchSpy.mock.calls[1] as [RequestInfo])[0]);
    expect(url1).toContain(encodeURIComponent('/guide/a/'));
    expect(url2).toContain(encodeURIComponent('/guide/b/'));
    expect(url1).not.toBe(url2);
  });

  it('fetchOverview uses the same api base (host-scoped data on the server)', async () => {
    const api = createReviewCommentsApi('/api/review-comments');
    await api.fetchOverview();
    const url = String((fetchSpy.mock.calls[0] as [RequestInfo])[0]);
    expect(url.endsWith('/api/review-comments/overview') || url.includes('/overview')).toBe(true);
  });
});
