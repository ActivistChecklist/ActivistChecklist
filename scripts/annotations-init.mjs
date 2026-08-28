import dotenv from 'dotenv';
import { REVIEW_COMMENTS_COLLECTIONS } from '@activistchecklist/react-review-comments/server/collections';
import { collection, ensureAnnotationSchema } from '@activistchecklist/react-review-comments/server/db';

dotenv.config();

async function main() {
  const connectionString = process.env.REVIEW_COMMENTS_MONGODB_URL;
  if (!connectionString) {
    throw new Error('Missing REVIEW_COMMENTS_MONGODB_URL');
  }
  await ensureAnnotationSchema();
  const names = Object.values(REVIEW_COMMENTS_COLLECTIONS);
  const counts = {};
  for (const name of names) {
    counts[name] = await (await collection(name)).countDocuments();
  }
  console.log('Review comments Mongo indexes ensured.');
  console.log('Collections:', names.join(', '));
  console.log('Document counts:', JSON.stringify(counts));
}

main().catch((error) => {
  const msg = error?.message || String(error);
  console.error('annotations-init failed:', msg);
  if (msg.includes('ECONNREFUSED') || msg.includes('MongoServerSelectionError')) {
    console.error('Hint: start Mongo and verify REVIEW_COMMENTS_MONGODB_URL points to it.');
  }
  process.exit(1);
});
