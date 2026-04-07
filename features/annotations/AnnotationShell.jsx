'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Annotorious } from '@annotorious/react';
import { TextAnnotator } from '@recogito/react-text-annotator';
import { Check, ChevronsRight, MoreVertical, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  createComment,
  createThread,
  deleteComment,
  fetchOverview,
  fetchThreads,
  patchComment,
  patchThreadStatus,
} from '@/features/annotations/api';

function isAnnotationDbError(err) {
  return err?.status === 503 || String(err?.message || '').includes('database');
}

function annotationSubmitErrorMessage(err, t) {
  if (isAnnotationDbError(err)) {
    return t('annotations.dbUnavailable');
  }
  return t('annotations.submitFailed');
}

const SESSION_AUTHOR_KEY = 'ac.annotations.author';
const SEEN_THREADS_KEY_PREFIX = 'ac.annotations.seen.';

function generateAnonymousName() {
  const adjectives = ['Calm', 'Bright', 'Steady', 'Quiet', 'Bold', 'Kind', 'Swift', 'Clear'];
  const nouns = ['Pine', 'River', 'Signal', 'Sparrow', 'Maple', 'Harbor', 'Falcon', 'Comet'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}${noun}`;
}

function useSessionAuthor() {
  const [author, setAuthor] = useState('Anonymous');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const existing = window.sessionStorage.getItem(SESSION_AUTHOR_KEY);
    if (existing) {
      setAuthor(existing);
      return;
    }
    const generated = generateAnonymousName();
    window.sessionStorage.setItem(SESSION_AUTHOR_KEY, generated);
    setAuthor(generated);
  }, []);

  const updateAuthor = (nextAuthor) => {
    const safeAuthor = (nextAuthor || '').trim().slice(0, 80) || generateAnonymousName();
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_AUTHOR_KEY, safeAuthor);
    }
    setAuthor(safeAuthor);
  };

  return { author, updateAuthor };
}

function getSeenStorageKey(scope) {
  return `${SEEN_THREADS_KEY_PREFIX}${scope.scopeKey || 'unknown'}`;
}

function loadSeenThreadMap(scope) {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(getSeenStorageKey(scope));
    return raw ? JSON.parse(raw) : {};
  } catch (_err) {
    return {};
  }
}

function saveSeenThreadMap(scope, map) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(getSeenStorageKey(scope), JSON.stringify(map));
}

function withLocalePath(locale, sitePath) {
  const normalized = sitePath.startsWith('/') ? sitePath : `/${sitePath}`;
  return `/${locale}${normalized}`;
}

function clearThreadHighlights(root) {
  if (!root) {
    return;
  }
  const highlights = root.querySelectorAll('span[data-annotation-thread-id]');
  highlights.forEach((node) => {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(document.createTextNode(node.textContent || ''), node);
    parent.normalize();
  });
}

function setActiveHighlightInRoot(root, activeThreadId) {
  if (!root) {
    return;
  }
  const highlights = root.querySelectorAll('span[data-annotation-thread-id]');
  highlights.forEach((node) => {
    const isActive = node.dataset.annotationThreadId === activeThreadId;
    node.dataset.annotationActive = isActive ? 'true' : 'false';
    node.style.backgroundColor = isActive ? 'rgba(245, 158, 11, 0.62)' : 'rgba(251, 191, 36, 0.35)';
  });
}

function applyThreadHighlights(root, threads, onThreadClick) {
  if (!root) {
    return {};
  }

  clearThreadHighlights(root);
  const orderByThreadId = {};
  const sortedThreads = [...threads].sort(
    (a, b) => String(b.quote_text || '').length - String(a.quote_text || '').length
  );

  for (const thread of sortedThreads) {
    const quote = String(thread.quote_text || '').trim();
    if (!quote) {
      continue;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const value = String(node.nodeValue || '');
        if (!value.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        const parentTag = node.parentElement?.tagName;
        if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'NOSCRIPT') {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.parentElement?.closest('[data-annotation-thread-id]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let traversedChars = 0;
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const text = String(textNode.nodeValue || '');
      const idx = text.indexOf(quote);
      if (idx < 0) {
        traversedChars += text.length;
        continue;
      }
      orderByThreadId[thread.id] = traversedChars + idx;

      const before = text.slice(0, idx);
      const match = text.slice(idx, idx + quote.length);
      const after = text.slice(idx + quote.length);
      const highlight = document.createElement('span');
      highlight.textContent = match;
      highlight.dataset.annotationThreadId = thread.id;
      highlight.style.backgroundColor = 'rgba(251, 191, 36, 0.35)';
      highlight.style.borderRadius = '2px';
      highlight.style.cursor = 'pointer';
      highlight.style.transition = 'background-color 120ms ease';
      highlight.style.boxDecorationBreak = 'clone';
      highlight.style.webkitBoxDecorationBreak = 'clone';
      highlight.dataset.annotationActive = 'false';
      highlight.title = 'Open comment';
      highlight.addEventListener('mouseenter', () => {
        const isActive = highlight.dataset.annotationActive === 'true';
        highlight.style.backgroundColor = isActive ? 'rgba(245, 158, 11, 0.72)' : 'rgba(245, 158, 11, 0.5)';
      });
      highlight.addEventListener('mouseleave', () => {
        const isActive = highlight.dataset.annotationActive === 'true';
        highlight.style.backgroundColor = isActive ? 'rgba(245, 158, 11, 0.62)' : 'rgba(251, 191, 36, 0.35)';
      });
      highlight.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onThreadClick(thread);
      });

      const fragment = document.createDocumentFragment();
      if (before) {
        fragment.appendChild(document.createTextNode(before));
      }
      fragment.appendChild(highlight);
      if (after) {
        fragment.appendChild(document.createTextNode(after));
      }
      textNode.parentNode?.replaceChild(fragment, textNode);
      break;
    }
  }
  return orderByThreadId;
}

function getAvatarColorClass(name) {
  const palette = [
    'bg-blue-500/80',
    'bg-violet-500/80',
    'bg-emerald-500/80',
    'bg-rose-500/80',
    'bg-amber-500/80',
    'bg-cyan-500/80',
    'bg-indigo-500/80',
    'bg-fuchsia-500/80',
    'bg-teal-500/80',
    'bg-orange-500/80',
    'bg-lime-500/80',
    'bg-sky-500/80',
    'bg-red-500/80',
    'bg-green-600/80',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function UserAvatar({ name, size = 'sm' }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const sizeClass =
    size === 'md'
      ? 'h-8 w-8 text-xs'
      : 'h-6 w-6 text-[11px]';
  return (
    <span
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${sizeClass} ${getAvatarColorClass(name || '')}`}
    >
      {initial}
    </span>
  );
}

