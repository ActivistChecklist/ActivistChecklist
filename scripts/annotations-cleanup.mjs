import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const daysRaw = process.argv[2] || process.env.ANNOTATIONS_CLEANUP_DAYS || '45';
const days = Number.parseInt(daysRaw, 10);

if (!Number.isFinite(days) || days < 1) {
  console.error('Invalid cleanup days value. Use an integer >= 1.');
  process.exit(1);
}

async function main() {
  const connectionString = process.env.ANNOTATIONS_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing ANNOTATIONS_DATABASE_URL or DATABASE_URL');
  }
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const result = await pool.query(
      `DELETE FROM annotation_documents
       WHERE updated_at < NOW() - ($1::text || ' days')::interval`,
      [String(days)]
    );
    console.log(`Annotations cleanup complete. Deleted documents: ${result.rowCount || 0}. TTL days: ${days}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Annotations cleanup failed:', error?.message || error);
  process.exit(1);
});
