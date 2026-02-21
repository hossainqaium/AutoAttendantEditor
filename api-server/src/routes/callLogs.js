// =============================================================================
// IVR Studio: Call Log Routes
// =============================================================================

'use strict';

const pool = require('../db');

module.exports = async function callLogRoutes(fastify) {

  // GET /api/call-logs?domainUuid=...&flowId=...&limit=50&offset=0
  fastify.get('/call-logs', async (req, reply) => {
    const { domainUuid, flowId, limit = 50, offset = 0 } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const params = [domainUuid, parseInt(limit), parseInt(offset)];
    let where = 'domain_uuid = $1';
    if (flowId) {
      where += ' AND flow_id = $4';
      params.push(flowId);
    }

    const { rows } = await pool.query(
      `SELECT log_id, trace_id, flow_id, call_uuid, ani, dnis,
              started_at, ended_at, disposition,
              EXTRACT(EPOCH FROM (ended_at - started_at)) AS duration_secs
       FROM ivr_studio.call_logs
       WHERE ${where}
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    return rows;
  });

  // GET /api/call-logs/:logId — full trace including node_trace and api_calls
  fastify.get('/call-logs/:logId', async (req, reply) => {
    const { logId } = req.params;
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const { rows } = await pool.query(
      `SELECT * FROM ivr_studio.call_logs
       WHERE log_id = $1 AND domain_uuid = $2`,
      [logId, domainUuid]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Log not found' });
    return rows[0];
  });
};
