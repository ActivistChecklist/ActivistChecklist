'use client';

import { useState, useEffect } from 'react';
import { useReviewComments } from './context';
import { annotationSubmitErrorMessage, isAnnotationDbError } from './annotationErrors';
import { GdocsCommentField } from './AnnotationCommentUi';

export function ThreadReplyComposer({
  threadId,
  value,
  onChange,
  onReply,
  onCancel: onCancelReply,
  plainShell,
}: {
  threadId: string;
  value: string;
  onChange: (next: string) => void;
  onReply: (args: {
    threadId: string;
    comment: string;
    clear: () => void;
  }) => Promise<void>;
  onCancel?: () => void;
  plainShell?: boolean;
}) {
  const { labels } = useReviewComments();
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
        console.error('[react-review-comments] Database error (reply):', err);
      }
      setSubmitError(annotationSubmitErrorMessage(err, labels));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rrc-reply-wrap">
      <GdocsCommentField
        inputId={`rrc-reply-${threadId}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={labels.replyPlaceholder}
        isSubmitting={isSubmitting}
        canSubmit={canSubmit}
        onSubmitShortcut={submit}
        compact
        plainShell={plainShell}
      />
      <div className="rrc-row-actions">
        <button
          type="button"
          className="rrc-btn-ghost"
          onClick={() => {
            onChange('');
            if (typeof onCancelReply === 'function') {
              onCancelReply();
            }
          }}
          disabled={isSubmitting}
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          className="rrc-btn-primary"
          onClick={() => submit()}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? labels.submitting : labels.commentButton}
        </button>
      </div>
      {submitError ? (
        <p className="rrc-alert" role="alert">
          {submitError}
        </p>
      ) : null}
    </div>
  );
}
