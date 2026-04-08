import type { ApiError } from './types';
import type { ReviewCommentsLabels } from './types';

export function isAnnotationDbError(err: unknown): boolean {
  const e = err as ApiError | undefined;
  return e?.status === 503 || String(e?.message || '').includes('database');
}

export function annotationSubmitErrorMessage(
  err: unknown,
  labels: ReviewCommentsLabels
): string {
  if (isAnnotationDbError(err)) {
    return labels.dbUnavailable;
  }
  return labels.submitFailed;
}
