'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { annotationSubmitErrorMessage, isAnnotationDbError } from '@/features/annotations/annotationErrors';
import { GdocsCommentField } from '@/features/annotations/AnnotationCommentUi.jsx';

export function ThreadReplyComposer({ threadId, value, onChange, onReply, onCancel: onCancelReply, plainShell }) {
  const t = useTranslations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const canSubmit = Boolean(value?.trim());

  useEffect(() => {
    setSubmitError('');
  }, [value]);

  async function submit() {
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await onReply({
        threadId,
        comment: value.trim(),
        clear: () => onChange(''),
      });
    } catch (err) {
      if (isAnnotationDbError(err)) {
        console.error('[annotations] Database error (reply):', err);
      }
      setSubmitError(annotationSubmitErrorMessage(err, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-3">
      <GdocsCommentField
        inputId={`annotation-reply-${threadId}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('annotations.replyPlaceholder')}
        isSubmitting={isSubmitting}
        canSubmit={canSubmit}
        onSubmitShortcut={submit}
        compact
        plainShell={plainShell}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
          onClick={() => {
            onChange('');
            if (typeof onCancelReply === 'function') {
              onCancelReply();
            }
          }}
          disabled={isSubmitting}
        >
          {t('annotations.cancel')}
        </button>
        <button
          type="button"
          className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm disabled:pointer-events-none disabled:opacity-40"
          onClick={() => submit()}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? t('annotations.submitting') : t('annotations.commentButton')}
        </button>
      </div>
      {submitError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}
    </div>
  );
}
