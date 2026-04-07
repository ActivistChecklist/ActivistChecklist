'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  UserAvatar,
  formatCommentTime,
  CommentOverflowMenu,
  ExpandableCommentBody,
} from '@/features/annotations/AnnotationCommentUi';
import { ThreadReplyComposer } from '@/features/annotations/ThreadReplyComposer';

const RESOLVE_EXIT_MS = 260;

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
  const [resolvingThreadIds, setResolvingThreadIds] = useState({});
  const threadContainerRefs = useRef(new Map());
  const prevThreadTopByIdRef = useRef(new Map());

  useEffect(() => {
    const hasReplyDraft = Object.values(replyByThread).some((value) =>
      String(value || '').trim().length > 0
    );
    const hasEditDraft = Boolean(editingCommentId) && Boolean(String(editingDraft || '').trim());
    onDraftStateChange(hasReplyDraft || hasEditDraft);
    return () => onDraftStateChange(false);
  }, [replyByThread, editingCommentId, editingDraft, onDraftStateChange]);

  useLayoutEffect(() => {
    const nextThreadTopById = new Map();
    threadContainerRefs.current.forEach((el, id) => {
      if (!el || !el.isConnected) {
        return;
      }
      nextThreadTopById.set(id, el.getBoundingClientRect().top);
    });

    const prevThreadTopById = prevThreadTopByIdRef.current;
    nextThreadTopById.forEach((nextTop, id) => {
      if (!prevThreadTopById.has(id)) {
        return;
      }
      const el = threadContainerRefs.current.get(id);
      if (!el) {
        return;
      }
      const deltaY = prevThreadTopById.get(id) - nextTop;
      if (Math.abs(deltaY) < 1) {
        return;
      }
      el.style.transition = 'none';
      el.style.transform = `translateY(${deltaY}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 280ms ease';
        el.style.transform = 'translateY(0)';
      });
    });

    prevThreadTopByIdRef.current = nextThreadTopById;
  }, [threads, draftInsertIndex, draftComposer]);

  if (threads.length === 0 && !draftComposer) {
    return (
      <p className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  function markResolving(threadId, value) {
    setResolvingThreadIds((prev) => {
      if (value) {
        return { ...prev, [threadId]: true };
      }
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  }

  async function handleToggleResolved(thread) {
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
    <div className="mt-3 space-y-3">
      {threads.map((thread, idx) => (
        <div
          key={thread.id}
          ref={(node) => {
            if (node) {
              threadContainerRefs.current.set(thread.id, node);
            } else {
              threadContainerRefs.current.delete(thread.id);
            }
          }}
        >
          {draftComposer && draftInsertIndex === idx && draftComposer}
          {(() => {
            const isResolving = Boolean(resolvingThreadIds[thread.id]);
            const baseThreadClass = `rounded-2xl p-3 shadow-sm transition-all duration-300 ease-out motion-reduce:transition-none ${
              thread.status === 'resolved'
                ? activeThreadId === thread.id
                  ? 'bg-gray-100 shadow-md dark:bg-gray-800'
                  : 'bg-gray-100/90 hover:bg-gray-200/90 dark:bg-gray-800/80 dark:hover:bg-gray-700/80'
                : activeThreadId === thread.id
                  ? 'bg-background shadow-md dark:bg-card'
                  : 'bg-muted/40 hover:bg-muted/55 dark:bg-muted/20 dark:hover:bg-muted/30'
            }`;
            const resolvingClass = isResolving
              ? 'pointer-events-none opacity-0 -translate-x-2 scale-[0.98]'
              : 'opacity-100 translate-x-0 scale-100';
            return (
          <div
            id={`annotation-thread-${thread.id}`}
            className={`${baseThreadClass} ${resolvingClass}`}
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
                                      onClick={() => handleToggleResolved(thread)}
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
            );
          })()}
        </div>
      ))}
      {draftComposer && (draftInsertIndex == null || draftInsertIndex >= threads.length) && draftComposer}
    </div>
  );
}
