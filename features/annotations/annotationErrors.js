export function isAnnotationDbError(err) {
  return err?.status === 503 || String(err?.message || '').includes('database');
}

export function annotationSubmitErrorMessage(err, t) {
  if (isAnnotationDbError(err)) {
    return t('annotations.dbUnavailable');
  }
  return t('annotations.submitFailed');
}
