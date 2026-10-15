import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'echo_chat',
    user: process.env.PGUSER ?? 'echo_chat',
    password: process.env.PGPASSWORD ?? 'local_echo_password',
    max: 15,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

export async function initializeDatabase() {
    const schemaPath = new URL('../schema.sql', import.meta.url);
    const schema = await readFile(fileURLToPath(schemaPath), 'utf8');
    await pool.query(schema);
}