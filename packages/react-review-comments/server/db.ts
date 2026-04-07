import { MongoClient, type Collection, type Db } from 'mongodb';
import { REVIEW_COMMENTS_COLLECTIONS as C } from './collections';

let client: MongoClient | undefined;
let db: Db | undefined;
let bootstrapReady = false;

function getConnectionString(): string {
  return process.env.REVIEW_COMMENTS_MONGODB_URL || '';
}

function getDatabaseNameFromUrl(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    const pathname = String(parsed.pathname || '').replace(/^\//, '');
    return pathname || 'review_comments';
  } catch {
    return 'review_comments';
  }
}

async function getDb(): Promise<Db> {
  if (db) {
    return db;
  }
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('Missing REVIEW_COMMENTS_MONGODB_URL');
  }
  client = new MongoClient(connectionString);
  await client.connect();
  db = client.db(getDatabaseNameFromUrl(connectionString));
  return db;
}

export async function collection<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string
): Promise<Collection<T>> {
  const database = await getDb();
  return database.collection<T>(name);
}

export async function ensureAnnotationSchema(): Promise<void> {
  if (bootstrapReady) {
    return;
  }

  const documents = await collection(C.documents);
  const threads = await collection(C.threads);
  const comments = await collection(C.comments);

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
