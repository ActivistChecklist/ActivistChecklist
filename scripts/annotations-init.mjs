import dotenv from 'dotenv';
import { collection, ensureAnnotationSchema } from '../lib/annotations/db.js';

dotenv.config();

async function main() {
  const connectionString = process.env.ANNOTATIONS_MONGODB_URL || process.env.MONGODB_URL;
  if (!connectionString) {
    throw new Error('Missing ANNOTATIONS_MONGODB_URL or MONGODB_URL');
  }
  await ensureAnnotationSchema();
  const names = ['annotation_documents', 'annotation_threads', 'annotation_comments'];
  const counts = {};
  for (const name of names) {
    counts[name] = await (await collection(name)).countDocuments();
  }
  console.log('Annotation Mongo indexes ensured.');
  console.log('Collections:', names.join(', '));
  console.log('Document counts:', JSON.stringify(counts));
}

main().catch((error) => {
  const msg = error?.message || String(error);
  console.error('annotations-init failed:', msg);
  if (msg.includes('ECONNREFUSED') || msg.includes('MongoServerSelectionError')) {
    console.error('Hint: start Mongo and verify ANNOTATIONS_MONGODB_URL points to it.');
  }
  process.exit(1);
});
