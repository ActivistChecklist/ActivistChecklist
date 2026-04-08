'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useReviewComments } from './context';
import {
  UserAvatar,
  formatCommentTime,
  CommentOverflowMenu,
  ExpandableCommentBody,
} from './AnnotationCommentUi';
import { ThreadReplyComposer } from './ThreadReplyComposer';
import type { RrcThread } from './types';
import { isCommentNewSinceSeen, isThreadUnread } from './seenThreads';

const RESOLVE_EXIT_MS = 260;

function threadCardClass(
  thread: RrcThread,
  activeThreadId: string,
  seenMap: Record<string, string>
): string {
  const parts = ['rrc-thread-card'];
  if (isThreadUnread(thread, seenMap)) {
    parts.push('rrc-thread-card--unread');
  }
  const isActive = activeThreadId === thread.id;
  if (thread.status === 'resolved') {
    parts.push('rrc-thread-card--resolved');
    parts.push(isActive ? 'rrc-thread-card--active' : 'rrc-thread-card--inactive');
  } else {
    parts.push(isActive ? 'rrc-thread-card--active' : 'rrc-thread-card--inactive');
  }
  return parts.join(' ');
}

export function ThreadList({
  threads,
  locale,
  seenMap,
  onReply,
  onToggleResolved,
  onEditComment,
  onDeleteComment,
  onDraftStateChange,
  emptyLabel,
  activeThreadId,
  draftComposer,
  draftInsertIndex,
  onThreadFocus,
  onReplyCancel,
}: {
  threads: RrcThread[];
  locale: string;
  seenMap: Record<string, string>;
  onReply: (args: {
    threadId: string;
    comment: string;
    clear: () => void;
  }) => Promise<void>;
  onToggleResolved: (threadId: string, status: string) => Promise<void>;
  onEditComment: (args: { threadId: string; commentId: string; body: string }) => Promise<void>;
  onDeleteComment: (args: { threadId: string; commentId: string }) => Promise<void>;
  onDraftStateChange: (active: boolean) => void;
  emptyLabel: string;
  activeThreadId: string;
  draftComposer?: ReactNode;
  draftInsertIndex: number | null;
  onThreadFocus?: (thread: RrcThread) => void;
  onReplyCancel?: () => void;
}) {
  const { labels } = useReviewComments();
  const [replyByThread, setReplyByThread] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState('');
  const [editingDraft, setEditingDraft] = useState('');
  const [resolvingThreadIds, setResolvingThreadIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const hasReplyDraft = Object.values(replyByThread).some((value) =>
      String(value || '').trim().length > 0
    );
    const hasEditDraft = Boolean(editingCommentId) && Boolean(String(editingDraft || '').trim());
    onDraftStateChange(hasReplyDraft || hasEditDraft);
    return () => onDraftStateChange(false);
  }, [replyByThread, editingCommentId, editingDraft, onDraftStateChange]);

  if (threads.length === 0 && !draftComposer) {
    return (
      <p className="rrc-empty-hint">
        {emptyLabel}
      </p>
    );
  }

  function markResolving(threadId: string, value: boolean) {
    setResolvingThreadIds((prev) => {
      if (value) {
        return { ...prev, [threadId]: true };
      }
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  }

  async function handleToggleResolved(thread: RrcThread) {
    const nextStatus = thread.status === 'resolved' ? 'open' : 'resolved';
    if (nextStatus === 'resolved') {
      markResolving(thread.id, true);
      await new Promise((resolve) => {
        window.setTimeout(resolve, RESOLVE_EXIT_MS);
      });
    }
    try {
      await onToggleResolved(thread.id, nextStatus);
    } finally {
      markResolving(thread.id, false);
    }
  }

  return (
    <div className="rrc-thread-list">
      {threads.map((thread, idx) => (
        <div key={thread.id}>
          {draftComposer && draftInsertIndex === idx && draftComposer}
          {(() => {
            const isResolving = Boolean(resolvingThreadIds[thread.id]);
            const cardClass = threadCardClass(thread, activeThreadId, seenMap);
            return (
              <div
                className={
                  isResolving
                    ? 'rrc-thread-card-grid rrc-thread-card-grid--collapsing'
                    : 'rrc-thread-card-grid'
                }
              >
                <div className="rrc-thread-card-grid-inner">
                  <div
                    id={`rrc-thread-${thread.id}`}
                    className={cardClass}
                    onClick={() => {
                      if (activeThreadId !== thread.id) {
                        onThreadFocus?.(thread);
                      }
                    }}
                  >
                {(() => {
                  const isActiveThread = activeThreadId === thread.id;
                  const commentsToRender = isActiveThread ? thread.comments : thread.comments.slice(0, 1);
                  return (
                    <>
                      <p className="rrc-quote">
                        &ldquo;{thread.quote_text}&rdquo;
                      </p>
                      {thread.status === 'resolved' && (
                        <p className="rrc-resolved-label">
                          {labels.resolved}
                        </p>
                      )}
                      <div className="rrc-comment-block">
                        {commentsToRender.map((comment, index) => {
                          const createdAt = comment.created_at || comment.createdAt;
                          const showThreadActions = index === 0;
                          const isEditing = editingCommentId === comment.id;
                          const isNewComment = isCommentNewSinceSeen(comment, thread, seenMap);
                          return (
                            <div
                              key={comment.id}
                              className={`rrc-comment-row${isNewComment ? ' rrc-comment-row--new' : ''}`}
                              data-new-comment={isNewComment ? 'true' : undefined}
                            >
                              <UserAvatar name={comment.created_by} size="md" />
                              <div className="rrc-comment-body">
                                <div className="rrc-comment-meta">
                                  <div className="rrc-comment-meta-text">
                                    <p className="rrc-comment-author">
                                      {comment.created_by}
                                    </p>
                                    <div className="rrc-comment-time-line">
                                      <p className="rrc-comment-time">
                                        {formatCommentTime(createdAt, locale, labels)}
                                      </p>
                                      {isNewComment && (
                                        <span className="rrc-new-comment-badge">{labels.newCommentBadge}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="rrc-thread-actions">
                                    {showThreadActions && (
                                      <button
                                        type="button"
                                        className="rrc-round-btn"
                                        title={
                                          thread.status === 'resolved'
                                            ? labels.reopen
                                            : labels.resolve
                                        }
                                        aria-label={
                                          thread.status === 'resolved'
                                            ? labels.reopen
                                            : labels.resolve
                                        }
                                        onClick={() => handleToggleResolved(thread)}
                                      >
                                        <Check size={20} strokeWidth={2.25} />
                                      </button>
                                    )}
                                    <CommentOverflowMenu
                                      onEdit={() => {
                                        setEditingCommentId(comment.id);
                                        setEditingDraft(comment.body || '');
                                        onThreadFocus?.(thread);
                                      }}
                                      onDelete={async () => {
                                        const confirmed = typeof window === 'undefined'
                                          ? true
                                          : window.confirm(labels.confirmDeleteComment);
                                        if (!confirmed) {
                                          return;
                                        }
                                        await onDeleteComment({
                                          threadId: thread.id,
                                          commentId: comment.id,
                                        });
                                      }}
                                    />
                                  </div>
                                </div>
                                {isEditing ? (
                                  <div className="rrc-edit-block">
                                    <textarea
                                      className={`rrc-textarea rrc-textarea--edit ${
                                        thread.status === 'resolved' ? 'rrc-textarea--plain' : ''
                                      }`}
                                      value={editingDraft}
                                      onChange={(event) => setEditingDraft(event.target.value)}
                                      rows={3}
                                      maxLength={3000}
                                    />
                                    <div className="rrc-row-actions">
                                      <button
                                        type="button"
                                        className="rrc-btn-ghost"
                                        onClick={() => {
                                          setEditingCommentId('');
                                          setEditingDraft('');
                                        }}
                                      >
                                        {labels.cancel}
                                      </button>
                                      <button
                                        type="button"
                                        className="rrc-btn-primary"
                                        disabled={!editingDraft.trim()}
                                        onClick={async () => {
                                          await onEditComment({
                                            threadId: thread.id,
                                            commentId: comment.id,
                                            body: editingDraft.trim(),
                                          });
                                          setEditingCommentId('');
                                          setEditingDraft('');
                                        }}
                                      >
                                        {labels.saveName}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <ExpandableCommentBody body={comment.body} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {!isActiveThread && thread.comments.length > 1 && (
                          <p className="rrc-hidden-replies">
                            {labels.hiddenCommentsCount({ count: thread.comments.length - 1 })}
                          </p>
                        )}
                        {isActiveThread && (
                          <ThreadReplyComposer
                            threadId={thread.id}
                            value={replyByThread[thread.id] || ''}
                            onChange={(next) =>
                              setReplyByThread((prev) => ({ ...prev, [thread.id]: next }))
                            }
                            onReply={onReply}
                            onCancel={onReplyCancel}
                            plainShell={thread.status === 'resolved'}
                          />
                        )}
                      </div>
                    </>
                  );
                })()}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ))}
      {draftComposer && (draftInsertIndex == null || draftInsertIndex >= threads.length) && draftComposer}
    </div>
  );
}
