// =============================================================================
// IVR Studio: Flow Routes (CRUD + Draft Save + Publish + Rollback)
// =============================================================================

'use strict';

const pool = require('../db');
const { validateAndCompile, computeChecksum } = require('../compiler/graphCompiler');

module.exports = async function flowRoutes(fastify) {

  // ---------------------------------------------------------------------------
  // GET /api/flows?domainUuid=...
  // List all flows for a domain
  // ---------------------------------------------------------------------------
  fastify.get('/flows', async (req, reply) => {
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const { rows } = await pool.query(
      `SELECT f.flow_id, f.domain_uuid, f.name, f.description,
              f.draft_graph, f.draft_updated_at, f.created_at, f.updated_at,
              v.version_id     AS published_version_id,
              v.version_number AS published_version_number,
              v.published_at
       FROM ivr_studio.ivr_flows f
       LEFT JOIN ivr_studio.ivr_versions v
         ON v.flow_id = f.flow_id AND v.status = 'published'
       WHERE f.domain_uuid = $1 AND f.is_deleted = false
       ORDER BY f.name`,
      [domainUuid]
    );
    return rows;
  });

  // ---------------------------------------------------------------------------
  // GET /api/flows/:flowId
  // Get a single flow with draft graph
  // ---------------------------------------------------------------------------
  fastify.get('/flows/:flowId', async (req, reply) => {
    const { flowId } = req.params;
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const { rows } = await pool.query(
      `SELECT * FROM ivr_studio.ivr_flows
       WHERE flow_id = $1 AND domain_uuid = $2 AND is_deleted = false`,
      [flowId, domainUuid]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Flow not found' });
    return rows[0];
  });

  // ---------------------------------------------------------------------------
  // POST /api/flows
  // Create a new flow (starts as draft with empty graph)
  // ---------------------------------------------------------------------------
  fastify.post('/flows', async (req, reply) => {
    const { domainUuid, name, description } = req.body;
    if (!domainUuid || !name) {
      return reply.code(400).send({ error: 'domainUuid and name required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO ivr_studio.ivr_flows (domain_uuid, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [domainUuid, name, description || null]
    );
    return reply.code(201).send(rows[0]);
  });

  // ---------------------------------------------------------------------------
  // PUT /api/flows/:flowId
  // Save draft graph (no version bump — just overwrites draft_graph)
  // ---------------------------------------------------------------------------
  fastify.put('/flows/:flowId', async (req, reply) => {
    const { flowId } = req.params;
    const { domainUuid, name, description, draftGraph } = req.body;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const { rows } = await pool.query(
      `UPDATE ivr_studio.ivr_flows
       SET name             = COALESCE($3, name),
           description      = COALESCE($4, description),
           draft_graph      = COALESCE($5, draft_graph),
           draft_updated_at = NOW(),
           updated_at       = NOW()
       WHERE flow_id = $1 AND domain_uuid = $2 AND is_deleted = false
       RETURNING *`,
      [flowId, domainUuid, name || null, description || null,
       draftGraph ? JSON.stringify(draftGraph) : null]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Flow not found' });
    return rows[0];
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/flows/:flowId
  // Soft-delete a flow
  // ---------------------------------------------------------------------------
  fastify.delete('/flows/:flowId', async (req, reply) => {
    const { flowId } = req.params;
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    await pool.query(
      `UPDATE ivr_studio.ivr_flows
       SET is_deleted = true, updated_at = NOW()
       WHERE flow_id = $1 AND domain_uuid = $2`,
      [flowId, domainUuid]
    );
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------------------
  // POST /api/flows/:flowId/publish
  // Validate draft graph → compile → create new published version
  // ---------------------------------------------------------------------------
  fastify.post('/flows/:flowId/publish', async (req, reply) => {
    const { flowId } = req.params;
    const { domainUuid, publishedBy } = req.body;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch flow and draft
      const { rows: flowRows } = await client.query(
        `SELECT * FROM ivr_studio.ivr_flows
         WHERE flow_id = $1 AND domain_uuid = $2 AND is_deleted = false`,
        [flowId, domainUuid]
      );
      if (flowRows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Flow not found' });
      }

      const flow = flowRows[0];
      if (!flow.draft_graph) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'No draft graph to publish' });
      }

      const reactFlowGraph = typeof flow.draft_graph === 'string'
        ? JSON.parse(flow.draft_graph)
        : flow.draft_graph;

      // Validate + compile
      const { ok, errors, executionGraph } = validateAndCompile(reactFlowGraph);
      if (!ok) {
        await client.query('ROLLBACK');
        return reply.code(422).send({ error: 'Graph validation failed', errors });
      }

      const checksum = computeChecksum(executionGraph);

      // Get next version number
      const { rows: verRows } = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
         FROM ivr_studio.ivr_versions WHERE flow_id = $1`,
        [flowId]
      );
      const nextVersion = verRows[0].next_version;

      // Archive current published version
      await client.query(
        `UPDATE ivr_studio.ivr_versions
         SET status = 'archived'
         WHERE flow_id = $1 AND status = 'published'`,
        [flowId]
      );

      // Insert new published version
      const { rows: newVer } = await client.query(
        `INSERT INTO ivr_studio.ivr_versions
           (flow_id, domain_uuid, version_number, status, execution_graph,
            raw_graph, published_by, checksum)
         VALUES ($1, $2, $3, 'published', $4::jsonb, $5::jsonb, $6, $7)
         RETURNING *`,
        [
          flowId, domainUuid, nextVersion,
          JSON.stringify(executionGraph),
          JSON.stringify(reactFlowGraph),
          publishedBy || null,
          checksum,
        ]
      );

      await client.query('COMMIT');
      return reply.code(201).send({
        version: newVer[0],
        executionGraph,
      });

    } catch (err) {
      await client.query('ROLLBACK');
      req.log.error({ err }, 'Publish failed');
      return reply.code(500).send({ error: 'Publish failed', detail: err.message });
    } finally {
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/flows/:flowId/rollback/:versionId
  // Set a specific archived version back to published
  // ---------------------------------------------------------------------------
  fastify.post('/flows/:flowId/rollback/:versionId', async (req, reply) => {
    const { flowId, versionId } = req.params;
    const { domainUuid } = req.body;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify the target version exists and belongs to this flow/domain
      const { rows: targetRows } = await client.query(
        `SELECT * FROM ivr_studio.ivr_versions
         WHERE version_id = $1 AND flow_id = $2 AND domain_uuid = $3`,
        [versionId, flowId, domainUuid]
      );
      if (targetRows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Version not found' });
      }

      // Archive current published
      await client.query(
        `UPDATE ivr_studio.ivr_versions
         SET status = 'archived'
         WHERE flow_id = $1 AND status = 'published'`,
        [flowId]
      );

      // Promote target to published
      await client.query(
        `UPDATE ivr_studio.ivr_versions
         SET status = 'published', published_at = NOW()
         WHERE version_id = $1`,
        [versionId]
      );

      await client.query('COMMIT');
      return { message: 'Rollback successful', versionId };

    } catch (err) {
      await client.query('ROLLBACK');
      return reply.code(500).send({ error: 'Rollback failed', detail: err.message });
    } finally {
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/flows/:flowId/validate
  // Validate the current draft graph without publishing (for UI feedback)
  // ---------------------------------------------------------------------------
  fastify.post('/flows/:flowId/validate', async (req, reply) => {
    const { flowId } = req.params;
    const { domainUuid, graph } = req.body;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const reactFlowGraph = graph || (await (async () => {
      const { rows } = await pool.query(
        `SELECT draft_graph FROM ivr_studio.ivr_flows
         WHERE flow_id = $1 AND domain_uuid = $2`,
        [flowId, domainUuid]
      );
      return rows[0]?.draft_graph;
    })());

    if (!reactFlowGraph) {
      return reply.code(400).send({ error: 'No graph to validate' });
    }

    const { ok, errors, executionGraph } = validateAndCompile(
      typeof reactFlowGraph === 'string' ? JSON.parse(reactFlowGraph) : reactFlowGraph
    );

    return { ok, errors, executionGraph };
  });
};
