import { describe, expect, it } from 'vitest';
import { handleReviewCommentsRequest, type ReviewCommentsRouteContext } from './handler';

describe('handleReviewCommentsRequest — feature gate before DB', () => {
  it('returns 404 for GET threads when review comments are disabled', async () => {
    const request = new Request(
      'http://localhost/api/review-comments?path=%2Ffoo%2F&locale=en&contentHash=',
      { method: 'GET', headers: { host: 'localhost' } }
    );
    const ctx: ReviewCommentsRouteContext = { params: Promise.resolve({ path: [] }) };

    const res = await handleReviewCommentsRequest(request, ctx, {
      getReviewCommentsRuntimeConfig: () => ({ enabled: false, publicReadWrite: false }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeDefined();
  });

  it('returns 404 for POST threads when review comments are disabled', async () => {
    const request = new Request('http://localhost/api/review-comments/threads', {
      method: 'POST',
      headers: { host: 'localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/x', locale: 'en', quoteText: 'q', comment: 'c' }),
    });
    const ctx: ReviewCommentsRouteContext = { params: Promise.resolve({ path: ['threads'] }) };

    const res = await handleReviewCommentsRequest(request, ctx, {
      getReviewCommentsRuntimeConfig: () => ({ enabled: false, publicReadWrite: true }),
    });

    expect(res.status).toBe(404);
  });
});
