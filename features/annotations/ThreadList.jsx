'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  UserAvatar,
  formatCommentTime,
  CommentOverflowMenu,
  ExpandableCommentBody,
} from '@/features/annotations/AnnotationCommentUi';
import { ThreadReplyComposer } from '@/features/annotations/ThreadReplyComposer';

export function ThreadList({
  threads,
  locale,
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
}) {
  const t = useTranslations();
  const [replyByThread, setReplyByThread] = useState({});
  const [editingCommentId, setEditingCommentId] = useState('');
  const [editingDraft, setEditingDraft] = useState('');

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
      <p className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {threads.map((thread, idx) => (
        <div key={thread.id}>
          {draftComposer && draftInsertIndex === idx && draftComposer}
          <div
            id={`annotation-thread-${thread.id}`}
            className={`rounded-2xl p-3 shadow-sm transition-colors ${
              thread.status === 'resolved'
                ? activeThreadId === thread.id
                  ? 'bg-gray-100 shadow-md dark:bg-gray-800'
                  : 'bg-gray-100/90 hover:bg-gray-200/90 dark:bg-gray-800/80 dark:hover:bg-gray-700/80'
                : activeThreadId === thread.id
                  ? 'bg-background shadow-md dark:bg-card'
                  : 'bg-muted/40 hover:bg-muted/55 dark:bg-muted/20 dark:hover:bg-muted/30'
            }`}
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
                  <p className="line-clamp-2 text-xs italic text-muted-foreground">
                    &ldquo;{thread.quote_text}&rdquo;
                  </p>
                  {thread.status === 'resolved' && (
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('annotations.resolved')}
                    </p>
                  )}
                  <div className="mt-3 space-y-3">
                    {commentsToRender.map((comment, index) => {
                      const createdAt = comment.created_at || comment.createdAt;
                      const showThreadActions = index === 0;
                      const isEditing = editingCommentId === comment.id;
                      return (
                        <div
                          key={comment.id}
                          className={index > 0 ? 'border-t border-border/60 pt-3' : undefined}
                        >
                          <div className="flex gap-2">
                            <UserAvatar name={comment.created_by} size="md" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold leading-tight text-foreground">
                                    {comment.created_by}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {formatCommentTime(createdAt, locale, t)}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  {showThreadActions && (
                                    <button
                                      type="button"
                                      className="rounded-full p-1 text-primary hover:bg-primary/10"
                                      title={
                                        thread.status === 'resolved'
                                          ? t('annotations.reopen')
                                          : t('annotations.resolve')
                                      }
                                      aria-label={
                                        thread.status === 'resolved'
                                          ? t('annotations.reopen')
                                          : t('annotations.resolve')
                                      }
                                      onClick={() =>
                                        onToggleResolved(
                                          thread.id,
                                          thread.status === 'resolved' ? 'open' : 'resolved'
                                        )
                                      }
                                    >
                                      <Check className="h-5 w-5" strokeWidth={2.25} />
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
                                        : window.confirm(t('annotations.confirmDeleteComment'));
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
                                <div className="mt-1.5">
                                  <textarea
                                    className={`w-full rounded border px-2 py-1 text-sm leading-snug outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                                      thread.status === 'resolved' ? 'bg-transparent' : 'bg-background'
                                    }`}
                                    value={editingDraft}
                                    onChange={(event) => setEditingDraft(event.target.value)}
                                    rows={3}
                                    maxLength={3000}
                                  />
                                  <div className="mt-1.5 flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                                      onClick={() => {
                                        setEditingCommentId('');
                                        setEditingDraft('');
                                      }}
                                    >
                                      {t('annotations.cancel')}
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
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
                                      {t('annotations.saveName')}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <ExpandableCommentBody body={comment.body} />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!isActiveThread && thread.comments.length > 1 && (
                      <p className="mt-2 text-xs font-medium text-muted-foreground">
                        {t('annotations.hiddenCommentsCount', { count: thread.comments.length - 1 })}
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
      ))}
      {draftComposer && (draftInsertIndex == null || draftInsertIndex >= threads.length) && draftComposer}
    </div>
  );
}