function formatCommentTime(isoString, locale, t) {
  if (!isoString) {
    return '';
  }
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat(locale || undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  const sameDay = d.toDateString() === now.toDateString();
  const dateLabel = sameDay
    ? t('annotations.today')
    : new Intl.DateTimeFormat(locale || undefined, { month: 'short', day: 'numeric' }).format(d);
  return t('annotations.commentTime', { time: timeStr, dateLabel });
}

function ComposerAuthorRow({ author, updateAuthor, disabled, onEditingChange }) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(author);

  useEffect(() => {
    setDraft(author);
  }, [author]);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  function startEdit() {
    if (disabled) {
      return;
    }
    setDraft(author);
    setEditing(true);
  }

  function save() {
    updateAuthor(draft);
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(author);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mb-3 flex min-w-0 items-center gap-1">
        <input
          className="min-w-0 flex-1 rounded border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={80}
          placeholder={t('annotations.authorPlaceholder')}
          autoComplete="off"
          autoFocus
          disabled={disabled}
        />
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
          aria-label={t('annotations.saveName')}
          onClick={save}
          disabled={disabled}
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background hover:bg-muted"
          aria-label={t('annotations.cancel')}
          onClick={cancelEdit}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <button
        type="button"
        className="flex min-w-0 max-w-full items-center gap-2 rounded-md py-0.5 text-left hover:bg-muted/60"
        onClick={startEdit}
        disabled={disabled}
      >
        <UserAvatar name={author} size="md" />
        <span className="truncate text-sm font-medium text-foreground">{author}</span>
      </button>
    </div>
  );
}

