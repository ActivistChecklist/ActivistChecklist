import crypto from 'node:crypto';
import type { ReviewCommentsScope } from '../src/types';
import { REVIEW_COMMENTS_COLLECTIONS as C } from './collections';
import { collection, ensureAnnotationSchema } from './db';

function uuid(): string {
  return crypto.randomUUID();
}

export async function getOrCreateDocument({
  scopeKey,
  path,
  locale,
  contentHash,
}: {
  scopeKey: string;
  path: string;
  locale: string;
  contentHash: string;
}): Promise<Record<string, unknown>> {
  await ensureAnnotationSchema();
  const documents = await collection(C.documents);
  const existing = await documents.findOne({
    scope_key: scopeKey,
    site_path: path,
    locale,
  });
  if (existing) {
    if (contentHash && existing.content_hash !== contentHash) {
      await documents.updateOne(
        { id: existing.id },
        { $set: { content_hash: contentHash, updated_at: new Date() } }
      );
      existing.content_hash = contentHash;
      existing.updated_at = new Date();
    }
    return existing as Record<string, unknown>;
  }
  const id = uuid();
  const now = new Date();
  const created = {
    id,
    scope_key: scopeKey,
    site_path: path,
    locale,
    content_hash: contentHash || null,
    created_at: now,
    updated_at: now,
  };
  await documents.insertOne(created);
  return created;
}

export async function listThreadsForDocument(documentId: string): Promise<Record<string, unknown>[]> {
  await ensureAnnotationSchema();
  const threadsColl = await collection(C.threads);
  const commentsColl = await collection(C.comments);
  const threads = await threadsColl
    .find({ document_id: documentId })
    .sort({ created_at: 1 })
    .toArray();
  const threadIds = threads.map((row) => row.id as string);
  const comments =
    threadIds.length > 0
      ? await commentsColl
        .find({ thread_id: { $in: threadIds }, deleted_at: null })
        .sort({ created_at: 1 })
        .toArray()
      : [];
  const commentsByThreadId = new Map<string, Record<string, unknown>[]>();
  for (const comment of comments) {
    const tid = comment.thread_id as string;
    if (!commentsByThreadId.has(tid)) {
      commentsByThreadId.set(tid, []);
    }
    commentsByThreadId.get(tid)!.push(comment as Record<string, unknown>);
  }

  return threads
    .map((thread) => ({
      ...(thread as Record<string, unknown>),
      comments: commentsByThreadId.get(thread.id as string) || [],
    }))
    .filter((thread) => (thread.comments as unknown[]).length > 0);
}

