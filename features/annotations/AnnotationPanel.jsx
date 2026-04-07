'use client';

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { ChevronsRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { withLocalePath } from '@/features/annotations/annotationPaths';

function panelHeightCapPx() {
  if (typeof window === 'undefined') {
    return 900;
  }
  return Math.max(240, window.innerHeight - 7 * 16);
}

/**
 * Smoothly animates max-height when inner content grows or shrinks (e.g. threads resolved,
 * replies toggled, new composer). ResizeObserver keeps target height in sync with content.
 */
function AnimatedPanelColumn({ className, children }) {
  const innerRef = useRef(null);
  const [maxHeightPx, setMaxHeightPx] = useState(null);
  const [canTransition, setCanTransition] = useState(false);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof window === 'undefined') {
      return undefined;
    }

    const sync = () => {
      const cap = panelHeightCapPx();
      const next = Math.min(inner.scrollHeight, cap);
      setMaxHeightPx((prev) => {
        if (prev === next) {
          return prev;
        }
        return next;
      });
    };

    sync();
    const ro = new ResizeObserver(() => {
      sync();
    });
    ro.observe(inner);

    const onResize = () => {
      sync();
    };
    window.addEventListener('resize', onResize);

    let transitionTimer;
    const rafId = requestAnimationFrame(() => {
      transitionTimer = window.setTimeout(() => {
        setCanTransition(true);
      }, 0);
    });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafId);
      if (transitionTimer != null) {
        clearTimeout(transitionTimer);
      }
    };
  }, []);

  return (
    <div
      className={`overflow-y-auto ${className} ${
        canTransition ? 'transition-[max-height] duration-300 ease-out motion-reduce:transition-none' : ''
      } ${maxHeightPx == null ? 'max-h-[calc(100vh-7rem)]' : ''}`}
      style={maxHeightPx != null ? { maxHeight: `${Math.ceil(maxHeightPx)}px` } : undefined}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

export const AnnotationPanel = forwardRef(function AnnotationPanel({
  isPanelExpanded,
  onExpand,
  onCollapse,
  unreadTotal,
  totalThreads,
  documentsWithComments,
  currentDocIndex,
  nextDoc,
  unreadByDocumentId,
  resolvedCount,
  showResolved,
  onToggleResolved,
  showEmptyHint,
  children,
}, ref) {
  const t = useTranslations();

  return (
    <aside ref={ref} className="fixed right-4 top-24 z-70">
      {!isPanelExpanded && (
        <button
          type="button"
          className={`rounded-full border px-3 py-2 text-xs shadow-lg ${
            unreadTotal > 0
              ? 'border-amber-500 bg-amber-100 text-amber-900'
              : 'border-primary/30 bg-background text-foreground'
          }`}
          onClick={onExpand}
        >
          {unreadTotal > 0
            ? t('annotations.collapsedUnreadBadge', { unread: unreadTotal, total: totalThreads })
            : t('annotations.collapsedBadge', { count: totalThreads })}
        </button>
      )}

      {isPanelExpanded && (
        <AnimatedPanelColumn className="w-[min(19rem,calc(100vw-2rem))] rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur supports-backdrop-filter:bg-background/85">
          <div className="text-[11px]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold leading-tight text-foreground">
                  {t('annotations.prOverviewTitle')}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{t('annotations.threadCount', { count: totalThreads })}</span>
                  {unreadTotal > 0 && (
                    <span>· {t('annotations.unreadBadge', { count: unreadTotal })}</span>
                  )}
                  {resolvedCount > 0 && (
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                      onClick={onToggleResolved}
                    >
                      {showResolved
                        ? t('annotations.hideResolvedToggle')
                        : t('annotations.viewResolvedToggle', { count: resolvedCount })}
                    </button>
                  )}
                </p>
              </div>
              <button
                type="button"
                aria-label={t('annotations.collapse')}
                title={t('annotations.collapse')}
                className="-m-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={onCollapse}
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
                </div>
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
          {showEmptyHint && (
            <p className="mt-3 rounded-md bg-muted/25 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
              {t('annotations.emptyPanelHint')}
            </p>
          )}
          {children}
        </AnimatedPanelColumn>
      )}
    </aside>
  );
});
