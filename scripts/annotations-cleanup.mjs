import dotenv from 'dotenv';
import { collection, ensureAnnotationSchema } from '../lib/annotations/db.js';

dotenv.config();

const daysRaw = process.argv[2] || process.env.ANNOTATIONS_CLEANUP_DAYS || '45';
const days = Number.parseInt(daysRaw, 10);

if (!Number.isFinite(days) || days < 1) {
  console.error('Invalid cleanup days value. Use an integer >= 1.');
  process.exit(1);
}

async function main() {
  const connectionString = process.env.ANNOTATIONS_MONGODB_URL || process.env.MONGODB_URL;
  if (!connectionString) {
    throw new Error('Missing ANNOTATIONS_MONGODB_URL or MONGODB_URL');
  }
  await ensureAnnotationSchema();
  const documents = await collection('annotation_documents');
  const threads = await collection('annotation_threads');
  const comments = await collection('annotation_comments');
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
  console.log(`Annotations cleanup complete. Deleted docs: ${deletedDocuments}, threads: ${deletedThreads}, comments: ${deletedComments}. TTL days: ${days}.`);
}

main().catch((error) => {
  console.error('Annotations cleanup failed:', error?.message || error);
  process.exit(1);
});
