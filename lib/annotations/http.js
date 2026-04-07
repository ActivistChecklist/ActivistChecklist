import { getAnnotationsConfig } from '@/lib/annotations/env';

export function annotationsUnavailableResponse() {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

export function requireAnnotationsEnabled() {
  const config = getAnnotationsConfig();
  if (!config.enabled) {
    return { ok: false, response: annotationsUnavailableResponse() };
  }
  return { ok: true, config };
}

export function isAnnotationDbUnavailable(error) {
  const message = String(error?.message || '');
  return (
    message.includes('Missing ANNOTATIONS_DATABASE_URL or DATABASE_URL') ||
    message.includes('ECONNREFUSED') ||
    message.includes('connect ECONNREFUSED') ||
    message.includes('database') ||
    message.includes('relation') ||
    message.includes('does not exist')
  );
}
