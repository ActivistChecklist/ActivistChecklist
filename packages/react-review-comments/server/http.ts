import { getAnnotationsConfig, type AnnotationsRuntimeConfig } from './env';

export function annotationsUnavailableResponse(): Response {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

export type AnnotationsGate =
  | { ok: true; config: AnnotationsRuntimeConfig }
  | { ok: false; response: Response };

export function requireAnnotationsEnabled(
  getConfig: (env?: NodeJS.ProcessEnv) => AnnotationsRuntimeConfig = getAnnotationsConfig
): AnnotationsGate {
  const config = getConfig(process.env);
  if (!config.enabled) {
    return { ok: false, response: annotationsUnavailableResponse() };
  }
  return { ok: true, config };
}

export function isAnnotationDbUnavailable(error: unknown): boolean {
  const message = String((error as Error)?.message || '');
  return (
    message.includes('Missing REVIEW_COMMENTS_MONGODB_URL') ||
    message.includes('ECONNREFUSED') ||
    message.includes('MongoServerSelectionError') ||
    message.includes('connect ECONNREFUSED') ||
    message.includes('database') ||
    message.includes('does not exist')
  );
}
