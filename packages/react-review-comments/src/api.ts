import type {
  ApiError,
  CreateCommentPayload,
  CreateThreadPayload,
  OverviewDocument,
  ReviewCommentsApi,
  RrcComment,
  RrcThread,
} from './types';

async function parseJson(response: Response): Promise<unknown> {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(String(payload.error || 'Request failed')) as ApiError;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createReviewCommentsApi(apiBase: string): ReviewCommentsApi {
  const base = String(apiBase || '/api/review-comments').replace(/\/$/, '');

  const api: ReviewCommentsApi = {
    async fetchThreads({ path, locale }: { path: string; locale: string }) {
      const params = new URLSearchParams({
        path,
        locale,
      });
      const response = await fetch(`${base}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
      });
      return parseJson(response) as Promise<{ document: unknown; threads: RrcThread[]; dbOffline?: boolean }>;
    },

    async fetchOverview() {
      const response = await fetch(`${base}/overview`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
      });
      return parseJson(response) as Promise<{ documents: OverviewDocument[]; dbOffline?: boolean }>;
    },

    async createThread(payload: CreateThreadPayload) {
      const response = await fetch(`${base}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      return parseJson(response) as Promise<{ thread: RrcThread }>;
    },

    async createComment(payload: CreateCommentPayload) {
      const response = await fetch(`${base}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      return parseJson(response) as Promise<{ comment: RrcComment }>;
    },

    async patchThreadStatus(threadId: string, status: string) {
      const response = await fetch(`${base}/threads/${encodeURIComponent(threadId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status }),
      });
      return parseJson(response) as Promise<{ thread: unknown }>;
    },

    async patchComment(commentId: string, comment: string) {
      const response = await fetch(`${base}/comments/${encodeURIComponent(commentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ comment }),
      });
      return parseJson(response) as Promise<{ comment: RrcComment }>;
    },

    async deleteComment(commentId: string) {
      const response = await fetch(`${base}/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
      });
      return parseJson(response);
    },
  };

  return api;
}
