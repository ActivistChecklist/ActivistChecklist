import { checkRateLimit } from '@/lib/annotations/rate-limit';
import { createComment } from '@/lib/annotations/repository';
import { sanitizeCommentInput } from '@/lib/annotations/sanitize';
import { isAnnotationDbUnavailable, requireAnnotationsEnabled } from '@/lib/annotations/http';

export async function POST(request) {
  const gate = requireAnnotationsEnabled();
  if (!gate.ok) {
    return gate.response;
  }

  const limiter = checkRateLimit(request, 'create-comment', 40, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const body = await request.json();
  const threadId = typeof body?.threadId === 'string' ? body.threadId : '';
  const scope = gate.config.scope;
  const commentInput = sanitizeCommentInput({
    body: body?.comment,
    createdBy: body?.createdBy,
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
    if (isAnnotationDbUnavailable(error)) {
      return Response.json(
        { error: 'Annotations database is not connected in this environment.' },
        { status: 503 }
      );
    }
    throw error;
  }
}
