import type { ReactNode } from 'react';

/**
 * Partitions stored comments by site. The stock API sets `scopeKey` from the request
 * `Host` / `X-Forwarded-Host` (see `scopeFromHost.ts`).
 */
export interface ReviewCommentsScope {
  scopeKey: string;
}

/** UI strings; function entries support i18n-style interpolation. */
export interface ReviewCommentsLabels {
  newThreadTitle: string;
  authorPlaceholder: string;
  commentPlaceholder: string;
  replyPlaceholder: string;
  addThread: string;
  postComment: string;
  commentButton: string;
  cancel: string;
  submitting: string;
  dbUnavailable: string;
  submitFailed: string;
  moreActions: string;
  editComment: string;
  deleteComment: string;
  confirmDeleteComment: string;
  today: string;
  commentTime: (args: { time: string; dateLabel: string }) => string;
  threadPanelTitle: string;
  noThreads: string;
  open: string;
  resolved: string;
  reply: string;
  resolve: string;
  reopen: string;
  viewResolvedToggle: (args: { count: number }) => string;
  hideResolvedToggle: string;
  noOpenThreads: string;
  noResolvedThreads: string;
  hiddenCommentsCount: (args: { count: number }) => string;
  showMore: string;
  showLess: string;
  commentingAs: string;
  saveName: string;
  prOverviewTitle: string;
  panelSectionNavigate: string;
  panelSectionPages: string;
  addComment: string;
  emptyPanelHint: string;
  totalCommentsBadge: (args: { count: number }) => string;
  unreadBadge: (args: { count: number }) => string;
  progressLabel: (args: { current: number; total: number }) => string;
  nextPage: string;
  threadCount: (args: { count: number }) => string;
  unreadThreadCount: (args: { count: number }) => string;
  collapse: string;
  collapsedBadge: (args: { count: number }) => string;
  collapsedUnreadBadge: (args: { unread: number; total: number }) => string;
  commentingAsCompact: (args: { author: string }) => string;
  show: string;
  hide: string;
  /** Short label on comments newer than last-seen (e.g. ribbon on new reply). */
  newCommentBadge: string;
}

export type PartialReviewCommentsLabels = Partial<ReviewCommentsLabels>;

export interface RrcComment {
  id: string;
  body?: string;
  created_by: string;
  created_at?: string;
  createdAt?: string;
}

export interface RrcThread {
  id: string;
  quote_text: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
  /** API may return snake_case or camelCase depending on layer */
  updated_at?: string;
  updatedAt?: string | Date;
  comments: RrcComment[];
}

export interface CreateThreadPayload {
  path: string;
  locale: string;
  quoteText: string;
  comment: string;
  createdBy: string;
  anchorSelector: Record<string, unknown>;
  contentHash?: string;
}

export interface CreateCommentPayload {
  threadId: string;
  comment: string;
  createdBy: string;
}

export interface ReviewCommentsApi {
  fetchThreads: (args: { path: string; locale: string }) => Promise<{
    document: unknown;
    threads: RrcThread[];
    dbOffline?: boolean;
  }>;
  fetchOverview: () => Promise<{
    documents: OverviewDocument[];
    dbOffline?: boolean;
  }>;
  createThread: (payload: CreateThreadPayload) => Promise<{ thread: RrcThread }>;
  createComment: (payload: CreateCommentPayload) => Promise<{ comment: RrcComment }>;
  patchThreadStatus: (threadId: string, status: string) => Promise<{ thread: unknown }>;
  patchComment: (commentId: string, comment: string) => Promise<{ comment: RrcComment }>;
  deleteComment: (commentId: string) => Promise<unknown>;
}

export interface OverviewDocument {
  documentId: string;
  sitePath: string;
  locale: string;
  threadCount: number;
  commentCount: number;
  lastActivityAt?: Date | string;
  threads: Array<{
    id: string;
    status?: string;
    updatedAt?: Date | string;
    commentCount: number;
    /** Author of the latest comment (for unread vs own-reply heuristics). */
    lastCommentAuthor?: string;
  }>;
}

export interface ReviewCommentsContextValue {
  api: ReviewCommentsApi;
  apiBase: string;
  enabled: boolean;
  path: string;
  locale: string;
  scope: ReviewCommentsScope;
  labels: ReviewCommentsLabels;
}

export interface ReviewCommentsProviderProps {
  children: ReactNode;
  apiBase?: string;
  enabled?: boolean;
  path?: string;
  locale?: string;
  scope?: ReviewCommentsScope;
  labels?: PartialReviewCommentsLabels;
}

export interface ApiError extends Error {
  status?: number;
}
