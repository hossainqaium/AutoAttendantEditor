// =============================================================================
// IVR Studio API Server: Database Connection (pg pool → FusionPBX PostgreSQL)
// =============================================================================

'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'fusionpbx',
  user:     process.env.DB_USER     || 'fusionpbx',
  password: process.env.DB_PASSWORD || 'fusionpbx',
  max:      parseInt(process.env.DB_POOL_MAX || '10'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

module.exports = pool;
