import { getOrCreateDocument, listThreadsForDocument } from '@/lib/annotations/repository';
import { checkRateLimit } from '@/lib/annotations/rate-limit';
import { sanitizeDocumentInput } from '@/lib/annotations/sanitize';
import { isAnnotationDbUnavailable, requireAnnotationsEnabled } from '@/lib/annotations/http';

export async function GET(request) {
  const gate = requireAnnotationsEnabled();
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
  const scope = gate.config.scope;

  if (!path || !locale) {
    return Response.json({ error: 'path and locale are required' }, { status: 400 });
  }

  try {
    const document = await getOrCreateDocument({ ...scope, path, locale, contentHash });
    const threads = await listThreadsForDocument(document.id);
    return Response.json({ document, threads });
  } catch (error) {
    if (isAnnotationDbUnavailable(error)) {
      return Response.json({
        document: null,
        threads: [],
        dbOffline: true,
      });
    }
    throw error;
  }
}
