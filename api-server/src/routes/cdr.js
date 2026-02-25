// =============================================================================
// IVR Studio: FusionPBX CDR (Call Detail Records) — filter by datetime & extensions
// Tries public.v_xml_cdr first, then public.xml_cdr (FusionPBX varies by install).
// =============================================================================

'use strict';

const pool = require('../db');

const CDR_SELECT = `
  c.sip_call_id,
  c.domain_uuid,
  c.start_stamp,
  c.answer_stamp,
  c.end_stamp,
  c.direction,
  e.extension,
  e.effective_caller_id_name AS extension_name,
  c.caller_id_name,
  c.caller_id_number,
  c.caller_destination,
  c.destination_number,
  c.context,
  c.billsec AS duration,
  c.waitsec AS wait_sec,
  c.hangup_cause,
  c.status,
  c.sip_hangup_disposition,
  c.missed_call,
  c.record_path,
  c.record_name,
  c.read_codec,
  c.write_codec
`;

function buildCdrSql(tableName, where) {
  return `
    SELECT ${CDR_SELECT}
    FROM public.${tableName} c
    LEFT JOIN public.v_extensions e ON e.extension_uuid = c.extension_uuid AND e.domain_uuid = c.domain_uuid
    WHERE ${where}
    ORDER BY c.start_stamp DESC
    LIMIT 500
  `;
}

async function cdrHandler(req, reply) {
  const { domainUuid, startDateTime, endDateTime, extensions } = req.query;
  if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

  const params = [domainUuid];
  let where = 'c.domain_uuid = $1';

  if (startDateTime) {
    params.push(startDateTime);
    where += ` AND c.start_stamp >= $${params.length}::timestamptz`;
  }
  if (endDateTime) {
    params.push(endDateTime);
    where += ` AND c.start_stamp <= $${params.length}::timestamptz`;
  }

  if (extensions && typeof extensions === 'string' && extensions.trim()) {
    const extList = extensions.split(',').map((e) => e.trim()).filter(Boolean);
    if (extList.length > 0) {
      params.push(extList);
      where += ` AND e.extension = ANY($${params.length}::text[])`;
    }
  }

  const log = req.log;
  const tablesToTry = ['v_xml_cdr', 'xml_cdr'];
  for (const tableName of tablesToTry) {
    try {
      const sql = buildCdrSql(tableName, where);
      const { rows } = await pool.query(sql, params);
      return rows;
    } catch (err) {
      if (err.code === '42P01') {
        if (log) log.debug({ tableName }, 'CDR table not found, trying next');
        continue;
      }
      if (log) log.error({ err, tableName }, 'cdr query failed');
      throw err;
    }
  }

  return reply.code(503).send({
    error: 'CDR table not available',
    detail: 'Neither v_xml_cdr nor xml_cdr found in the FusionPBX database. Enable CDR in FusionPBX.',
  });
}

module.exports = async function cdrRoutes(fastify) {
  // Registered with /api prefix in index.js
  fastify.get('/cdr', cdrHandler);
};
