// =============================================================================
// IVR Studio API Server
// Fastify-based REST API sitting alongside FusionPBX.
// Connects to FusionPBX's PostgreSQL database.
// =============================================================================

'use strict';

// Load .env if present (before any other require that reads process.env)
const fs   = require('fs');
const path = require('path');
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
}

const Fastify   = require('fastify');
const cors      = require('@fastify/cors');
const multipart = require('@fastify/multipart');

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  // Don't throw a 400 when DELETE/GET requests arrive with an empty body
  // even if Content-Type: application/json is present
  onProtoPoisoning: 'remove',
  onConstructorPoisoning: 'remove',
});

// Ignore body-parse errors on bodyless methods (DELETE, GET)
app.addHook('onError', (request, reply, error, done) => {
  if (error.statusCode === 400 && error.message?.includes('Body')) {
    reply.code(400).send({ error: 'Bad request', detail: error.message });
  }
  done();
});

// Add a content-type parser that accepts empty bodies gracefully
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body || body === '') { done(null, {}); return; }
  try { done(null, JSON.parse(body)); }
  catch (e) { done(new Error('Invalid JSON'), undefined); }
});

async function start() {
  // CORS — allow Studio UI origin
  await app.register(cors, {
    origin: process.env.STUDIO_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Multipart form support (for audio file uploads)
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // API routes (all prefixed with /api)
  await app.register(async function apiRoutes(fastify) {
    await fastify.register(require('./routes/domains'));
    await fastify.register(require('./routes/flows'));
    await fastify.register(require('./routes/versions'));
    await fastify.register(require('./routes/dids'));
    await fastify.register(require('./routes/secrets'));
    await fastify.register(require('./routes/callLogs'));
    await fastify.register(require('./routes/cdr'));
    await fastify.register(require('./routes/assets'));
    await fastify.register(require('./routes/extensions'));
  }, { prefix: '/api' });

  // Global error handler
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err, url: req.url }, 'Request error');
    if (err.statusCode) {
      reply.code(err.statusCode).send({ error: err.message });
    } else {
      reply.code(500).send({ error: 'Internal server error' });
    }
  });

  const host = process.env.HOST || '0.0.0.0';
  const port = parseInt(process.env.PORT || '3002');

  await app.listen({ host, port });
  app.log.info(`IVR Studio API listening on http://${host}:${port}`);
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
