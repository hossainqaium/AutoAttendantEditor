// =============================================================================
// IVR Studio: Extension Routes
// CRUD for FusionPBX extensions (v_extensions table)
// Voicemail: same columns and dir creation as FusionPBX app/extensions/extension_edit.php
// =============================================================================

'use strict';

const pool = require('../db');
const { randomUUID } = require('crypto');
const { parseSshTarget, sshExec } = require('../lib/ssh');

const VM_DIR = process.env.FS_VOICEMAIL_DIR || '/var/lib/freeswitch/storage/voicemail';

async function ensureVoicemailDir(domainName, voicemailId, log) {
  const cfg = parseSshTarget();
  if (!cfg || !cfg.password) return;
  const dir = `${VM_DIR}/default/${domainName}/${voicemailId}`;
  const { code, stderr } = await sshExec(cfg, `mkdir -p "${dir}" && chown www-data:www-data "${dir}" 2>/dev/null || true`, 8000);
  if (code !== 0 && stderr) log?.warn({ stderr, dir }, 'voicemail mkdir');
}

function insertVoicemailRow(pool, opts) {
  const {
    domainUuid,
    voicemailUuid,
    voicemailId,
    voicemailPassword,
    voicemailDescription = null,
  } = opts;
  return pool.query(
    `INSERT INTO public.v_voicemails (
       voicemail_uuid, domain_uuid, voicemail_id, voicemail_password,
       voicemail_mail_to, voicemail_file, voicemail_local_after_email,
       voicemail_transcription_enabled, voicemail_tutorial, voicemail_enabled,
       voicemail_description, insert_date, insert_user, update_date, update_user
     ) VALUES (
       $1, $2, $3, $4,
       null, 'attach', 'true',
       'false', 'true', 'true',
       $5, NOW(), null, NOW(), null
     )`,
    [
      voicemailUuid,
      domainUuid,
      voicemailId,
      voicemailPassword,
      voicemailDescription,
    ]
  );
}

