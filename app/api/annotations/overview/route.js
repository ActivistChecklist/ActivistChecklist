import { checkRateLimit } from '@/lib/annotations/rate-limit';
import { listScopeOverview } from '@/lib/annotations/repository';
import { isAnnotationDbUnavailable, requireAnnotationsEnabled } from '@/lib/annotations/http';

export async function GET(request) {
  const gate = requireAnnotationsEnabled();
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
    const documents = await listScopeOverview(gate.config.scope);
    return Response.json({ documents });
  } catch (error) {
    if (isAnnotationDbUnavailable(error)) {
      return Response.json({ documents: [], dbOffline: true });
    }
    throw error;
  }
}