function GdocsCommentField({
  value,
  onChange,
  placeholder,
  isSubmitting,
  inputId,
  canSubmit,
  onSubmitShortcut,
  compact = false,
}) {
  function handleKeyDown(event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!isSubmitting && canSubmit && typeof onSubmitShortcut === 'function') {
        onSubmitShortcut();
      }
    }
  }

  const shellClass = compact
    ? 'rounded-[1.35rem] border-2 border-primary bg-background px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/20'
    : 'rounded-[1.35rem] border-2 border-primary bg-background px-3 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-primary/20';

  const textareaClass = compact
    ? 'max-h-32 min-h-[1.5rem] w-full resize-y border-0 bg-transparent py-0.5 text-sm leading-snug outline-none placeholder:text-muted-foreground [field-sizing:content]'
    : 'max-h-32 min-h-[1.5rem] w-full resize-y border-0 bg-transparent py-0.5 text-sm leading-snug outline-none placeholder:text-muted-foreground';

  return (
    <div className={shellClass}>
      <textarea
        id={inputId}
        className={textareaClass}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        rows={1}
        maxLength={3000}
        disabled={isSubmitting}
      />
    </div>
  );
}

function CommentOverflowMenu({ onEdit, onDelete }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleDown(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="rounded-full p-1 text-primary hover:bg-primary/10"
        aria-label={t('annotations.moreActions')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-lg border bg-popover py-1 text-sm shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left hover:bg-muted"
            onClick={() => {
              onEdit();
              setOpen(false);
            }}
          >
            {t('annotations.editComment')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-destructive hover:bg-muted"
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
          >
            {t('annotations.deleteComment')}
          </button>
        </div>
      )}
    </div>
  );
}

