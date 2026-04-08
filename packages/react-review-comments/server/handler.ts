import { checkRateLimit } from './rate-limit';
import {
  createComment,
  createThread,
  deleteComment,
  getOrCreateDocument,
  listScopeOverview,
  listThreadsForDocument,
  updateComment,
  updateThreadStatus,
} from './repository';
import {
  sanitizeCommentInput,
  sanitizeDocumentInput,
  sanitizeThreadInput,
  sanitizeUuidParam,
} from '../shared/sanitize';
import { isReviewCommentsDbUnavailable, requireReviewCommentsEnabled, type ReviewCommentsGate } from './http';
import { getReviewCommentsRuntimeConfigFromEnv, type ReviewCommentsRuntimeConfig } from './env';
import { reviewCommentsScopeFromRequest } from '../src/scopeFromHost';

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: message, ...extra }, { status });
}

function publicWriteDeniedResponse(): Response {
  return Response.json({ error: 'Writes are disabled' }, { status: 403 });
}

/** When `REVIEW_COMMENTS_PUBLIC_WRITE` is false, block POST / PATCH / DELETE. */
function requirePublicWriteGate(gate: ReviewCommentsGate): Response | null {
  if (!gate.ok) {
    return null;
  }
  if (!gate.config.publicReadWrite) {
    return publicWriteDeniedResponse();
  }
  return null;
}

async function parseJsonObject(
  request: Request
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const data = await request.json();
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, response: jsonError('Invalid JSON body', 400) };
    }
    return { ok: true, data: data as Record<string, unknown> };
  } catch {
    return { ok: false, response: jsonError('Invalid JSON', 400) };
  }
}

export type ReviewCommentsRouteContext = {
  params?: Promise<{ path?: string | string[] }> | { path?: string | string[] };
};

export type ReviewCommentsHandlerOptions = {
  /**
   * Override feature flags (`enabled`, `publicReadWrite`). Document scope is always taken from
   * the incoming request `Host` / `X-Forwarded-Host`. Defaults to `getReviewCommentsRuntimeConfigFromEnv`.
   */
  getReviewCommentsRuntimeConfig?: (env?: NodeJS.ProcessEnv) => ReviewCommentsRuntimeConfig;
};

type ResolveConfig = (env?: NodeJS.ProcessEnv) => ReviewCommentsRuntimeConfig;

export type { ReviewCommentsRuntimeConfig } from './env';

/**
 * Single entry for Next.js App Router: pass all methods to this handler with params from [[...path]].
 * Mount at e.g. /api/review-comments/[[...path]]
 */
export async function handleReviewCommentsRequest(
  request: Request,
  routeContext: ReviewCommentsRouteContext = {},
  options?: ReviewCommentsHandlerOptions
): Promise<Response> {
  const resolveConfig: ResolveConfig =
    options?.getReviewCommentsRuntimeConfig ?? getReviewCommentsRuntimeConfigFromEnv;

  const method = request.method;
  const params = routeContext.params != null ? await routeContext.params : {};
  const rawPath = params.path;
  const segments = Array.isArray(rawPath) ? rawPath : rawPath ? [rawPath] : [];

  if (method === 'GET' && segments.length === 0) {
    return handleListDocumentThreads(request, resolveConfig);
  }
  if (method === 'GET' && segments[0] === 'overview' && segments.length === 1) {
    return handleOverview(request, resolveConfig);
  }
  if (method === 'POST' && segments[0] === 'threads' && segments.length === 1) {
    return handleCreateThread(request, resolveConfig);
  }
  if (method === 'PATCH' && segments[0] === 'threads' && segments.length === 2) {
    return handlePatchThread(request, segments[1], resolveConfig);
  }
  if (method === 'POST' && segments[0] === 'comments' && segments.length === 1) {
    return handleCreateComment(request, resolveConfig);
  }
  if (method === 'PATCH' && segments[0] === 'comments' && segments.length === 2) {
    return handlePatchComment(request, segments[1], resolveConfig);
  }
  if (method === 'DELETE' && segments[0] === 'comments' && segments.length === 2) {
    return handleDeleteComment(request, segments[1], resolveConfig);
  }

  return jsonError('Not found', 404);
}

