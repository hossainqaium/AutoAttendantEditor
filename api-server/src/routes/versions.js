// =============================================================================
// IVR Studio: Version History Routes
// =============================================================================

'use strict';

const pool = require('../db');

module.exports = async function versionRoutes(fastify) {

  // GET /api/flows/:flowId/versions?domainUuid=...
  fastify.get('/flows/:flowId/versions', async (req, reply) => {
    const { flowId } = req.params;
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const { rows } = await pool.query(
      `SELECT version_id, flow_id, version_number, status,
              published_by, published_at, checksum
       FROM ivr_studio.ivr_versions
       WHERE flow_id = $1 AND domain_uuid = $2
       ORDER BY version_number DESC`,
      [flowId, domainUuid]
    );
    return rows;
  });

  // GET /api/flows/:flowId/versions/:versionId — get full version including graphs
  fastify.get('/flows/:flowId/versions/:versionId', async (req, reply) => {
    const { flowId, versionId } = req.params;
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const { rows } = await pool.query(
      `SELECT * FROM ivr_studio.ivr_versions
       WHERE version_id = $1 AND flow_id = $2 AND domain_uuid = $3`,
      [versionId, flowId, domainUuid]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Version not found' });
    return rows[0];
  });
};
