'use client';

import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Annotorious } from '@annotorious/react';
import { TextAnnotator } from '@recogito/react-text-annotator';
import { useTranslations } from 'next-intl';
import {
  createComment,
  deleteComment,
  fetchOverview,
  fetchThreads,
  patchComment,
  patchThreadStatus,
} from '@/features/annotations/api';
import { AnnotationPanel } from '@/features/annotations/AnnotationPanel';
import { SelectionComposer } from '@/features/annotations/SelectionComposer';
import { ThreadList } from '@/features/annotations/ThreadList';
import {
  applyDraftQuoteHighlight,
  applyThreadHighlights,
  clearDraftQuoteHighlights,
  clearThreadHighlights,
  computeQuoteDocumentOrder,
  computeSelectionPromptPosition,
  escapeAttrValue,
  expandCollapsedAncestorsForNode,
  rangeAnchorRect,
  setActiveHighlightInRoot,
} from '@/features/annotations/highlightDom';
import { ANNOTATION_MAX_QUOTE_LEN } from '@/lib/annotations/sanitize';
import { loadSeenThreadMap, saveSeenThreadMap } from '@/features/annotations/seenThreads';
import { useSessionAuthor } from '@/features/annotations/sessionAuthor';

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
  const [selectionPrompt, setSelectionPrompt] = useState(null);
  const selectionPromptRef = useRef(null);
  const pendingQuoteRef = useRef('');
  const skipNextContentMouseUpRef = useRef(false);
  const lastAddCommentCommitAtRef = useRef(null);
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
    });
    setThreadOrderById(nextOrderById);
    return () => {
      clearDraftQuoteHighlights(root);
      clearThreadHighlights(root);
    };
  }, [enabled, threads]);

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
    const target = document.getElementById(`annotation-thread-${activeThreadId}`);
    if (target) {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeThreadId, isPanelExpanded, showResolved, visibleThreads.length]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const root = contentRef.current;
    if (!root) {
      return;
    }
    const target = root.querySelector(
      `[data-annotation-thread-id="${escapeAttrValue(activeThreadId)}"]`
    );
    if (!(target instanceof HTMLElement)) {
      return;
    }
    expandCollapsedAncestorsForNode(target);
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [activeThreadId]);

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
    setSelectionPrompt(null);
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }

  function commitSelectionFromPrompt() {
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
    const anchorInside = containsNode(root, selection?.anchorNode);
    const focusInside = containsNode(root, selection?.focusNode);
    if (!anchorInside || !focusInside) {
      return;
    }
    const slice = text.slice(0, ANNOTATION_MAX_QUOTE_LEN);
    pendingQuoteRef.current = slice;
    setSelectedQuote('');
    setActiveThreadId('');
    setShowResolved(false);
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
    const el = document.getElementById('annotation-draft-composer');
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
      if (!sel.rangeCount) {
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
    totalThreads === 0 && threads.length === 0 && !selectedQuote && !selectionPrompt;

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
          className={
            isPanelExpanded && selectedQuote
              ? 'selection:bg-amber-500/45 selection:text-foreground'
              : undefined
          }
          onMouseUp={handleMouseUp}
        >
          {children}
        </div>
        <AnnotationPanel
          ref={panelRef}
          isPanelExpanded={isPanelExpanded}
          onExpand={() => setManualExpanded(true)}
          onCollapse={handleCollapsePanel}
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
            activeThreadId={activeThreadId}
            onThreadFocus={(thread) => {
              setSelectedQuote('');
              setSelectionPrompt(null);
              setActiveThreadId(thread.id);
            }}
            onReplyCancel={() => setActiveThreadId('')}
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
                  onCreated={(thread) => setThreads((prev) => [...prev, thread])}
                  onDraftStateChange={setSelectionDraftActive}
                />
              ) : null
            }
          />
        </AnnotationPanel>
        {selectionPrompt ? (
          <div
            ref={selectionPromptRef}
            className="pointer-events-none fixed z-90"
            style={{ top: selectionPrompt.top, left: selectionPrompt.left }}
          >
            <button
              type="button"
              className="pointer-events-auto cursor-pointer rounded-full border border-primary/30 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                commitSelectionFromPrompt();
              }}
            >
              {t('annotations.addComment')}
            </button>
          </div>
        ) : null}
      </TextAnnotator>
    </Annotorious>
  );
}
