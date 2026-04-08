'use client';

import {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { Annotorious } from '@annotorious/react';
import { TextAnnotator } from '@recogito/react-text-annotator';
import { useReviewComments } from './context';
import { ReviewCommentsPanel } from './ReviewCommentsPanel';
import { SelectionComposer } from './SelectionComposer';
import { ThreadList } from './ThreadList';
import {
  applyDraftQuoteHighlight,
  applyThreadHighlights,
  clearDraftQuoteHighlights,
  clearThreadHighlights,
  computeQuoteDocumentOrder,
  computeSelectionPromptPosition,
  elementsWithAnnotationThreadId,
  expandCollapsedAncestorsForNode,
  isAnnotationHighlightDebugEnabled,
  rangeAnchorRect,
  setActiveHighlightInRoot,
} from './highlightDom';
import { ANNOTATION_MAX_QUOTE_LEN, normalizeQuoteMatchText } from '../shared/sanitize';
import {
  isThreadUnread,
  loadSeenThreadMap,
  normalizeThreadUpdatedAt,
  reviewCommentAuthorsMatch,
  saveSeenThreadMap,
} from './seenThreads';
import { useSessionAuthor } from './sessionAuthor';
import type { OverviewDocument, RrcThread } from './types';

export default function ReviewCommentsShell({ children }: { children: ReactNode }) {
  const { labels, api, enabled, path, locale, scope } = useReviewComments();
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [threads, setThreads] = useState<RrcThread[]>([]);
  const [overview, setOverview] = useState<OverviewDocument[]>([]);
  const [seenMap, setSeenMap] = useState<Record<string, string>>({});
  const [selectedQuote, setSelectedQuote] = useState('');
  const [manualExpanded, setManualExpanded] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [selectionDraftActive, setSelectionDraftActive] = useState(false);
  const [replyDraftActive, setReplyDraftActive] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [threadOrderById, setThreadOrderById] = useState<Record<string, number>>({});
  const [selectedQuoteOrder, setSelectedQuoteOrder] = useState<number | null>(null);
  const [selectionPrompt, setSelectionPrompt] = useState<{
    quote: string;
    top: number;
    left: number;
  } | null>(null);
  const selectionPromptRef = useRef<HTMLDivElement>(null);
  const pendingQuoteRef = useRef('');
  const skipNextContentMouseUpRef = useRef(false);
  const lastAddCommentCommitAtRef = useRef<number | null>(null);
  const overviewRouteRef = useRef<{ path: string; locale: string; scopeKey: string } | null>(null);
  const panelUnreadAutoFocusDoneRef = useRef(false);
  const prevActiveThreadIdForSeenRef = useRef('');
  const [overviewCountsPending, setOverviewCountsPending] = useState(true);
  const { author, updateAuthor } = useSessionAuthor();

  useEffect(() => {
    setSeenMap(loadSeenThreadMap(scope));
  }, [scope]);

  useEffect(() => {
    if (!enabled || !path || !locale) {
      return;
    }
    let cancelled = false;
    api
      .fetchThreads({ path, locale })
      .then((response) => {
        if (!cancelled) {
          setThreads(response.threads || []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, enabled, path, locale, scope]);

  useEffect(() => {
    if (!enabled) {
      overviewRouteRef.current = null;
      setOverviewCountsPending(false);
      return;
    }
    const sk = scope.scopeKey;
    const prev = overviewRouteRef.current;
    const routeChanged =
      !prev || prev.path !== path || prev.locale !== locale || prev.scopeKey !== sk;
    overviewRouteRef.current = { path, locale, scopeKey: sk };
    if (routeChanged) {
      setOverviewCountsPending(true);
    }

    let cancelled = false;
    api
      .fetchOverview()
      .then((response) => {
        if (!cancelled) {
          setOverview(response.documents || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setOverviewCountsPending(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, enabled, path, locale, scope, threads.length]);

  const markThreadSeen = useCallback(
    (threadId: string, updatedAt: unknown) => {
      const u = normalizeThreadUpdatedAt(updatedAt);
      if (!u) {
        return;
      }
      setSeenMap((prev) => {
        if (normalizeThreadUpdatedAt(prev[threadId]) === u) {
          return prev;
        }
        const next = { ...prev, [threadId]: u };
        saveSeenThreadMap(scope, next);
        return next;
      });
    },
    [scope]
  );

  useEffect(() => {
    const prev = prevActiveThreadIdForSeenRef.current;
    if (prev === activeThreadId) {
      return;
    }
    if (prev) {
      const t = threads.find((th) => th.id === prev);
      if (t) {
        markThreadSeen(prev, t.updated_at ?? t.updatedAt);
      }
    }
    prevActiveThreadIdForSeenRef.current = activeThreadId;
  }, [activeThreadId, threads, markThreadSeen]);

  const documentsWithComments = useMemo(
    () => overview.filter((doc) => doc.threadCount > 0),
    [overview]
  );

  const unreadByDocumentId = useMemo(() => {
    const output: Record<string, number> = {};
    const me = author.trim();
    for (const doc of documentsWithComments) {
      output[doc.documentId] = doc.threads.reduce((count, thread) => {
        const seenUpdatedAt = normalizeThreadUpdatedAt(seenMap[thread.id]);
        const threadUpdated = normalizeThreadUpdatedAt(thread.updatedAt);
        if (!threadUpdated) {
          return count;
        }
        if (!seenUpdatedAt || seenUpdatedAt !== threadUpdated) {
          if (
            me &&
            thread.lastCommentAuthor &&
            reviewCommentAuthorsMatch(thread.lastCommentAuthor, me)
          ) {
            return count;
          }
          return count + 1;
        }
        return count;
      }, 0);
    }
    return output;
  }, [documentsWithComments, seenMap, author]);

  const unreadTotal = useMemo(
    () =>
      Object.values(unreadByDocumentId).reduce((sum: number, count: number) => sum + count, 0),
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
    if (!isPanelExpanded) {
      panelUnreadAutoFocusDoneRef.current = false;
    }
  }, [isPanelExpanded]);

  useEffect(() => {
    if (!enabled || !isPanelExpanded) {
      return;
    }
    if (!visibleThreads.length) {
      return;
    }
    if (panelUnreadAutoFocusDoneRef.current) {
      return;
    }
    if (activeThreadId && visibleThreads.some((t) => t.id === activeThreadId)) {
      panelUnreadAutoFocusDoneRef.current = true;
      return;
    }
    const firstUnread = visibleThreads.find((t) => isThreadUnread(t, seenMap, author));
    if (!firstUnread) {
      panelUnreadAutoFocusDoneRef.current = true;
      return;
    }
    setActiveThreadId(firstUnread.id);
    panelUnreadAutoFocusDoneRef.current = true;
  }, [enabled, isPanelExpanded, visibleThreads, seenMap, activeThreadId, author]);

  useEffect(() => {
    if (isInteracting || selectedQuote) {
      setManualExpanded(true);
    }
  }, [isInteracting, selectedQuote]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const thread = threads.find((t) => t.id === activeThreadId);
    if (thread?.status === 'resolved') {
      setActiveThreadId('');
    }
  }, [threads, activeThreadId]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }
    const nextOrderById = applyThreadHighlights(root, threads, (thread) => {
      setSelectedQuote('');
      setSelectionPrompt(null);
      setShowResolved(thread.status === 'resolved');
      setActiveThreadId(thread.id);
      setManualExpanded(true);
      markThreadSeen(thread.id, thread.updated_at ?? thread.updatedAt);
    });
    setThreadOrderById(nextOrderById);
    return () => {
      clearDraftQuoteHighlights(root);
      clearThreadHighlights(root);
    };
  }, [enabled, threads, markThreadSeen]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }
    setActiveHighlightInRoot(root, activeThreadId);
  }, [enabled, activeThreadId, threads]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }
    const quote = String(selectedQuote || '').trim();
    if (!quote) {
      clearDraftQuoteHighlights(root);
      return undefined;
    }
    clearDraftQuoteHighlights(root);
    applyDraftQuoteHighlight(root, quote);
    return () => {
      clearDraftQuoteHighlights(root);
    };
  }, [enabled, selectedQuote, threads]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = contentRef.current;
    const quote = String(selectedQuote || '').trim();
    if (!quote) {
      setSelectedQuoteOrder(null);
      return undefined;
    }
    const order = computeQuoteDocumentOrder(root, quote);
    setSelectedQuoteOrder(order);
    return undefined;
  }, [enabled, selectedQuote, threads]);

  useEffect(() => {
    if (!activeThreadId || !isPanelExpanded) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      const threadEl = document.getElementById(`rrc-thread-${activeThreadId}`);
      if (!threadEl) {
        return;
      }
      const newRow = threadEl.querySelector('.rrc-comment-row--new');
      if (newRow instanceof HTMLElement) {
        newRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      threadEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeThreadId, isPanelExpanded, showResolved, visibleThreads.length, seenMap]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const root = contentRef.current;
    if (!root) {
      return;
    }
    const matches = elementsWithAnnotationThreadId(root, activeThreadId);
    const target = matches[0];
    if (!(target instanceof HTMLElement)) {
      return;
    }
    expandCollapsedAncestorsForNode(target);
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [activeThreadId]);

  useEffect(() => {
    function handleClickAway(event: MouseEvent) {
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

  const commitSelectionFromPrompt = useCallback(() => {
    const q = pendingQuoteRef.current;
    if (!q) {
      return;
    }
    skipNextContentMouseUpRef.current = true;
    lastAddCommentCommitAtRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    setSelectedQuote(q);
    setSelectedQuoteOrder(null);
    setShowResolved(false);
    setActiveThreadId('');
    setManualExpanded(true);
    setSelectionPrompt(null);
    pendingQuoteRef.current = '';
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  const [addCommentShortcutHint, setAddCommentShortcutHint] = useState('');

  useEffect(() => {
    if (typeof navigator === 'undefined') {
      return;
    }
    setAddCommentShortcutHint(
      /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌥M' : 'Alt+M'
    );
  }, []);

  useEffect(() => {
    if (!enabled || !selectionPrompt) {
      return undefined;
    }
    function onKeyDown(e: KeyboardEvent) {
      /* `code` avoids macOS Option+M producing a non-`m` `key` value. */
      if (e.code !== 'KeyM') {
        return;
      }
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) {
        return;
      }
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      commitSelectionFromPrompt();
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, selectionPrompt, commitSelectionFromPrompt]);

  if (!enabled) {
    return children;
  }

  function handleCollapsePanel() {
    if (activeThreadId) {
      const t = threads.find((th) => th.id === activeThreadId);
      if (t) {
        markThreadSeen(activeThreadId, t.updated_at ?? t.updatedAt);
      }
    }
    setManualExpanded(false);
    setSelectedQuote('');
    setSelectionPrompt(null);
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }

  function containsNode(root: Element | null | undefined, node: Node | null | undefined) {
    if (!root || !node) {
      return false;
    }
    return root === node || root.contains(node);
  }

  function handleMouseUp() {
    if (typeof window === 'undefined') {
      return;
    }
    if (skipNextContentMouseUpRef.current) {
      skipNextContentMouseUpRef.current = false;
      return;
    }
    const selection = window.getSelection();
    const text = selection?.toString()?.trim() || '';
    if (!text) {
      setSelectionPrompt(null);
      pendingQuoteRef.current = '';
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const committedAt = lastAddCommentCommitAtRef.current;
      if (committedAt != null && now - committedAt < 600) {
        setActiveThreadId('');
        return;
      }
      setSelectedQuote('');
      setActiveThreadId('');
      return;
    }
    const root = contentRef.current;
    const selectionRoot =
      root?.querySelector?.('#main-content') ||
      root?.querySelector?.('main[role="main"]') ||
      root?.querySelector?.('main') ||
      root;
    const anchorInside = containsNode(selectionRoot, selection?.anchorNode);
    const focusInside = containsNode(selectionRoot, selection?.focusNode);
    if (!anchorInside || !focusInside) {
      return;
    }
    const slice = text.slice(0, ANNOTATION_MAX_QUOTE_LEN);
    pendingQuoteRef.current = slice;
    if (isAnnotationHighlightDebugEnabled()) {
      const scrubbedLen = normalizeQuoteMatchText(slice).length;
      console.log('[annotations:highlight] mouseUp selection', {
        rawTrimmedLen: text.length,
        storedSliceLen: slice.length,
        normalizedLen: scrubbedLen,
        head200: slice.slice(0, 200),
        tail80: slice.length > 280 ? slice.slice(-80) : undefined,
      });
    }
    setSelectedQuote('');
    setActiveThreadId('');
    setShowResolved(false);
    if (!selection || selection.rangeCount < 1) {
      return;
    }
    try {
      const range = selection.getRangeAt(0);
      const rect = rangeAnchorRect(range);
      setSelectionPrompt({
        quote: slice,
        ...computeSelectionPromptPosition(rect),
      });
    } catch (_err) {
      setSelectionPrompt(null);
    }
  }

  const draftInsertIndex = useMemo(() => {
    if (!selectedQuote || showResolved) {
      return null;
    }
    if (selectedQuoteOrder == null || !Number.isFinite(selectedQuoteOrder)) {
      return null;
    }
    for (let i = 0; i < visibleThreads.length; i += 1) {
      const pos = threadOrderById[visibleThreads[i].id];
      if (Number.isFinite(pos) && pos > selectedQuoteOrder) {
        return i;
      }
    }
    return visibleThreads.length;
  }, [selectedQuote, showResolved, selectedQuoteOrder, visibleThreads, threadOrderById]);

  useEffect(() => {
    if (!selectedQuote || !isPanelExpanded) {
      return;
    }
    const el = document.getElementById('rrc-draft-composer');
    if (!el) {
      return;
    }
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [selectedQuote, isPanelExpanded, draftInsertIndex]);

  useEffect(() => {
    if (!selectionPrompt) {
      return undefined;
    }
    function onSelChange() {
      const quote = pendingQuoteRef.current;
      if (!quote) {
        return;
      }
      const sel = window.getSelection();
      const tSel = (sel?.toString() || '').trim();
      if (!tSel || tSel.slice(0, ANNOTATION_MAX_QUOTE_LEN) !== quote) {
        setSelectionPrompt(null);
        return;
      }
      if (!sel || !sel.rangeCount) {
        setSelectionPrompt(null);
        return;
      }
      try {
        const r = rangeAnchorRect(sel.getRangeAt(0));
        setSelectionPrompt((prev) =>
          prev ? { ...prev, ...computeSelectionPromptPosition(r) } : null
        );
      } catch (_e) {
        setSelectionPrompt(null);
      }
    }
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, [selectionPrompt]);

  useEffect(() => {
    if (!selectionPrompt) {
      return undefined;
    }
    function updateAnchor() {
      const quote = pendingQuoteRef.current;
      if (!quote) {
        return;
      }
      const sel = window.getSelection();
      if (!sel?.rangeCount) {
        setSelectionPrompt(null);
        return;
      }
      const tSel = (sel.toString() || '').trim();
      if (!tSel || tSel.slice(0, ANNOTATION_MAX_QUOTE_LEN) !== quote) {
        return;
      }
      try {
        const r = rangeAnchorRect(sel.getRangeAt(0));
        setSelectionPrompt((prev) =>
          prev ? { ...prev, ...computeSelectionPromptPosition(r) } : null
        );
      } catch (_e) {
        setSelectionPrompt(null);
      }
    }
    window.addEventListener('scroll', updateAnchor, true);
    window.addEventListener('resize', updateAnchor);
    return () => {
      window.removeEventListener('scroll', updateAnchor, true);
      window.removeEventListener('resize', updateAnchor);
    };
  }, [selectionPrompt]);

  const showEmptyHint =
    !overviewCountsPending &&
    totalThreads === 0 &&
    threads.length === 0 &&
    !selectedQuote &&
    !selectionPrompt;

  return (
    <Annotorious>
      {/*
        Recogito defaults to annotatingEnabled: true, which records each text selection as a
        draft annotation and paints highlights (see text-annotator.css *::selection and the
        span highlight layer). We drive comments via handleMouseUp + selectionPrompt instead, so
        keep the annotator from storing selection state or leaving highlight nodes behind.
      */}
      <TextAnnotator annotatingEnabled={false}>
        <div
          ref={contentRef}
          data-annotations-enabled="true"
          className={isPanelExpanded && selectedQuote ? 'rrc-select-amber' : undefined}
          onMouseUp={handleMouseUp}
        >
          {children}
        </div>
        <ReviewCommentsPanel
          ref={panelRef}
          isPanelExpanded={isPanelExpanded}
          onExpand={() => setManualExpanded(true)}
          onCollapse={handleCollapsePanel}
          badgeCountsLoading={overviewCountsPending}
          unreadTotal={unreadTotal}
          totalThreads={totalThreads}
          documentsWithComments={documentsWithComments}
          currentDocIndex={currentDocIndex}
          nextDoc={nextDoc}
          unreadByDocumentId={unreadByDocumentId}
          resolvedCount={resolvedCount}
          showResolved={showResolved}
          onToggleResolved={() => setShowResolved((prev) => !prev)}
          showEmptyHint={showEmptyHint}
        >
          <ThreadList
            threads={visibleThreads}
            locale={locale}
            currentAuthor={author}
            seenMap={seenMap}
            activeThreadId={activeThreadId}
            onThreadFocus={(thread) => {
              setSelectedQuote('');
              setSelectionPrompt(null);
              setActiveThreadId(thread.id);
            }}
            onReplyCancel={() => setActiveThreadId('')}
            onReply={async ({ threadId, comment, clear }) => {
              const response = await api.createComment({ threadId, comment, createdBy: author });
              clear();
              setThreads((prev) =>
                prev.map((thread) =>
                  thread.id === threadId
                    ? { ...thread, comments: [...thread.comments, response.comment] }
                    : thread
                )
              );
              markThreadSeen(
                threadId,
                response.comment.created_at ?? response.comment.createdAt ?? new Date().toISOString()
              );
            }}
            onEditComment={async ({ threadId, commentId, body }) => {
              const response = await api.patchComment(commentId, body);
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
              await api.deleteComment(commentId);
              setThreads((prev) =>
                prev
                  .map((thread) =>
                    thread.id === threadId
                      ? {
                        ...thread,
                        comments: thread.comments.filter((comment) => comment.id !== commentId),
                      }
                      : thread
                  )
                  .filter((thread) => thread.comments.length > 0)
              );
            }}
            onToggleResolved={async (threadId, status) => {
              await api.patchThreadStatus(threadId, status);
              setThreads((prev) =>
                prev.map((thread) => (thread.id === threadId ? { ...thread, status } : thread))
              );
            }}
            onDraftStateChange={setReplyDraftActive}
            emptyLabel={showResolved ? labels.noResolvedThreads : labels.noOpenThreads}
            draftInsertIndex={draftInsertIndex}
            draftComposer={
              !showResolved && selectedQuote ? (
                <SelectionComposer
                  path={path}
                  locale={locale}
                  author={author}
                  updateAuthor={updateAuthor}
                  selectedQuote={selectedQuote}
                  onCancel={() => {
                    setSelectedQuote('');
                    setSelectionPrompt(null);
                    setActiveThreadId('');
                    if (typeof window !== 'undefined') {
                      const selection = window.getSelection();
                      selection?.removeAllRanges();
                    }
                  }}
                  onThreadCreated={() => {
                    setSelectedQuote('');
                    setSelectionPrompt(null);
                    if (typeof window !== 'undefined') {
                      const selection = window.getSelection();
                      selection?.removeAllRanges();
                    }
                  }}
                  onCreated={(thread) => {
                    setThreads((prev) => [...prev, thread]);
                    markThreadSeen(thread.id, thread.updated_at ?? thread.updatedAt);
                  }}
                  onDraftStateChange={setSelectionDraftActive}
                />
              ) : null
            }
          />
        </ReviewCommentsPanel>
        {selectionPrompt ? (
          <div
            ref={selectionPromptRef}
            className="rrc-root rrc-selection-prompt"
            style={{ top: selectionPrompt.top, left: selectionPrompt.left }}
          >
            <button
              type="button"
              aria-label={
                addCommentShortcutHint
                  ? `${labels.addComment} (${addCommentShortcutHint})`
                  : labels.addComment
              }
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                commitSelectionFromPrompt();
              }}
            >
              {labels.addComment}
              {addCommentShortcutHint ? (
                <span className="rrc-selection-prompt-kbd"> {addCommentShortcutHint}</span>
              ) : null}
            </button>
          </div>
        ) : null}
      </TextAnnotator>
    </Annotorious>
  );
}