async function handleListDocumentThreads(request: Request, getConfig: ResolveConfig): Promise<Response> {
  const gate = requireReviewCommentsEnabled(getConfig);
  if (!gate.ok) {
    return gate.response;
  }

  const limiter = checkRateLimit(request, 'list', 120, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const url = new URL(request.url);
  const { path, locale, contentHash } = sanitizeDocumentInput({
    path: url.searchParams.get('path') || '',
    locale: url.searchParams.get('locale') || '',
    contentHash: url.searchParams.get('contentHash') || '',
  });
  const scope = reviewCommentsScopeFromRequest(request);

  if (!path || !locale) {
    return Response.json({ error: 'path and locale are required' }, { status: 400 });
  }

  try {
    const document = await getOrCreateDocument({ ...scope, path, locale, contentHash });
    const threads = await listThreadsForDocument(document.id as string);
    return Response.json({ document, threads });
  } catch (error) {
    if (isReviewCommentsDbUnavailable(error)) {
      return Response.json({
        document: null,
        threads: [],
        dbOffline: true,
      });
    }
    throw error;
  }
}

async function handleOverview(request: Request, getConfig: ResolveConfig): Promise<Response> {
  const gate = requireReviewCommentsEnabled(getConfig);
  if (!gate.ok) {
    return gate.response;
  }

  const limiter = checkRateLimit(request, 'overview', 60, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  try {
    const documents = await listScopeOverview(reviewCommentsScopeFromRequest(request));
    return Response.json({ documents });
  } catch (error) {
    if (isReviewCommentsDbUnavailable(error)) {
      return Response.json({ documents: [], dbOffline: true });
    }
    throw error;
  }
}

async function handleCreateThread(request: Request, getConfig: ResolveConfig): Promise<Response> {
  const gate = requireReviewCommentsEnabled(getConfig);
  if (!gate.ok) {
    return gate.response;
  }
  const writeDenied = requirePublicWriteGate(gate);
  if (writeDenied) {
    return writeDenied;
  }

  const limiter = checkRateLimit(request, 'create-thread', 20, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const body = parsed.data;
  const doc = sanitizeDocumentInput({
    path: body?.path as string,
    locale: body?.locale as string,
    contentHash: body?.contentHash as string | undefined,
  });
  const scope = reviewCommentsScopeFromRequest(request);
  const threadInput = sanitizeThreadInput({
    quoteText: body?.quoteText as string,
    createdBy: body?.createdBy as string,
    anchorSelector: body?.anchorSelector,
    startOffset: body?.startOffset,
    endOffset: body?.endOffset,
  });
  const commentInput = sanitizeCommentInput({
    body: body?.comment as string,
    createdBy: body?.createdBy as string,
  });

  if (!doc.path || !doc.locale || !threadInput.quoteText || !commentInput.body) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const document = await getOrCreateDocument({ ...scope, ...doc });
    const thread = await createThread({
      documentId: document.id as string,
      anchorSelector: threadInput.anchorSelector,
      quoteText: threadInput.quoteText,
      startOffset: threadInput.startOffset,
      endOffset: threadInput.endOffset,
      createdBy: threadInput.createdBy,
      initialComment: commentInput.body,
    });

    return Response.json({ thread }, { status: 201 });
  } catch (error) {
    if (isReviewCommentsDbUnavailable(error)) {
      return Response.json(
        { error: 'Review comments database is not connected in this environment.' },
        { status: 503 }
      );
    }
    throw error;
  }
}

async function handlePatchThread(
  request: Request,
  threadId: string,
  getConfig: ResolveConfig
): Promise<Response> {
  const gate = requireReviewCommentsEnabled(getConfig);
  if (!gate.ok) {
    return gate.response;
  }
  const writeDenied = requirePublicWriteGate(gate);
  if (writeDenied) {
    return writeDenied;
  }

  const limiter = checkRateLimit(request, 'update-thread', 60, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const body = parsed.data;
  const scope = reviewCommentsScopeFromRequest(request);
  const status = body?.status === 'resolved' ? 'resolved' : 'open';

  const safeThreadId = sanitizeUuidParam(threadId);
  if (!safeThreadId) {
    return Response.json({ error: 'Invalid thread id' }, { status: 400 });
  }

  const thread = await updateThreadStatus({ threadId: safeThreadId, status, scope });
  if (!thread) {
    return Response.json({ error: 'Thread not found' }, { status: 404 });
  }
  return Response.json({ thread });
}

async function handleCreateComment(request: Request, getConfig: ResolveConfig): Promise<Response> {
  const gate = requireReviewCommentsEnabled(getConfig);
  if (!gate.ok) {
    return gate.response;
  }
  const writeDenied = requirePublicWriteGate(gate);
  if (writeDenied) {
    return writeDenied;
  }

  const limiter = checkRateLimit(request, 'create-comment', 40, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const body = parsed.data;
  const rawThreadId = typeof body?.threadId === 'string' ? body.threadId : '';
  const threadId = sanitizeUuidParam(rawThreadId);
  const scope = reviewCommentsScopeFromRequest(request);
  const commentInput = sanitizeCommentInput({
    body: body?.comment as string,
    createdBy: body?.createdBy as string,
  });

  if (!threadId || !commentInput.body) {
    return Response.json({ error: 'threadId and comment are required' }, { status: 400 });
  }

  try {
    const comment = await createComment({
      threadId,
      body: commentInput.body,
      createdBy: commentInput.createdBy,
      scope,
    });
    if (!comment) {
      return Response.json({ error: 'Thread not found' }, { status: 404 });
    }

    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    if (isReviewCommentsDbUnavailable(error)) {
      return Response.json(
        { error: 'Review comments database is not connected in this environment.' },
        { status: 503 }
      );
    }
    throw error;
  }
}

async function handlePatchComment(
  request: Request,
  commentId: string,
  getConfig: ResolveConfig
): Promise<Response> {
  const gate = requireReviewCommentsEnabled(getConfig);
  if (!gate.ok) {
    return gate.response;
  }
  const writeDenied = requirePublicWriteGate(gate);
  if (writeDenied) {
    return writeDenied;
  }

  const limiter = checkRateLimit(request, 'update-comment', 60, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const body = parsed.data;
  const commentInput = sanitizeCommentInput({
    body: body?.comment as string,
    createdBy: '',
  });

  const safeCommentId = sanitizeUuidParam(commentId);
  if (!safeCommentId || !commentInput.body) {
    return Response.json({ error: 'comment id and body are required' }, { status: 400 });
  }

  try {
    const comment = await updateComment({
      commentId: safeCommentId,
      body: commentInput.body,
      scope: reviewCommentsScopeFromRequest(request),
    });
    if (!comment) {
      return Response.json({ error: 'Comment not found' }, { status: 404 });
    }
    return Response.json({ comment });
  } catch (error) {
    if (isReviewCommentsDbUnavailable(error)) {
      return Response.json(
        { error: 'Review comments database is not connected in this environment.' },
        { status: 503 }
      );
    }
    throw error;
  }
}

async function handleDeleteComment(
  request: Request,
  commentId: string,
  getConfig: ResolveConfig
): Promise<Response> {
  const gate = requireReviewCommentsEnabled(getConfig);
  if (!gate.ok) {
    return gate.response;
  }
  const writeDenied = requirePublicWriteGate(gate);
  if (writeDenied) {
    return writeDenied;
  }

  const limiter = checkRateLimit(request, 'delete-comment', 40, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const safeCommentId = sanitizeUuidParam(commentId);
  if (!safeCommentId) {
    return Response.json({ error: 'Invalid comment id' }, { status: 400 });
  }

  try {
    const deleted = await deleteComment({
      commentId: safeCommentId,
      scope: reviewCommentsScopeFromRequest(request),
    });
    if (!deleted) {
      return Response.json({ error: 'Comment not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (isReviewCommentsDbUnavailable(error)) {
      return Response.json(
        { error: 'Review comments database is not connected in this environment.' },
        { status: 503 }
      );
    }
    throw error;
  }
}
