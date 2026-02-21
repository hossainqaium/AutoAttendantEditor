// =============================================================================
// IVR Studio: Domain Routes
// Reads FusionPBX v_domains — exposes tenant list to the Studio UI
// =============================================================================

'use strict';

const pool = require('../db');

module.exports = async function domainRoutes(fastify) {
  // GET /api/domains — list all active FusionPBX domains
  fastify.get('/domains', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT domain_uuid, domain_name, domain_description, domain_enabled
       FROM public.v_domains
       WHERE domain_enabled = 'true'
       ORDER BY domain_name`
    );
    return rows;
  });

  // GET /api/domains/:domainUuid — get a single domain
  fastify.get('/domains/:domainUuid', async (req, reply) => {
    const { domainUuid } = req.params;
    const { rows } = await pool.query(
      `SELECT domain_uuid, domain_name, domain_description, domain_enabled
       FROM public.v_domains
       WHERE domain_uuid = $1`,
      [domainUuid]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Domain not found' });
    return rows[0];
  });
};
