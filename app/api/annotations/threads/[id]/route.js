import { checkRateLimit } from '@/lib/annotations/rate-limit';
import { updateThreadStatus } from '@/lib/annotations/repository';
import { requireAnnotationsEnabled } from '@/lib/annotations/http';

export function generateStaticParams() {
  return [{ id: '__static__' }];
}

export async function PATCH(request, context) {
  const gate = requireAnnotationsEnabled();
  if (!gate.ok) {
    return gate.response;
  }

  const limiter = checkRateLimit(request, 'update-thread', 60, 60_000);
  if (!limiter.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } }
    );
  }

  const params = await context.params;
  const threadId = params?.id || '';
  const body = await request.json();
  const scope = gate.config.scope;
  const status = body?.status === 'resolved' ? 'resolved' : 'open';

  if (!threadId) {
    return Response.json({ error: 'Thread id is required' }, { status: 400 });
  }

  const thread = await updateThreadStatus({ threadId, status, scope });
  if (!thread) {
    return Response.json({ error: 'Thread not found' }, { status: 404 });
  }
  return Response.json({ thread });
}
