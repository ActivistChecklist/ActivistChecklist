import { checkRateLimit } from '@/lib/annotations/rate-limit';
import { getOrCreateDocument, createThread } from '@/lib/annotations/repository';
import { sanitizeDocumentInput, sanitizeThreadInput, sanitizeCommentInput } from '@/lib/annotations/sanitize';
import { isAnnotationDbUnavailable, requireAnnotationsEnabled } from '@/lib/annotations/http';

export async function POST(request) {
  const gate = requireAnnotationsEnabled();
  if (!gate.ok) {
    return gate.response;
  }

  const limiter = checkRateLimit(request, 'create-thread', 20, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const body = await request.json();
  const doc = sanitizeDocumentInput({
    path: body?.path,
    locale: body?.locale,
    contentHash: body?.contentHash,
  });
  const scope = gate.config.scope;
  const threadInput = sanitizeThreadInput({
    quoteText: body?.quoteText,
    createdBy: body?.createdBy,
    anchorSelector: body?.anchorSelector,
    startOffset: body?.startOffset,
    endOffset: body?.endOffset,
  });
  const commentInput = sanitizeCommentInput({
    body: body?.comment,
    createdBy: body?.createdBy,
  });

  if (!doc.path || !doc.locale || !threadInput.quoteText || !commentInput.body) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const document = await getOrCreateDocument({ ...scope, ...doc });
    const thread = await createThread({
      documentId: document.id,
      anchorSelector: threadInput.anchorSelector,
      quoteText: threadInput.quoteText,
      startOffset: threadInput.startOffset,
      endOffset: threadInput.endOffset,
      createdBy: threadInput.createdBy,
      initialComment: commentInput.body,
    });

    return Response.json({ thread }, { status: 201 });
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
