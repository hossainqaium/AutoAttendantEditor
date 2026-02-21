// Run database migrations against FusionPBX's PostgreSQL
'use strict';

const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

// Load .env from api-server/ directory
const envFile = path.join(__dirname, '../.env');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  console.log('Loaded .env from', envFile);
}

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'fusionpbx',
  user:     process.env.DB_USER     || 'fusionpbx',
  password: process.env.DB_PASSWORD || 'fusionpbx',
});

async function migrate() {
  const migrationFile = path.join(__dirname, '../../db/migrations/001_ivr_studio_schema.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');
  console.log('Running migration:', migrationFile);
  await pool.query(sql);
  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
