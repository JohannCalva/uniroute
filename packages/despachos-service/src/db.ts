import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[despachos-service] Unexpected PostgreSQL error:', err);
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const result = await pool.query<{ ok: number }>('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  } catch (err) {
    console.error('[despachos-service] Failed to check DB connection', err);
    return false;
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}
