import { MongoClient } from 'mongodb';

let client;
let db;
let bootstrapReady = false;

function getConnectionString() {
  return process.env.ANNOTATIONS_MONGODB_URL || process.env.MONGODB_URL || '';
}

function getDatabaseNameFromUrl(connectionString) {
  try {
    const parsed = new URL(connectionString);
    const pathname = String(parsed.pathname || '').replace(/^\//, '');
    return pathname || 'annotations';
  } catch (_err) {
    return 'annotations';
  }
}

async function getDb() {
  if (db) {
    return db;
  }
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('Missing ANNOTATIONS_MONGODB_URL or MONGODB_URL');
  }
  client = new MongoClient(connectionString);
  await client.connect();
  db = client.db(getDatabaseNameFromUrl(connectionString));
  return db;
}

export async function collection(name) {
  const database = await getDb();
  return database.collection(name);
}

export async function ensureAnnotationSchema() {
  if (bootstrapReady) {
    return;
  }

  const documents = await collection('annotation_documents');
  const threads = await collection('annotation_threads');
  const comments = await collection('annotation_comments');

  await documents.createIndex(
    { scope_key: 1, site_path: 1, locale: 1 },
    { unique: true, name: 'uniq_scope_path_locale' }
  );
  await documents.createIndex(
    { repo_full_name: 1, pr_number: 1, deployment_key: 1 },
    { name: 'idx_documents_scope' }
  );

  await threads.createIndex({ document_id: 1, created_at: 1 }, { name: 'idx_threads_document_created' });
  await threads.createIndex({ updated_at: -1 }, { name: 'idx_threads_updated' });

  await comments.createIndex({ thread_id: 1, created_at: 1 }, { name: 'idx_comments_thread_created' });
  await comments.createIndex({ thread_id: 1, deleted_at: 1 }, { name: 'idx_comments_thread_deleted' });

  bootstrapReady = true;
}
