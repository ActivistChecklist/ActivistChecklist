import {
  getReviewCommentsRuntimeConfigFromEnv,
  type ReviewCommentsRuntimeConfig,
} from './env';

export function reviewCommentsUnavailableResponse(): Response {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

export type ReviewCommentsGate =
  | { ok: true; config: ReviewCommentsRuntimeConfig }
  | { ok: false; response: Response };

export function requireReviewCommentsEnabled(
  getConfig: (env?: NodeJS.ProcessEnv) => ReviewCommentsRuntimeConfig = getReviewCommentsRuntimeConfigFromEnv
): ReviewCommentsGate {
  const config = getConfig(process.env);
  if (!config.enabled) {
    return { ok: false, response: reviewCommentsUnavailableResponse() };
  }
  return { ok: true, config };
}

export function isReviewCommentsDbUnavailable(error: unknown): boolean {
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