export async function createThread({
  documentId,
  anchorSelector,
  quoteText,
  startOffset,
  endOffset,
  createdBy,
  initialComment,
}: {
  documentId: string;
  anchorSelector: Record<string, unknown>;
  quoteText: string;
  startOffset: number | null;
  endOffset: number | null;
  createdBy: string;
  initialComment: string;
}): Promise<Record<string, unknown>> {
  await ensureAnnotationSchema();
  const threadsColl = await collection(C.threads);
  const commentsColl = await collection(C.comments);
  const threadId = uuid();
  const now = new Date();
  const thread = {
    id: threadId,
    document_id: documentId,
    anchor_selector: anchorSelector,
    quote_text: quoteText,
    start_offset: startOffset,
    end_offset: endOffset,
    status: 'open',
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  };
  await threadsColl.insertOne(thread);
  const commentId = uuid();
  const comment = {
    id: commentId,
    thread_id: thread.id,
    body: initialComment,
    created_by: createdBy,
    edited_at: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  await commentsColl.insertOne(comment);
  return { ...thread, comments: [comment] };
}

async function assertThreadInScope(threadId: string, scope: ReviewCommentsScope): Promise<boolean> {
  const threadsColl = await collection(C.threads);
  const docsColl = await collection(C.documents);
  const thread = await threadsColl.findOne({ id: threadId });
  if (!thread) {
    return false;
  }
  const doc = await docsColl.findOne({
    id: thread.document_id,
    scope_key: scope.scopeKey,
  });
  return Boolean(doc);
}

export async function createComment({
  threadId,
  body,
  createdBy,
  scope,
}: {
  threadId: string;
  body: string;
  createdBy: string;
  scope: ReviewCommentsScope;
}): Promise<Record<string, unknown> | null> {
  await ensureAnnotationSchema();
  const commentsColl = await collection(C.comments);
  const threadsColl = await collection(C.threads);
  const inScope = await assertThreadInScope(threadId, scope);
  if (!inScope) {
    return null;
  }
  const id = uuid();
  const now = new Date();
  const created = {
    id,
    thread_id: threadId,
    body,
    created_by: createdBy,
    edited_at: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  await commentsColl.insertOne(created);
  await threadsColl.updateOne({ id: threadId }, { $set: { updated_at: now } });
  return created;
}

async function getThreadIdForCommentInScope(
  commentId: string,
  scope: ReviewCommentsScope
): Promise<string | null> {
  const commentsColl = await collection(C.comments);
  const threadsColl = await collection(C.threads);
  const docsColl = await collection(C.documents);
  const comment = await commentsColl.findOne({ id: commentId, deleted_at: null });
  if (!comment) {
    return null;
  }
  const thread = await threadsColl.findOne({ id: comment.thread_id });
  if (!thread) {
    return null;
  }
  const doc = await docsColl.findOne({
    id: thread.document_id,
    scope_key: scope.scopeKey,
  });
  return doc ? (comment.thread_id as string) : null;
}

export async function updateComment({
  commentId,
  body,
  scope,
}: {
  commentId: string;
  body: string;
  scope: ReviewCommentsScope;
}): Promise<Record<string, unknown> | null> {
  await ensureAnnotationSchema();
  const commentsColl = await collection(C.comments);
  const threadsColl = await collection(C.threads);
  const threadId = await getThreadIdForCommentInScope(commentId, scope);
  if (!threadId) {
    return null;
  }
  const now = new Date();
  await commentsColl.updateOne(
    { id: commentId },
    { $set: { body, edited_at: now, updated_at: now } }
  );
  await threadsColl.updateOne({ id: threadId }, { $set: { updated_at: now } });
  return commentsColl.findOne({ id: commentId });
}

export async function deleteComment({
  commentId,
  scope,
}: {
  commentId: string;
  scope: ReviewCommentsScope;
}): Promise<{ id: string } | null> {
  await ensureAnnotationSchema();
  const commentsColl = await collection(C.comments);
  const threadsColl = await collection(C.threads);
  const threadId = await getThreadIdForCommentInScope(commentId, scope);
  if (!threadId) {
    return null;
  }
  const now = new Date();
  await commentsColl.updateOne(
    { id: commentId },
    { $set: { deleted_at: now, updated_at: now } }
  );
  await threadsColl.updateOne({ id: threadId }, { $set: { updated_at: now } });
  return { id: commentId };
}

export async function updateThreadStatus({
  threadId,
  status,
  scope,
}: {
  threadId: string;
  status: string;
  scope: ReviewCommentsScope;
}): Promise<Record<string, unknown> | null> {
  await ensureAnnotationSchema();
  const threadsColl = await collection(C.threads);
  const inScope = await assertThreadInScope(threadId, scope);
  if (!inScope) {
    return null;
  }
  await threadsColl.updateOne(
    { id: threadId },
    { $set: { status, updated_at: new Date() } }
  );
  return threadsColl.findOne({ id: threadId });
}

export async function cleanupOldAnnotationData({ olderThanDays = 45 }: { olderThanDays?: number } = {}): Promise<{
  deletedDocuments: number;
  olderThanDays: number;
}> {
  await ensureAnnotationSchema();
  const documents = await collection(C.documents);
  const threads = await collection(C.threads);
  const comments = await collection(C.comments);
  const days = Number.isFinite(olderThanDays) ? olderThanDays : 45;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const oldDocs = await documents.find({ updated_at: { $lt: cutoff } }, { projection: { id: 1 } }).toArray();
  const docIds = oldDocs.map((doc) => doc.id as string);
  if (docIds.length > 0) {
    const oldThreads = await threads.find({ document_id: { $in: docIds } }, { projection: { id: 1 } }).toArray();
    const threadIds = oldThreads.map((thread) => thread.id as string);
    if (threadIds.length > 0) {
      await comments.deleteMany({ thread_id: { $in: threadIds } });
      await threads.deleteMany({ id: { $in: threadIds } });
    }
  }
  const deleted = await documents.deleteMany({ updated_at: { $lt: cutoff } });
  return { deletedDocuments: deleted.deletedCount || 0, olderThanDays: days };
}

export async function listScopeOverview(scope: ReviewCommentsScope): Promise<
  Array<{
    documentId: string;
    sitePath: string;
    locale: string;
    threadCount: number;
    commentCount: number;
    lastActivityAt: unknown;
    threads: Array<{
      id: string;
      status: unknown;
      updatedAt: unknown;
      commentCount: number;
      lastCommentAuthor?: string;
    }>;
  }>
> {
  await ensureAnnotationSchema();
  const documents = await collection(C.documents);
  const threadsColl = await collection(C.threads);
  const commentsColl = await collection(C.comments);

  const docsRows = await documents
    .find({
      scope_key: scope.scopeKey,
    })
    .sort({ site_path: 1 })
    .toArray();

  const docIds = docsRows.map((doc) => doc.id as string);
  const threadsRows =
    docIds.length > 0
      ? await threadsColl.find({ document_id: { $in: docIds } }).sort({ updated_at: -1 }).toArray()
      : [];
  const threadIds = threadsRows.map((thread) => thread.id as string);
  const commentsRows =
    threadIds.length > 0
      ? await commentsColl.find({ thread_id: { $in: threadIds }, deleted_at: null }).toArray()
      : [];
  const commentCountByThreadId = new Map<string, number>();
  /** Latest comment per thread by `created_at` (ISO string compare). */
  const latestCommentByThreadId = new Map<string, { at: string; created_by: string }>();
  for (const comment of commentsRows) {
    const tid = comment.thread_id as string;
    commentCountByThreadId.set(tid, (commentCountByThreadId.get(tid) || 0) + 1);
    const cat = String((comment as Record<string, unknown>).created_at ?? '');
    const prev = latestCommentByThreadId.get(tid);
    if (!prev || cat > prev.at) {
      latestCommentByThreadId.set(tid, {
        at: cat,
        created_by: String((comment as Record<string, unknown>).created_by ?? ''),
      });
    }
  }
  const activeThreads = threadsRows.filter(
    (thread) => (commentCountByThreadId.get(thread.id as string) || 0) > 0
  );
  const openThreads = activeThreads.filter((thread) => (thread.status || 'open') !== 'resolved');
  const threadsByDocumentId = new Map<string, Record<string, unknown>[]>();
  for (const thread of openThreads) {
    const did = thread.document_id as string;
    if (!threadsByDocumentId.has(did)) {
      threadsByDocumentId.set(did, []);
    }
    threadsByDocumentId.get(did)!.push(thread as Record<string, unknown>);
  }

  return docsRows.map((doc) => {
    const threads = threadsByDocumentId.get(doc.id as string) || [];
    const commentCount = threads.reduce(
      (sum, thread) => sum + (commentCountByThreadId.get(thread.id as string) || 0),
      0
    );
    const lastActivityAt = (threads[0] as Record<string, unknown> | undefined)?.updated_at || doc.updated_at;
    return {
      documentId: doc.id as string,
      sitePath: doc.site_path as string,
      locale: doc.locale as string,
      threadCount: threads.length,
      commentCount,
      lastActivityAt,
      threads: threads.map((thread) => {
        const tid = thread.id as string;
        const latest = latestCommentByThreadId.get(tid);
        return {
          id: tid,
          status: thread.status,
          updatedAt: thread.updated_at,
          commentCount: commentCountByThreadId.get(tid) || 0,
          ...(latest?.created_by ? { lastCommentAuthor: latest.created_by } : {}),
        };
      }),
    };
  });
}
