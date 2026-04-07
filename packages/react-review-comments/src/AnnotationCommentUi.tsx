'use client';

import { useState, useEffect, useRef, useLayoutEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import { Check, MoreVertical, X } from 'lucide-react';
import { useReviewComments } from './context';
import type { ReviewCommentsLabels } from './types';

function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < (name || '').length; i += 1) {
    h = ((h << 5) - h) + (name || '').charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 360;
}

export function UserAvatar({ name, size = 'sm' }: { name?: string; size?: 'sm' | 'md' }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const dim = size === 'md' ? 32 : 24;
  const fontSize = size === 'md' ? 12 : 11;
  return (
    <span
      title={name}
      className="rrc-avatar"
      style={{
        width: dim,
        height: dim,
        fontSize,
        background: `hsl(${avatarHue(name || '')} 65% 42%)`,
      }}
    >
      {initial}
    </span>
  );
}

export function formatCommentTime(
  isoString: string | undefined,
  locale: string | undefined,
  labels: ReviewCommentsLabels
): string {
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
    ? labels.today
    : new Intl.DateTimeFormat(locale || undefined, { month: 'short', day: 'numeric' }).format(d);
  return labels.commentTime({ time: timeStr, dateLabel });
}

export function ComposerAuthorRow({
  author,
  updateAuthor,
  disabled,
  onEditingChange,
}: {
  author: string;
  updateAuthor: (next: string) => void;
  disabled?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const { labels } = useReviewComments();
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
      <div className="rrc-author-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={80}
          placeholder={labels.authorPlaceholder}
          autoComplete="off"
          autoFocus
          disabled={disabled}
        />
        <button
          type="button"
          className="rrc-round-btn"
          aria-label={labels.saveName}
          onClick={save}
          disabled={disabled}
        >
          <Check size={16} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="rrc-round-btn"
          aria-label={labels.cancel}
          onClick={cancelEdit}
          disabled={disabled}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="rrc-author-row" style={{ marginBottom: '0.75rem' }}>
      <button
        type="button"
        style={{
          display: 'flex',
          minWidth: 0,
          maxWidth: '100%',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.125rem 0',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        onClick={startEdit}
        disabled={disabled}
      >
        <UserAvatar name={author} size="md" />
        <span className="rrc-truncate" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
          {author}
        </span>
      </button>
    </div>
  );
}

export function GdocsCommentField({
  value,
  onChange,
  placeholder,
  isSubmitting,
  inputId,
  canSubmit,
  onSubmitShortcut,
  compact = false,
  plainShell = false,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  isSubmitting: boolean;
  inputId: string;
  canSubmit: boolean;
  onSubmitShortcut?: () => void;
  compact?: boolean;
  plainShell?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!isSubmitting && canSubmit && typeof onSubmitShortcut === 'function') {
        onSubmitShortcut();
      }
    }
  }

  const border = '2px solid var(--rrc-primary)';
  const bg = plainShell ? 'transparent' : 'var(--rrc-surface)';

  return (
    <div
      style={{
        borderRadius: '1.35rem',
        border,
        background: bg,
        boxShadow: compact ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <textarea
        ref={textareaRef}
        id={inputId}
        className="rrc-textarea"
        style={{
          display: 'block',
          maxHeight: '8rem',
          minHeight: '1.5rem',
          width: '100%',
          resize: 'none',
          overflow: 'hidden',
          border: 'none',
          background: 'transparent',
          padding: '0.25rem 0.75rem',
          fontSize: '0.875rem',
          lineHeight: 1.4,
        }}
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

export function ExpandableCommentBody({ body }: { body?: string }) {
  const { labels } = useReviewComments();
  const [expanded, setExpanded] = useState(false);
  const text = String(body || '');
  const maxLen = 280;
  const isLong = text.length > maxLen;
  const visibleText = isLong && !expanded ? `${text.slice(0, maxLen)}...` : text;

  return (
    <div style={{ marginTop: '0.375rem' }}>
      <p className="rrc-expand-body">{visibleText}</p>
      {isLong && (
        <button
          type="button"
          className="rrc-expand-toggle"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? labels.showLess : labels.showMore}
        </button>
      )}
    </div>
  );
}

export function CommentOverflowMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
}) {
  const { labels } = useReviewComments();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [open]);

  return (
    <div className="rrc-menu-wrap" ref={ref}>
      <button
        type="button"
        className="rrc-menu-btn"
        aria-label={labels.moreActions}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div role="menu" className="rrc-menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onEdit();
              setOpen(false);
            }}
          >
            {labels.editComment}
          </button>
          <button
            type="button"
            role="menuitem"
            style={{ color: '#b91c1c' }}
            onClick={() => {
              void onDelete();
              setOpen(false);
            }}
          >
            {labels.deleteComment}
          </button>
        </div>
      )}
    </div>
  );
}
