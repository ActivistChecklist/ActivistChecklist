'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createThread } from '@/features/annotations/api';
import { annotationSubmitErrorMessage, isAnnotationDbError } from '@/features/annotations/annotationErrors';
import { ComposerAuthorRow, GdocsCommentField } from '@/features/annotations/AnnotationCommentUi';

export function SelectionComposer({
  path,
  locale,
  scope,
  author,
  updateAuthor,
  selectedQuote,
  onCreated,
  onThreadCreated,
  onCancel,
  onDraftStateChange,
}) {
  const t = useTranslations();
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const quoteText = selectedQuote || '';
  const [authorEditActive, setAuthorEditActive] = useState(false);

  useEffect(() => {
    setSubmitError('');
  }, [comment]);

  useEffect(() => {
    onDraftStateChange(
      Boolean(quoteText) || Boolean(comment.trim()) || isSubmitting || authorEditActive
    );
    return () => onDraftStateChange(false);
  }, [quoteText, comment, isSubmitting, authorEditActive, onDraftStateChange]);

  async function handleCreateThread() {
    if (!quoteText || !comment.trim()) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const response = await createThread({
        path,
        locale,
        scope,
        quoteText,
        comment: comment.trim(),
        createdBy: author,
        anchorSelector: { quote: quoteText },
      });
      setComment('');
      onThreadCreated();
      onCreated(response.thread);
    } catch (err) {
      if (isAnnotationDbError(err)) {
        console.error('[annotations] Database error (new thread):', err);
      }
      setSubmitError(annotationSubmitErrorMessage(err, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    setComment('');
    onCancel();
  }

  if (!quoteText) {
    return null;
  }

  const canSubmit = Boolean(comment.trim());

  return (
    <div
      id="annotation-draft-composer"
      className="mt-3 mb-4 rounded-2xl border border-border/70 bg-card p-3 shadow-md"
    >
      <p className="mb-3 line-clamp-3 border-l-[3px] border-primary pl-2 text-xs leading-snug text-muted-foreground">
        {quoteText}
      </p>
      <ComposerAuthorRow
        author={author}
        updateAuthor={updateAuthor}
        disabled={isSubmitting}
        onEditingChange={setAuthorEditActive}
      />
      <GdocsCommentField
        inputId="annotation-new-thread-input"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={t('annotations.commentPlaceholder')}
        isSubmitting={isSubmitting}
        canSubmit={canSubmit}
        onSubmitShortcut={handleCreateThread}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
          onClick={handleCancel}
          disabled={isSubmitting}
        >
          {t('annotations.cancel')}
        </button>
        <button
          type="button"
          className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm disabled:pointer-events-none disabled:opacity-40"
          onClick={() => handleCreateThread()}
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
