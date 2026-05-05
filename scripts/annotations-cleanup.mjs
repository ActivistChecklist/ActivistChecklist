import dotenv from 'dotenv';
import { REVIEW_COMMENTS_COLLECTIONS as C } from '@activistchecklist/react-review-comments/server/collections';
import { collection, ensureAnnotationSchema } from '@activistchecklist/react-review-comments/server/db';

dotenv.config();

const daysRaw = process.argv[2] || process.env.REVIEW_COMMENTS_CLEANUP_DAYS || '45';
const days = Number.parseInt(daysRaw, 10);

if (!Number.isFinite(days) || days < 1) {
  console.error('Invalid cleanup days value. Use an integer >= 1.');
  process.exit(1);
}

async function main() {
  const connectionString = process.env.REVIEW_COMMENTS_MONGODB_URL;
  if (!connectionString) {
    throw new Error('Missing REVIEW_COMMENTS_MONGODB_URL');
  }
  await ensureAnnotationSchema();
  const documents = await collection(C.documents);
  const threads = await collection(C.threads);
  const comments = await collection(C.comments);
  const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

  const oldDocs = await documents.find({ updated_at: { $lt: cutoff } }, { projection: { id: 1 } }).toArray();
  const docIds = oldDocs.map((doc) => doc.id);
  let deletedThreads = 0;
  let deletedComments = 0;
  if (docIds.length > 0) {
    const oldThreads = await threads.find({ document_id: { $in: docIds } }, { projection: { id: 1 } }).toArray();
    const threadIds = oldThreads.map((thread) => thread.id);
    if (threadIds.length > 0) {
      const commentDeleteResult = await comments.deleteMany({ thread_id: { $in: threadIds } });
      deletedComments = commentDeleteResult.deletedCount || 0;
      const threadDeleteResult = await threads.deleteMany({ id: { $in: threadIds } });
      deletedThreads = threadDeleteResult.deletedCount || 0;
    }
  }
  const docDeleteResult = await documents.deleteMany({ updated_at: { $lt: cutoff } });
  const deletedDocuments = docDeleteResult.deletedCount || 0;
  console.log(`Review comments cleanup complete. Deleted docs: ${deletedDocuments}, threads: ${deletedThreads}, comments: ${deletedComments}. TTL days: ${days}.`);
}

main().catch((error) => {
  console.error('Review comments cleanup failed:', error?.message || error);
  process.exit(1);
});
