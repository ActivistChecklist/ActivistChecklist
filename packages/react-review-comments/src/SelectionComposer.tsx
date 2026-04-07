'use client';

import { useState, useEffect } from 'react';
import { useReviewComments } from './context';
import { annotationSubmitErrorMessage, isAnnotationDbError } from './annotationErrors';
import { ComposerAuthorRow, GdocsCommentField } from './AnnotationCommentUi';
import type { ReviewCommentsScope, RrcThread } from './types';

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
}: {
  path: string;
  locale: string;
  scope: ReviewCommentsScope;
  author: string;
  updateAuthor: (next: string) => void;
  selectedQuote: string;
  onCreated: (thread: RrcThread) => void;
  onThreadCreated: () => void;
  onCancel: () => void;
  onDraftStateChange: (active: boolean) => void;
}) {
  const { labels, api } = useReviewComments();
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
      const response = await api.createThread({
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
        console.error('[react-review-comments] Database error (new thread):', err);
      }
      setSubmitError(annotationSubmitErrorMessage(err, labels));
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
    <div id="rrc-draft-composer" className="rrc-composer">
      <p className="rrc-composer-quote">{quoteText}</p>
      <ComposerAuthorRow
        author={author}
        updateAuthor={updateAuthor}
        disabled={isSubmitting}
        onEditingChange={setAuthorEditActive}
      />
      <GdocsCommentField
        inputId="rrc-new-thread-input"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={labels.commentPlaceholder}
        isSubmitting={isSubmitting}
        canSubmit={canSubmit}
        onSubmitShortcut={handleCreateThread}
      />
      <div className="rrc-composer-actions">
        <button
          type="button"
          className="rrc-btn-ghost"
          onClick={handleCancel}
          disabled={isSubmitting}
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          className="rrc-btn-primary"
          onClick={() => handleCreateThread()}
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
