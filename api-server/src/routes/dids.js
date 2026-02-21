'use strict';

const pool = require('../db');
const { upsertDialplanEntry, deleteDialplanEntry } = require('../services/dialplanService');

module.exports = async function didRoutes(fastify) {

  // GET /api/dids?domainUuid=...
  fastify.get('/dids', async (req, reply) => {
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const { rows } = await pool.query(
      `SELECT r.route_id, r.destination, r.flow_id, r.enabled, r.created_at,
              r.route_type, f.name AS flow_name, r.domain_uuid
       FROM ivr_studio.ivr_did_routes r
       JOIN ivr_studio.ivr_flows f ON f.flow_id = r.flow_id
       WHERE r.domain_uuid = $1
       ORDER BY r.destination`,
      [domainUuid]
    );
    return rows;
  });

  // POST /api/dids — assign a destination (DID or extension) to a flow
  fastify.post('/dids', async (req, reply) => {
    const { domainUuid, destination, flowId, routeType = 'both' } = req.body;
    if (!domainUuid || !destination || !flowId) {
      return reply.code(400).send({ error: 'domainUuid, destination, flowId required' });
    }
    if (!['both', 'public', 'internal'].includes(routeType)) {
      return reply.code(400).send({ error: 'routeType must be both | public | internal' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify flow exists and belongs to domain
      const { rows: flowRows } = await client.query(
        `SELECT flow_id, name FROM ivr_studio.ivr_flows
         WHERE flow_id = $1 AND domain_uuid = $2 AND is_deleted = false`,
        [flowId, domainUuid]
      );
      if (flowRows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Flow not found' });
      }

      // Verify flow has a published version
      const { rows: verRows } = await client.query(
        `SELECT version_id FROM ivr_studio.ivr_versions
         WHERE flow_id = $1 AND status = 'published' LIMIT 1`,
        [flowId]
      );
      if (verRows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(400).send({
          error: 'Flow must be published before assigning an extension or DID.',
        });
      }

      // Get domain name for the internal context
      const { rows: domainRows } = await client.query(
        `SELECT domain_name FROM public.v_domains WHERE domain_uuid = $1`,
        [domainUuid]
      );
      const domainName = domainRows[0]?.domain_name || domainUuid;

      // Upsert ivr_did_routes (add route_type column if schema supports it)
      const { rows: routeRows } = await client.query(
        `INSERT INTO ivr_studio.ivr_did_routes (domain_uuid, destination, flow_id, route_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (domain_uuid, destination)
         DO UPDATE SET flow_id = EXCLUDED.flow_id, enabled = true,
                       route_type = EXCLUDED.route_type
         RETURNING *`,
        [domainUuid, destination, flowId, routeType]
      );

      // Upsert FusionPBX v_dialplans entries (live — no reload needed)
      await upsertDialplanEntry(client, {
        domainUuid,
        domainName,
        destination,
        flowName: flowRows[0].name,
        routeType,
      });

      await client.query('COMMIT');
      return reply.code(201).send({ ...routeRows[0], flow_name: flowRows[0].name, domain_uuid: domainUuid });

    } catch (err) {
      await client.query('ROLLBACK');
      req.log.error({ err }, 'DID/Extension assignment failed');
      return reply.code(500).send({ error: 'Assignment failed', detail: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE /api/dids/:routeId
  fastify.delete('/dids/:routeId', async (req, reply) => {
    const { routeId } = req.params;
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `DELETE FROM ivr_studio.ivr_did_routes
         WHERE route_id = $1 AND domain_uuid = $2
         RETURNING destination`,
        [routeId, domainUuid]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Route not found' });
      }

      await deleteDialplanEntry(client, { domainUuid, destination: rows[0].destination });
      await client.query('COMMIT');
      return reply.code(204).send();

    } catch (err) {
      await client.query('ROLLBACK');
      return reply.code(500).send({ error: 'Delete failed', detail: err.message });
    } finally {
      client.release();
    }
  });
};
