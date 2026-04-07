'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Check, MoreVertical, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

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

export function UserAvatar({ name, size = 'sm' }) {
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

export function formatCommentTime(isoString, locale, t) {
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

export function ComposerAuthorRow({ author, updateAuthor, disabled, onEditingChange }) {
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
}) {
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function handleKeyDown(event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!isSubmitting && canSubmit && typeof onSubmitShortcut === 'function') {
        onSubmitShortcut();
      }
    }
  }

  const shellBg = plainShell ? 'bg-transparent' : 'bg-background';
  const shellClass = compact
    ? `rounded-[1.35rem] border-2 border-primary ${shellBg} focus-within:ring-2 focus-within:ring-primary/20`
    : `rounded-[1.35rem] border-2 border-primary ${shellBg} shadow-sm focus-within:ring-2 focus-within:ring-primary/20`;

  const textareaClass = compact
    ? 'block max-h-32 min-h-[1lh] w-full resize-none overflow-hidden border-0 bg-transparent px-3 py-1 text-sm leading-snug outline-none placeholder:text-muted-foreground'
    : 'block max-h-32 min-h-[1lh] w-full resize-none overflow-hidden border-0 bg-transparent px-3 py-1 text-sm leading-snug outline-none placeholder:text-muted-foreground';

  return (
    <div className={shellClass}>
      <textarea
        ref={textareaRef}
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

export function ExpandableCommentBody({ body }) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);
  const text = String(body || '');
  const maxLen = 280;
  const isLong = text.length > maxLen;
  const visibleText = isLong && !expanded ? `${text.slice(0, maxLen)}...` : text;

  return (
    <div className="mt-1.5">
      <p className="text-sm leading-snug text-foreground whitespace-pre-wrap">{visibleText}</p>
      {isLong && (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-primary hover:underline"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? t('annotations.showLess') : t('annotations.showMore')}
        </button>
      )}
    </div>
  );
}

export function CommentOverflowMenu({ onEdit, onDelete }) {
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
