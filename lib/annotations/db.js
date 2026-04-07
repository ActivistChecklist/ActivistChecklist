import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

let pool;
let bootstrapReady = false;

function getConnectionString() {
  return process.env.ANNOTATIONS_DATABASE_URL || process.env.DATABASE_URL || '';
}

function getPool() {
  if (pool) {
    return pool;
  }
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('Missing ANNOTATIONS_DATABASE_URL or DATABASE_URL');
  }
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  return pool;
}

export async function query(text, params = []) {
  const db = getPool();
  return db.query(text, params);
}

export async function ensureAnnotationSchema() {
  if (bootstrapReady) {
    return;
  }

  const schemaPath = path.join(process.cwd(), 'lib', 'annotations', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await query(schemaSql);

  await query(`
    CREATE TABLE IF NOT EXISTS annotation_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(process.cwd(), 'lib', 'annotations', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const fileName of files) {
      const migrationId = fileName.replace(/\.sql$/i, '');
      const alreadyApplied = await query(
        `SELECT 1 FROM annotation_migrations WHERE id = $1 LIMIT 1`,
        [migrationId]
      );
      if (alreadyApplied.rows[0]) {
        continue;
      }

      const migrationPath = path.join(migrationsDir, fileName);
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      await query('BEGIN');
      try {
        await query(migrationSql);
        await query(
          `INSERT INTO annotation_migrations (id) VALUES ($1)`,
          [migrationId]
        );
        await query('COMMIT');
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    }
  }

  bootstrapReady = true;
}
