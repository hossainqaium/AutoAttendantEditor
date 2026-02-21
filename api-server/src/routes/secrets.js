// =============================================================================
// IVR Studio: Flow Secrets Management
// Stores API credentials referenced as {{secret:key_name}} in node configs
// =============================================================================

'use strict';

const pool = require('../db');
const crypto = require('crypto');

const ENCRYPTION_KEY_ENV = 'IVR_SECRET_KEY';  // 32-byte hex key in env

function getEncryptionKey() {
  const key = process.env[ENCRYPTION_KEY_ENV];
  if (!key || key.length < 32) {
    throw new Error(`${ENCRYPTION_KEY_ENV} env var not set or too short (need 32+ chars)`);
  }
  return Buffer.from(key.slice(0, 64), 'hex').subarray(0, 32);
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(ciphertext) {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv  = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

module.exports = async function secretRoutes(fastify) {

  // GET /api/secrets?domainUuid=... — list secret key names (NOT values)
  fastify.get('/secrets', async (req, reply) => {
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const { rows } = await pool.query(
      `SELECT secret_id, key_name, created_at, updated_at
       FROM ivr_studio.flow_secrets
       WHERE domain_uuid = $1
       ORDER BY key_name`,
      [domainUuid]
    );
    return rows;
  });

  // PUT /api/secrets — create or update a secret
  fastify.put('/secrets', async (req, reply) => {
    const { domainUuid, keyName, value } = req.body;
    if (!domainUuid || !keyName || !value) {
      return reply.code(400).send({ error: 'domainUuid, keyName, value required' });
    }

    const encrypted = encrypt(value);

    const { rows } = await pool.query(
      `INSERT INTO ivr_studio.flow_secrets (domain_uuid, key_name, encrypted_value)
       VALUES ($1, $2, $3)
       ON CONFLICT (domain_uuid, key_name)
       DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, updated_at = NOW()
       RETURNING secret_id, key_name, created_at, updated_at`,
      [domainUuid, keyName, encrypted]
    );
    return rows[0];
  });

  // DELETE /api/secrets/:secretId
  fastify.delete('/secrets/:secretId', async (req, reply) => {
    const { secretId } = req.params;
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    await pool.query(
      `DELETE FROM ivr_studio.flow_secrets
       WHERE secret_id = $1 AND domain_uuid = $2`,
      [secretId, domainUuid]
    );
    return reply.code(204).send();
  });
};
