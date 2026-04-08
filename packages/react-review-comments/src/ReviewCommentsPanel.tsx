'use client';

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronsRight } from 'lucide-react';
import { useReviewComments } from './context';
import { withLocalePath } from './annotationPaths';
import type { OverviewDocument } from './types';

/** Matches expanded .rrc-aside: distance from viewport top to bottom margin (scrollable panel fill). */
function viewportPanelHeightCapPx(aside: HTMLElement | null): number {
  if (typeof window === 'undefined') {
    return 900;
  }
  const vh = window.innerHeight;
  const topPx =
    aside instanceof HTMLElement ? aside.getBoundingClientRect().top : 16;
  const bottomMarginPx = 16;
  return Math.max(240, Math.floor(vh - topPx - bottomMarginPx));
}

function AnimatedPanelColumn({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [maxHeightPx, setMaxHeightPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof window === 'undefined') {
      return undefined;
    }

    const sync = () => {
      const outer = inner.parentElement;
      if (!outer) {
        return;
      }
      const aside = outer.parentElement;
      const cap = viewportPanelHeightCapPx(aside instanceof HTMLElement ? aside : null);
      // maxHeight applies to the panel’s border box; inner.scrollHeight is only the content
      // wrapper. Without adding padding + border, the content box is too short and a scrollbar
      // appears even for one or two threads.
      const cs = window.getComputedStyle(outer);
      const chromeY =
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(cs.borderTopWidth) +
        parseFloat(cs.borderBottomWidth);
      const next = Math.min(Math.ceil(inner.scrollHeight + chromeY), cap);
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

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const maxHClass = maxHeightPx == null ? ' rrc-panel-maxvh' : '';

  return (
    <div
      className={`${className}${maxHClass}`}
      style={maxHeightPx != null ? { maxHeight: `${Math.ceil(maxHeightPx)}px` } : undefined}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

export type ReviewCommentsPanelProps = {
  isPanelExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  /** True while overview fetch is in flight (avoid showing "0 comments" in the collapsed badge). */
  badgeCountsLoading: boolean;
  unreadTotal: number;
  totalThreads: number;
  documentsWithComments: OverviewDocument[];
  currentDocIndex: number;
  nextDoc: OverviewDocument | null;
  unreadByDocumentId: Record<string, number>;
  resolvedCount: number;
  showResolved: boolean;
  onToggleResolved: () => void;
  showEmptyHint: boolean;
  children: ReactNode;
};

export const ReviewCommentsPanel = forwardRef<HTMLElement, ReviewCommentsPanelProps>(
  function ReviewCommentsPanel(
    {
      isPanelExpanded,
      onExpand,
      onCollapse,
      badgeCountsLoading,
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
    },
    ref
  ) {
    const { labels } = useReviewComments();

    return (
      <aside
        ref={ref}
        className={`rrc-root rrc-aside ${isPanelExpanded ? 'rrc-aside--expanded' : 'rrc-aside--collapsed'}`}
      >
        {!isPanelExpanded && (
          <button
            type="button"
            aria-busy={badgeCountsLoading}
            className={
              !badgeCountsLoading && unreadTotal > 0
                ? 'rrc-panel-collapsed rrc-panel-collapsed--unread'
                : 'rrc-panel-collapsed'
            }
            onClick={onExpand}
          >
            {badgeCountsLoading ? (
              <span className="rrc-collapsed-count-skeleton" aria-hidden="true" />
            ) : unreadTotal > 0 ? (
              labels.collapsedUnreadBadge({ unread: unreadTotal, total: totalThreads })
            ) : (
              labels.collapsedBadge({ count: totalThreads })
            )}
          </button>
        )}

        {isPanelExpanded && (
          <AnimatedPanelColumn className="rrc-panel-expanded">
            <div className="rrc-panel-meta">
              <div className="rrc-panel-header">
                <div className="rrc-truncate">
                  <h2 className="rrc-panel-title">{labels.prOverviewTitle}</h2>
                  <p className="rrc-panel-sub">
                    <span>
                      {badgeCountsLoading ? (
                        <span className="rrc-panel-count-skeleton" aria-hidden="true" />
                      ) : (
                        labels.threadCount({ count: totalThreads })
                      )}
                    </span>
                    {!badgeCountsLoading && unreadTotal > 0 && (
                      <span>· {labels.unreadBadge({ count: unreadTotal })}</span>
                    )}
                    {resolvedCount > 0 && (
                      <button type="button" className="rrc-link-btn" onClick={onToggleResolved}>
                        {showResolved
                          ? labels.hideResolvedToggle
                          : labels.viewResolvedToggle({ count: resolvedCount })}
                      </button>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={labels.collapse}
                  title={labels.collapse}
                  className="rrc-icon-btn"
                  onClick={onCollapse}
                >
                  <ChevronsRight size={16} />
                </button>
              </div>

              {documentsWithComments.length > 1 && (
                <div className="rrc-section">
                  <p className="rrc-section-label">{labels.panelSectionNavigate}</p>
                  <div className="rrc-nav-row">
                    <span style={{ color: 'var(--rrc-muted)' }}>
                      {labels.progressLabel({
                        current: Math.max(1, currentDocIndex + 1),
                        total: documentsWithComments.length,
                      })}
                    </span>
                    <button
                      type="button"
                      className="rrc-link-btn"
                      onClick={() => {
                        if (nextDoc) {
                          window.location.href = withLocalePath(nextDoc.locale, nextDoc.sitePath);
                        }
                      }}
                    >
                      {labels.nextPage}
                    </button>
                  </div>
                </div>
              )}

              {documentsWithComments.length > 1 && (
                <div className="rrc-section">
                  <p className="rrc-section-label">{labels.panelSectionPages}</p>
                  <ul className="rrc-doc-list">
                    {documentsWithComments.map((doc) => (
                      <li key={doc.documentId}>
                        <button
                          type="button"
                          className="rrc-doc-btn"
                          onClick={() => {
                            window.location.href = withLocalePath(doc.locale, doc.sitePath);
                          }}
                        >
                          <span className="rrc-truncate">{withLocalePath(doc.locale, doc.sitePath)}</span>
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              color: 'var(--rrc-muted)',
                            }}
                          >
                            <span>{doc.threadCount}</span>
                            {unreadByDocumentId[doc.documentId] > 0 && (
                              <span className="rrc-badge">{unreadByDocumentId[doc.documentId]}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {showEmptyHint && <p className="rrc-empty-hint">{labels.emptyPanelHint}</p>}
            {children}
          </AnimatedPanelColumn>
        )}
      </aside>
    );
  }
);