module.exports = async function extensionRoutes(fastify) {
  // GET /api/extensions — list extensions for a domain
  fastify.get('/extensions', async (req, reply) => {
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const { rows } = await pool.query(
      `SELECT e.extension_uuid, e.domain_uuid, e.extension,
              COALESCE(e.effective_caller_id_name, e.extension) AS effective_caller_id_name,
              e.effective_caller_id_number, e.description, e.enabled,
              e.user_context AS context,
              d.domain_name,
              (v.voicemail_uuid IS NOT NULL AND COALESCE(v.voicemail_enabled, 'true') = 'true') AS voicemail_enabled
       FROM public.v_extensions e
       LEFT JOIN public.v_domains d ON d.domain_uuid = e.domain_uuid
       LEFT JOIN public.v_voicemails v ON v.voicemail_id = e.extension AND v.domain_uuid = e.domain_uuid
       WHERE e.domain_uuid = $1
       ORDER BY e.extension ASC`,
      [domainUuid]
    );
    return rows.map((r) => ({
      ...r,
      voicemail_enabled: !!r.voicemail_enabled,
    }));
  });

  // POST /api/extensions — add a new extension
  fastify.post('/extensions', async (req, reply) => {
    const {
      domainUuid, extension, password,
      effective_caller_id_name, effective_caller_id_number,
      description, enabled, user_context, voicemail_enabled,
    } = req.body || {};

    if (!domainUuid || !extension || !password) {
      return reply.code(400).send({ error: 'domainUuid, extension, and password are required' });
    }

    const ext = String(extension).trim().replace(/[^0-9a-zA-Z_]/g, '');
    if (!ext) return reply.code(400).send({ error: 'Invalid extension' });

    // Fetch domain name — used as default user_context in FusionPBX
    const domainRes = await pool.query(
      'SELECT domain_name FROM public.v_domains WHERE domain_uuid = $1',
      [domainUuid]
    );
    if (!domainRes.rows.length) return reply.code(400).send({ error: 'Domain not found' });
    const domainName = domainRes.rows[0].domain_name;

    const extensionUuid = randomUUID();
    const pass = String(password).trim();
    const enabledVal = enabled === false ? 'false' : 'true';
    const cidName = effective_caller_id_name?.trim() || ext;
    const cidNumber = effective_caller_id_number?.trim() || ext;
    const desc = description?.trim() || null;
    const ctx = user_context?.trim() || domainName;

    try {
      await pool.query(
        `INSERT INTO public.v_extensions (
           extension_uuid, domain_uuid, extension, number_alias, password,
           accountcode,
           effective_caller_id_name, effective_caller_id_number,
           outbound_caller_id_name, outbound_caller_id_number,
           emergency_caller_id_name, emergency_caller_id_number,
           directory_first_name, directory_last_name,
           directory_visible, directory_exten_visible,
           limit_max, limit_destination,
           user_context, enabled, description,
           insert_date
         ) VALUES (
           $1, $2, $3, $3, $4,
           $3,
           $5, $6,
           $5, $6,
           $5, $6,
           $5, null,
           'true', 'true',
           '5', 'error/user_busy',
           $7, $8, $9,
           NOW()
         )`,
        [
          extensionUuid, domainUuid, ext, pass,
          cidName, cidNumber,
          ctx, enabledVal, desc,
        ]
      );
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Extension number already exists' });
      fastify.log.error({ err }, 'extensions insert failed');
      throw err;
    }

    const voicemailOn = voicemail_enabled !== false;
    if (voicemailOn) {
      const voicemailUuid = randomUUID();
      await insertVoicemailRow(pool, {
        domainUuid,
        voicemailUuid,
        voicemailId: ext,
        voicemailPassword: pass,
        voicemailDescription: desc,
      });
      await ensureVoicemailDir(domainName, ext, fastify.log);
    }

    const { rows } = await pool.query(
      `SELECT e.extension_uuid, e.domain_uuid, e.extension,
              COALESCE(e.effective_caller_id_name, e.extension) AS effective_caller_id_name,
              e.effective_caller_id_number, e.description, e.enabled,
              e.user_context AS context,
              d.domain_name,
              (v.voicemail_uuid IS NOT NULL AND COALESCE(v.voicemail_enabled, 'true') = 'true') AS voicemail_enabled
       FROM public.v_extensions e
       LEFT JOIN public.v_domains d ON d.domain_uuid = e.domain_uuid
       LEFT JOIN public.v_voicemails v ON v.voicemail_id = e.extension AND v.domain_uuid = e.domain_uuid
       WHERE e.extension_uuid = $1`,
      [extensionUuid]
    );
    const row = rows[0] || {
      extension_uuid: extensionUuid, domain_uuid: domainUuid,
      extension: ext, effective_caller_id_name: cidName,
      effective_caller_id_number: cidNumber, description: desc,
      enabled: enabledVal === 'true', context: domainName, domain_name: domainName,
      voicemail_enabled: voicemailOn,
    };
    if (row.voicemail_enabled !== undefined) row.voicemail_enabled = !!row.voicemail_enabled;
    return row;
  });

  // PUT /api/extensions/:extensionUuid — update an extension
  fastify.put('/extensions/:extensionUuid', async (req, reply) => {
    const { extensionUuid } = req.params;
    const {
      domainUuid, extension, password,
      effective_caller_id_name, effective_caller_id_number,
      description, enabled, user_context, voicemail_enabled,
    } = req.body || {};
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const extRow = await pool.query(
      'SELECT extension, password FROM public.v_extensions WHERE extension_uuid = $1 AND domain_uuid = $2',
      [extensionUuid, domainUuid]
    );
    const extNum = extRow.rows.length ? extRow.rows[0].extension : null;
    const extPass = extRow.rows.length ? extRow.rows[0].password : null;
    const vmEnabled = voicemail_enabled === true || voicemail_enabled === 'true';
    const vmDisabled = voicemail_enabled === false || voicemail_enabled === 'false';

    let domainName = null;
    if ((vmEnabled || vmDisabled) && extNum) {
      const dn = await pool.query('SELECT domain_name FROM public.v_domains WHERE domain_uuid = $1', [domainUuid]);
      domainName = dn.rows[0]?.domain_name || null;
    }

    const client = await pool.connect();
    try {
      if (vmDisabled && extNum) {
        const vmRows = await client.query(
          'SELECT voicemail_uuid FROM public.v_voicemails WHERE voicemail_id = $1 AND domain_uuid = $2',
          [extNum, domainUuid]
        );
        for (const vm of vmRows.rows) {
          const vid = vm.voicemail_uuid;
          await client.query('DELETE FROM public.v_voicemail_destinations WHERE voicemail_uuid = $1', [vid]);
          await client.query('DELETE FROM public.v_voicemail_options WHERE voicemail_uuid = $1', [vid]);
          await client.query('DELETE FROM public.v_voicemail_messages WHERE voicemail_uuid = $1', [vid]);
          await client.query('DELETE FROM public.v_voicemails WHERE voicemail_uuid = $1', [vid]);
        }
        await client.query(
          'DELETE FROM public.v_voicemail_greetings WHERE voicemail_id = $1 AND domain_uuid = $2',
          [extNum, domainUuid]
        );
      }
      if (vmEnabled && extNum) {
        const existing = await client.query(
          'SELECT voicemail_uuid FROM public.v_voicemails WHERE voicemail_id = $1 AND domain_uuid = $2',
          [extNum, domainUuid]
        );
        if (!existing.rows.length) {
          const voicemailUuid = randomUUID();
          const vmPass = (typeof extPass === 'string' && extPass.trim()) ? extPass : String(extNum);
          await client.query(
            `INSERT INTO public.v_voicemails (
               voicemail_uuid, domain_uuid, voicemail_id, voicemail_password,
               voicemail_mail_to, voicemail_file, voicemail_local_after_email,
               voicemail_transcription_enabled, voicemail_tutorial, voicemail_enabled,
               voicemail_description, insert_date, insert_user, update_date, update_user
             ) VALUES (
               $1, $2, $3, $4,
               null, 'attach', 'true',
               'false', 'true', 'true',
               null, NOW(), null, NOW(), null
             )`,
            [voicemailUuid, domainUuid, extNum, vmPass]
          );
          if (domainName) await ensureVoicemailDir(domainName, extNum, fastify.log);
        } else {
          await client.query(
            `UPDATE public.v_voicemails SET voicemail_enabled = 'true', update_date = NOW(), update_user = null
             WHERE voicemail_id = $1 AND domain_uuid = $2`,
            [extNum, domainUuid]
          );
        }
      }
    } finally {
      client.release();
    }

    const updates = [];
    const values = [];
    let n = 1;
    if (extension !== undefined) {
      const ext = String(extension).trim().replace(/[^0-9a-zA-Z_]/g, '');
      if (!ext) return reply.code(400).send({ error: 'Invalid extension' });
      updates.push(`extension = $${n++}`);
      values.push(ext);
    }
    if (password !== undefined && String(password).trim()) {
      updates.push(`password = $${n++}`);
      values.push(String(password).trim());
    }
    if (effective_caller_id_name !== undefined) {
      updates.push(`effective_caller_id_name = $${n++}`);
      values.push(effective_caller_id_name?.trim() || null);
    }
    if (effective_caller_id_number !== undefined) {
      updates.push(`effective_caller_id_number = $${n++}`);
      values.push(effective_caller_id_number?.trim() || null);
    }
    if (description !== undefined) {
      updates.push(`description = $${n++}`);
      values.push(description?.trim() || null);
    }
    if (enabled !== undefined) {
      updates.push(`enabled = $${n++}`);
      values.push(enabled === false ? 'false' : 'true');
    }
    if (user_context !== undefined) {
      updates.push(`user_context = $${n++}`);
      values.push(user_context?.trim() || null);
    }
    if (updates.length > 0) {
      values.push(extensionUuid, domainUuid);
      const result = await pool.query(
        `UPDATE public.v_extensions
         SET ${updates.join(', ')}
         WHERE extension_uuid = $${n} AND domain_uuid = $${n + 1}`,
        values
      );
      if (result.rowCount === 0) return reply.code(404).send({ error: 'Extension not found' });
    }

    const { rows } = await pool.query(
      `SELECT e.extension_uuid, e.domain_uuid, e.extension,
              COALESCE(e.effective_caller_id_name, e.extension) AS effective_caller_id_name,
              e.effective_caller_id_number, e.description, e.enabled,
              e.user_context AS context,
              d.domain_name,
              (v.voicemail_uuid IS NOT NULL AND COALESCE(v.voicemail_enabled, 'true') = 'true') AS voicemail_enabled
       FROM public.v_extensions e
       LEFT JOIN public.v_domains d ON d.domain_uuid = e.domain_uuid
       LEFT JOIN public.v_voicemails v ON v.voicemail_id = e.extension AND v.domain_uuid = e.domain_uuid
       WHERE e.extension_uuid = $1`,
      [extensionUuid]
    );
    const row = rows[0];
    if (row && row.voicemail_enabled !== undefined) row.voicemail_enabled = !!row.voicemail_enabled;
    return row;
  });

  // DELETE /api/extensions/:extensionUuid — delete an extension
  fastify.delete('/extensions/:extensionUuid', async (req, reply) => {
    const { extensionUuid } = req.params;
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const extRow = await pool.query(
      'SELECT extension FROM public.v_extensions WHERE extension_uuid = $1 AND domain_uuid = $2',
      [extensionUuid, domainUuid]
    );
    const extNum = extRow.rows.length ? extRow.rows[0].extension : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM public.v_extension_users WHERE extension_uuid = $1',
        [extensionUuid]
      );
      await client.query(
        'DELETE FROM public.v_extension_settings WHERE extension_uuid = $1',
        [extensionUuid]
      );
      if (extNum) {
        const vmRows = await client.query(
          'SELECT voicemail_uuid FROM public.v_voicemails WHERE voicemail_id = $1 AND domain_uuid = $2',
          [extNum, domainUuid]
        );
        for (const vm of vmRows.rows) {
          const vid = vm.voicemail_uuid;
          await client.query('DELETE FROM public.v_voicemail_destinations WHERE voicemail_uuid = $1', [vid]);
          await client.query('DELETE FROM public.v_voicemail_options WHERE voicemail_uuid = $1', [vid]);
          await client.query('DELETE FROM public.v_voicemail_messages WHERE voicemail_uuid = $1', [vid]);
          await client.query('DELETE FROM public.v_voicemails WHERE voicemail_uuid = $1', [vid]);
        }
        await client.query(
          'DELETE FROM public.v_voicemail_greetings WHERE voicemail_id = $1 AND domain_uuid = $2',
          [extNum, domainUuid]
        );
      }
      const result = await client.query(
        'DELETE FROM public.v_extensions WHERE extension_uuid = $1 AND domain_uuid = $2',
        [extensionUuid, domainUuid]
      );
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Extension not found' });
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error({ err }, 'extensions delete failed');
      throw err;
    } finally {
      client.release();
    }
    return reply.code(204).send();
  });
};