function SelectionComposer({
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
    <div className="mt-3 rounded-2xl border border-border/70 bg-card p-3 shadow-md">
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

function ThreadReplyComposer({ threadId, value, onChange, onReply }) {
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
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
          onClick={() => onChange('')}
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

function ThreadList({
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
              activeThreadId === thread.id
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
                                    className="w-full rounded border bg-background px-2 py-1 text-sm leading-snug outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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
                                <p className="mt-1.5 text-sm leading-snug text-foreground">{comment.body}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                    />
                  )}
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

export default function AnnotationShell({ enabled, path, locale, scope, children }) {
  const t = useTranslations();
  const contentRef = useRef(null);
  const panelRef = useRef(null);
  const [threads, setThreads] = useState([]);
  const [overview, setOverview] = useState([]);
  const [seenMap, setSeenMap] = useState({});
  const [selectedQuote, setSelectedQuote] = useState('');
  const [manualExpanded, setManualExpanded] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [selectionDraftActive, setSelectionDraftActive] = useState(false);
  const [replyDraftActive, setReplyDraftActive] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [threadOrderById, setThreadOrderById] = useState({});
  const [selectedQuoteOrder, setSelectedQuoteOrder] = useState(null);
  const { author, updateAuthor } = useSessionAuthor();

  useEffect(() => {
    setSeenMap(loadSeenThreadMap(scope));
  }, [scope]);

  useEffect(() => {
    if (!enabled || !path || !locale) {
      return;
    }
    let cancelled = false;
    fetchThreads({ path, locale, scope })
      .then((response) => {
        if (!cancelled) {
          setThreads(response.threads || []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, path, locale, scope]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    fetchOverview()
      .then((response) => {
        if (!cancelled) {
          setOverview(response.documents || []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, path, locale, scope, threads.length]);

  useEffect(() => {
    if (!enabled || threads.length === 0) {
      return;
    }
    const nextSeenMap = { ...seenMap };
    let changed = false;
    for (const thread of threads) {
      if (nextSeenMap[thread.id] !== thread.updated_at) {
        nextSeenMap[thread.id] = thread.updated_at;
        changed = true;
      }
    }
    if (changed) {
      setSeenMap(nextSeenMap);
      saveSeenThreadMap(scope, nextSeenMap);
    }
  }, [enabled, threads, scope, seenMap]);

  const documentsWithComments = useMemo(
    () => overview.filter((doc) => doc.threadCount > 0),
    [overview]
  );

  const unreadByDocumentId = useMemo(() => {
    const output = {};
    for (const doc of documentsWithComments) {
      output[doc.documentId] = doc.threads.reduce((count, thread) => {
        const seenUpdatedAt = seenMap[thread.id];
        if (!seenUpdatedAt || seenUpdatedAt !== thread.updatedAt) {
          return count + 1;
        }
        return count;
      }, 0);
    }
    return output;
  }, [documentsWithComments, seenMap]);

  const unreadTotal = useMemo(
    () => Object.values(unreadByDocumentId).reduce((sum, count) => sum + count, 0),
    [unreadByDocumentId]
  );

  const totalThreads = useMemo(
    () => documentsWithComments.reduce((sum, doc) => sum + doc.threadCount, 0),
    [documentsWithComments]
  );

  const resolvedCount = useMemo(
    () => threads.filter((thread) => thread.status === 'resolved').length,
    [threads]
  );

  const visibleThreads = useMemo(() => {
    const filtered = threads.filter((thread) =>
      showResolved ? thread.status === 'resolved' : thread.status !== 'resolved'
    );
    return filtered.sort((a, b) => {
      const aPos = threadOrderById[a.id];
      const bPos = threadOrderById[b.id];
      const aHasPos = Number.isFinite(aPos);
      const bHasPos = Number.isFinite(bPos);
      if (aHasPos && bHasPos) {
        return aPos - bPos;
      }
      if (aHasPos) {
        return -1;
      }
      if (bHasPos) {
        return 1;
      }
      const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
      const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
      return aTime - bTime;
    });
  }, [threads, showResolved, threadOrderById]);

  const currentDocIndex = useMemo(
    () => documentsWithComments.findIndex((doc) => doc.sitePath === path && doc.locale === locale),
    [documentsWithComments, path, locale]
  );

  const nextDoc = useMemo(() => {
    if (documentsWithComments.length === 0) {
      return null;
    }
    const baseIndex = currentDocIndex >= 0 ? currentDocIndex : 0;
    const nextIndex = (baseIndex + 1) % documentsWithComments.length;
    return documentsWithComments[nextIndex];
  }, [documentsWithComments, currentDocIndex]);

  const isInteracting = selectionDraftActive || replyDraftActive;
  const isPanelExpanded = manualExpanded;

  useEffect(() => {
    if (isInteracting || selectedQuote) {
      setManualExpanded(true);
    }
  }, [isInteracting, selectedQuote]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = contentRef.current;
    const nextOrderById = applyThreadHighlights(root, threads, (thread) => {
      setSelectedQuote('');
      setShowResolved(thread.status === 'resolved');
      setActiveThreadId(thread.id);
      setManualExpanded(true);
    });
    setThreadOrderById(nextOrderById);
    setActiveHighlightInRoot(root, activeThreadId);
    return () => clearThreadHighlights(root);
  }, [enabled, threads, activeThreadId]);

  useEffect(() => {
    setActiveHighlightInRoot(contentRef.current, activeThreadId);
  }, [activeThreadId]);

  useEffect(() => {
    const quote = String(selectedQuote || '').trim();
    const root = contentRef.current;
    if (!quote || !root) {
      setSelectedQuoteOrder(null);
      return;
    }
    const fullText = root.textContent || '';
    const idx = fullText.indexOf(quote);
    setSelectedQuoteOrder(idx >= 0 ? idx : null);
    if (idx >= 0) {
      setShowResolved(false);
    }
  }, [selectedQuote, threads.length]);

  useEffect(() => {
    if (!activeThreadId || !isPanelExpanded) {
      return;
    }
    const target = document.getElementById(`annotation-thread-${activeThreadId}`);
    if (target) {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeThreadId, isPanelExpanded, showResolved, visibleThreads.length]);

  useEffect(() => {
    function handleClickAway(event) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (panelRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest('[data-annotation-thread-id]')) {
        return;
      }
      setActiveThreadId('');
    }
    document.addEventListener('mousedown', handleClickAway);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
    };
  }, []);

  if (!enabled) {
    return children;
  }

  function handleCollapsePanel() {
    setManualExpanded(false);
    setSelectedQuote('');
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }

  function containsNode(root, node) {
    if (!root || !node) {
      return false;
    }
    return root === node || root.contains(node);
  }

  function handleMouseUp() {
    if (typeof window === 'undefined') {
      return;
    }
    const selection = window.getSelection();
    const text = selection?.toString()?.trim() || '';
    if (!text) {
      setSelectedQuote('');
      setActiveThreadId('');
      return;
    }
    const root = contentRef.current;
    const anchorInside = containsNode(root, selection?.anchorNode);
    const focusInside = containsNode(root, selection?.focusNode);
    if (!anchorInside || !focusInside) {
      return;
    }
    setSelectedQuote(text.slice(0, 1200));
    setShowResolved(false);
  }

  const draftInsertIndex = useMemo(() => {
    if (!selectedQuote || showResolved) {
      return null;
    }
    if (!Number.isFinite(selectedQuoteOrder)) {
      return 0;
    }
    for (let i = 0; i < visibleThreads.length; i += 1) {
      const pos = threadOrderById[visibleThreads[i].id];
      if (Number.isFinite(pos) && pos > selectedQuoteOrder) {
        return i;
      }
    }
    return visibleThreads.length;
  }, [selectedQuote, showResolved, selectedQuoteOrder, visibleThreads, threadOrderById]);

  return (
    <Annotorious>
      <TextAnnotator>
        <div ref={contentRef} data-annotations-enabled="true" onMouseUp={handleMouseUp}>
          {children}
        </div>
        <aside
          ref={panelRef}
          className="fixed right-4 top-24 z-70"
        >
          {!isPanelExpanded && (
            <button
              type="button"
              className={`rounded-full border px-3 py-2 text-xs shadow-lg ${
                unreadTotal > 0
                  ? 'border-amber-500 bg-amber-100 text-amber-900'
                  : 'border-primary/30 bg-background text-foreground'
              }`}
              onClick={() => setManualExpanded(true)}
            >
              {unreadTotal > 0
                ? t('annotations.collapsedUnreadBadge', { unread: unreadTotal, total: totalThreads })
                : t('annotations.collapsedBadge', { count: totalThreads })}
            </button>
          )}

          {isPanelExpanded && (
            <div className="w-[min(19rem,calc(100vw-2rem))] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur supports-backdrop-filter:bg-background/85">
        <div className="text-[11px]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-tight text-foreground">
                {t('annotations.prOverviewTitle')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('annotations.threadCount', { count: totalThreads })}
                {unreadTotal > 0 && (
                  <span>
                    {' '}
                    · {t('annotations.unreadBadge', { count: unreadTotal })}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              aria-label={t('annotations.collapse')}
              title={t('annotations.collapse')}
              className="-m-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              onClick={handleCollapsePanel}
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>

          {documentsWithComments.length > 1 && (
            <div className="mt-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('annotations.panelSectionNavigate')}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground">
                <span className="text-muted-foreground">
                  {t('annotations.progressLabel', {
                    current: Math.max(1, currentDocIndex + 1),
                    total: documentsWithComments.length,
                  })}
                </span>
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    if (nextDoc) {
                      window.location.href = withLocalePath(nextDoc.locale, nextDoc.sitePath);
                    }
                  }}
                >
                  {t('annotations.nextPage')}
                </button>
                {resolvedCount > 0 && (
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => setShowResolved((prev) => !prev)}
                  >
                    {showResolved
                      ? t('annotations.hideResolvedToggle')
                      : t('annotations.viewResolvedToggle', { count: resolvedCount })}
                  </button>
                )}
              </div>
            </div>
          )}

          {documentsWithComments.length <= 1 && resolvedCount > 0 && (
            <div className="mt-4">
              <button
                type="button"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => setShowResolved((prev) => !prev)}
              >
                {showResolved
                  ? t('annotations.hideResolvedToggle')
                  : t('annotations.viewResolvedToggle', { count: resolvedCount })}
              </button>
            </div>
          )}

          {documentsWithComments.length > 1 && (
            <div className="mt-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('annotations.panelSectionPages')}
              </p>
              <ul className="mt-1.5 space-y-1">
                {documentsWithComments.map((doc) => (
                  <li key={doc.documentId}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs text-foreground hover:bg-muted/50"
                      onClick={() => {
                        window.location.href = withLocalePath(doc.locale, doc.sitePath);
                      }}
                    >
                      <span className="min-w-0 truncate">{withLocalePath(doc.locale, doc.sitePath)}</span>
                      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        <span>{doc.threadCount}</span>
                        {unreadByDocumentId[doc.documentId] > 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">
                            {unreadByDocumentId[doc.documentId]}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {totalThreads === 0 && threads.length === 0 && !selectedQuote && (
          <p className="mt-3 rounded-md bg-muted/25 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
            {t('annotations.emptyPanelHint')}
          </p>
        )}
        <ThreadList
          threads={visibleThreads}
          locale={locale}
          activeThreadId={activeThreadId}
          onThreadFocus={(thread) => {
            setSelectedQuote('');
            setActiveThreadId(thread.id);
          }}
          onReply={async ({ threadId, comment, clear }) => {
            const response = await createComment({ threadId, comment, createdBy: author, scope });
            clear();
            setThreads((prev) =>
              prev.map((thread) =>
                thread.id === threadId
                  ? { ...thread, comments: [...thread.comments, response.comment] }
                  : thread
              )
            );
          }}
          onEditComment={async ({ threadId, commentId, body }) => {
            const response = await patchComment(commentId, body);
            setThreads((prev) =>
              prev.map((thread) =>
                thread.id === threadId
                  ? {
                    ...thread,
                    comments: thread.comments.map((comment) =>
                      comment.id === commentId ? response.comment : comment
                    ),
                  }
                  : thread
              )
            );
          }}
          onDeleteComment={async ({ threadId, commentId }) => {
            await deleteComment(commentId);
            setThreads((prev) =>
              prev.map((thread) =>
                thread.id === threadId
                  ? {
                    ...thread,
                    comments: thread.comments.filter((comment) => comment.id !== commentId),
                  }
                  : thread
              ).filter((thread) => thread.comments.length > 0)
            );
          }}
          onToggleResolved={async (threadId, status) => {
            await patchThreadStatus(threadId, status, scope);
            setThreads((prev) =>
              prev.map((thread) => (thread.id === threadId ? { ...thread, status } : thread))
            );
          }}
          onDraftStateChange={setReplyDraftActive}
          emptyLabel={showResolved ? t('annotations.noResolvedThreads') : t('annotations.noOpenThreads')}
          draftInsertIndex={draftInsertIndex}
          draftComposer={
            !showResolved && selectedQuote ? (
              <SelectionComposer
                path={path}
                locale={locale}
                scope={scope}
                author={author}
                updateAuthor={updateAuthor}
                selectedQuote={selectedQuote}
                onCancel={() => {
                  setSelectedQuote('');
                  if (typeof window !== 'undefined') {
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                  }
                }}
                onThreadCreated={() => {
                  setSelectedQuote('');
                  if (typeof window !== 'undefined') {
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                  }
                }}
                onCreated={(thread) => setThreads((prev) => [...prev, thread])}
                onDraftStateChange={setSelectionDraftActive}
              />
            ) : null
          }
        />
            </div>
          )}
        </aside>
      </TextAnnotator>
    </Annotorious>
  );
}
