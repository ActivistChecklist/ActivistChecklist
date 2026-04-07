/**
 * Applies lib/annotations/schema.sql and pending SQL migrations to the DB.
 * Uses ANNOTATIONS_DATABASE_URL or DATABASE_URL from .env.
 *
 * Create the database first if needed, e.g.:
 *   createdb annotations
 *   # or: psql -U postgres -c "CREATE DATABASE annotations;"
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../lib/annotations/schema.sql');
const migrationsDir = path.join(__dirname, '../lib/annotations/migrations');

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
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS annotation_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = [];
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b));

      for (const fileName of migrationFiles) {
        const id = fileName.replace(/\.sql$/i, '');
        const existing = await pool.query(
          `SELECT 1 FROM annotation_migrations WHERE id = $1 LIMIT 1`,
          [id]
        );
        if (existing.rows[0]) {
          continue;
        }
        const migrationSql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
        await pool.query('BEGIN');
        try {
          await pool.query(migrationSql);
          await pool.query(`INSERT INTO annotation_migrations (id) VALUES ($1)`, [id]);
          await pool.query('COMMIT');
          applied.push(id);
        } catch (error) {
          await pool.query('ROLLBACK');
          throw error;
        }
      }
    }

    const tables = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'annotation_%' ORDER BY tablename`
    );
    console.log('Annotation schema + migrations applied.');
    console.log('New migrations applied:', applied.length > 0 ? applied.join(', ') : '(none)');
    console.log('Tables:', tables.rows.map((r) => r.tablename).join(', ') || '(none matched)');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const msg = error?.message || String(error);
  console.error('annotations-init failed:', msg);
  if (/database .* does not exist/i.test(msg)) {
    console.error('Hint: create the database first, e.g. `createdb annotations` or `psql -U <user> -c "CREATE DATABASE annotations;"`.');
  }
  if (msg.includes('role') && msg.includes('does not exist')) {
    console.error('Hint: Postgres has no user "postgres" on this machine. Use your OS user in the URL, e.g. postgresql://' + (process.env.USER || 'you') + '@localhost:5432/annotations');
  }
  process.exit(1);
});
