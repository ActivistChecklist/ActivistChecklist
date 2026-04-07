import { checkRateLimit } from '@/lib/annotations/rate-limit';
import { deleteComment, updateComment } from '@/lib/annotations/repository';
import { isAnnotationDbUnavailable, requireAnnotationsEnabled } from '@/lib/annotations/http';
import { sanitizeCommentInput } from '@/lib/annotations/sanitize';

export function generateStaticParams() {
  return [{ id: '__static__' }];
}

export async function PATCH(request, context) {
  const gate = requireAnnotationsEnabled();
  if (!gate.ok) {
    return gate.response;
  }

  const limiter = checkRateLimit(request, 'update-comment', 60, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const params = await context.params;
  const commentId = params?.id || '';
  const body = await request.json();
  const commentInput = sanitizeCommentInput({
    body: body?.comment,
    createdBy: '',
  });

  if (!commentId || !commentInput.body) {
    return Response.json({ error: 'comment id and body are required' }, { status: 400 });
  }

  try {
    const comment = await updateComment({
      commentId,
      body: commentInput.body,
      scope: gate.config.scope,
    });
    if (!comment) {
      return Response.json({ error: 'Comment not found' }, { status: 404 });
    }
    return Response.json({ comment });
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

export async function DELETE(request, context) {
  const gate = requireAnnotationsEnabled();
  if (!gate.ok) {
    return gate.response;
  }

  const limiter = checkRateLimit(request, 'delete-comment', 40, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const params = await context.params;
  const commentId = params?.id || '';
  if (!commentId) {
    return Response.json({ error: 'Comment id is required' }, { status: 400 });
  }

  try {
    const deleted = await deleteComment({
      commentId,
      scope: gate.config.scope,
    });
    if (!deleted) {
      return Response.json({ error: 'Comment not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
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
