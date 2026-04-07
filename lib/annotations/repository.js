import crypto from 'node:crypto';
import { collection, ensureAnnotationSchema } from '@/lib/annotations/db';

function uuid() {
  return crypto.randomUUID();
}

export async function getOrCreateDocument({ scopeKey, repoFullName, prNumber, deploymentKey, path, locale, contentHash }) {
  await ensureAnnotationSchema();
  const documents = await collection('annotation_documents');
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
    return existing;
  }
  const id = uuid();
  const now = new Date();
  const created = {
    id,
    scope_key: scopeKey,
    repo_full_name: repoFullName,
    pr_number: prNumber,
    deployment_key: deploymentKey,
    site_path: path,
    locale,
    content_hash: contentHash || null,
    created_at: now,
    updated_at: now,
  };
  await documents.insertOne(created);
  return created;
}

export async function listThreadsForDocument(documentId) {
  await ensureAnnotationSchema();
  const threadsColl = await collection('annotation_threads');
  const commentsColl = await collection('annotation_comments');
  const threads = await threadsColl
    .find({ document_id: documentId })
    .sort({ created_at: 1 })
    .toArray();
  const threadIds = threads.map((row) => row.id);
  const comments = threadIds.length > 0
    ? await commentsColl
      .find({ thread_id: { $in: threadIds }, deleted_at: null })
      .sort({ created_at: 1 })
      .toArray()
    : [];
  const commentsByThreadId = new Map();
  for (const comment of comments) {
    if (!commentsByThreadId.has(comment.thread_id)) {
      commentsByThreadId.set(comment.thread_id, []);
    }
    commentsByThreadId.get(comment.thread_id).push(comment);
  }

  return threads
    .map((thread) => ({
      ...thread,
      comments: commentsByThreadId.get(thread.id) || [],
    }))
    .filter((thread) => thread.comments.length > 0);
}

export async function createThread({ documentId, anchorSelector, quoteText, startOffset, endOffset, createdBy, initialComment }) {
  await ensureAnnotationSchema();
  const threadsColl = await collection('annotation_threads');
  const commentsColl = await collection('annotation_comments');
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

async function assertThreadInScope(threadId, scope) {
  const threadsColl = await collection('annotation_threads');
  const docsColl = await collection('annotation_documents');
  const thread = await threadsColl.findOne({ id: threadId });
  if (!thread) {
    return false;
  }
  const doc = await docsColl.findOne({
    id: thread.document_id,
    scope_key: scope.scopeKey,
    repo_full_name: scope.repoFullName,
    pr_number: scope.prNumber,
    deployment_key: scope.deploymentKey,
  });
  return Boolean(doc);
}

export async function createComment({ threadId, body, createdBy, scope }) {
  await ensureAnnotationSchema();
  const commentsColl = await collection('annotation_comments');
  const threadsColl = await collection('annotation_threads');
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

async function getThreadIdForCommentInScope(commentId, scope) {
  const commentsColl = await collection('annotation_comments');
  const threadsColl = await collection('annotation_threads');
  const docsColl = await collection('annotation_documents');
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
    repo_full_name: scope.repoFullName,
    pr_number: scope.prNumber,
    deployment_key: scope.deploymentKey,
  });
  return doc ? comment.thread_id : null;
}

export async function updateComment({ commentId, body, scope }) {
  await ensureAnnotationSchema();
  const commentsColl = await collection('annotation_comments');
  const threadsColl = await collection('annotation_threads');
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

export async function deleteComment({ commentId, scope }) {
  await ensureAnnotationSchema();
  const commentsColl = await collection('annotation_comments');
  const threadsColl = await collection('annotation_threads');
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

export async function updateThreadStatus({ threadId, status, scope }) {
  await ensureAnnotationSchema();
  const threadsColl = await collection('annotation_threads');
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

export async function cleanupOldAnnotationData({ olderThanDays = 45 }) {
  await ensureAnnotationSchema();
  const documents = await collection('annotation_documents');
  const threads = await collection('annotation_threads');
  const comments = await collection('annotation_comments');
  const days = Number.isFinite(olderThanDays) ? olderThanDays : 45;
  const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  const oldDocs = await documents.find({ updated_at: { $lt: cutoff } }, { projection: { id: 1 } }).toArray();
  const docIds = oldDocs.map((doc) => doc.id);
  if (docIds.length > 0) {
    const oldThreads = await threads.find({ document_id: { $in: docIds } }, { projection: { id: 1 } }).toArray();
    const threadIds = oldThreads.map((thread) => thread.id);
    if (threadIds.length > 0) {
      await comments.deleteMany({ thread_id: { $in: threadIds } });
      await threads.deleteMany({ id: { $in: threadIds } });
    }
  }
  const deleted = await documents.deleteMany({ updated_at: { $lt: cutoff } });
  return { deletedDocuments: deleted.deletedCount || 0, olderThanDays: days };
}

export async function listScopeOverview(scope) {
  await ensureAnnotationSchema();
  const documents = await collection('annotation_documents');
  const threadsColl = await collection('annotation_threads');
  const commentsColl = await collection('annotation_comments');

  const docsRows = await documents.find({
    scope_key: scope.scopeKey,
    repo_full_name: scope.repoFullName,
    pr_number: scope.prNumber,
    deployment_key: scope.deploymentKey,
  }).sort({ site_path: 1 }).toArray();

  const docIds = docsRows.map((doc) => doc.id);
  const threadsRows = docIds.length > 0
    ? await threadsColl.find({ document_id: { $in: docIds } }).sort({ updated_at: -1 }).toArray()
    : [];
  const threadIds = threadsRows.map((thread) => thread.id);
  const commentsRows = threadIds.length > 0
    ? await commentsColl.find({ thread_id: { $in: threadIds }, deleted_at: null }).toArray()
    : [];
  const commentCountByThreadId = new Map();
  for (const comment of commentsRows) {
    commentCountByThreadId.set(
      comment.thread_id,
      (commentCountByThreadId.get(comment.thread_id) || 0) + 1
    );
  }
  const activeThreads = threadsRows.filter((thread) => (commentCountByThreadId.get(thread.id) || 0) > 0);
  const threadsByDocumentId = new Map();
  for (const thread of activeThreads) {
    if (!threadsByDocumentId.has(thread.document_id)) {
      threadsByDocumentId.set(thread.document_id, []);
    }
    threadsByDocumentId.get(thread.document_id).push(thread);
  }

  return docsRows.map((doc) => {
    const threads = threadsByDocumentId.get(doc.id) || [];
    const commentCount = threads.reduce((sum, thread) => sum + (commentCountByThreadId.get(thread.id) || 0), 0);
    const lastActivityAt = threads[0]?.updated_at || doc.updated_at;
    return {
      documentId: doc.id,
      sitePath: doc.site_path,
      locale: doc.locale,
      threadCount: threads.length,
      commentCount,
      lastActivityAt,
      threads: threads.map((thread) => ({
        id: thread.id,
        status: thread.status,
        updatedAt: thread.updated_at,
        commentCount: commentCountByThreadId.get(thread.id) || 0,
      })),
    };
  });
}
