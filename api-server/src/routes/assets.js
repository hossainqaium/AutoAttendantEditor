'use strict';

const pool       = require('../db');
const path       = require('path');
const fsP        = require('fs').promises;
const crypto     = require('crypto');
const SftpClient = require('ssh2-sftp-client');
const { Client: SshClient } = require('ssh2');

// Base directory for FusionPBX recordings — configurable via env
const FS_RECORDINGS_BASE = process.env.FS_RECORDINGS_PATH ||
  '/var/lib/freeswitch/storage/recordings';

// Parse "user@host" from FUSIONPBX_SSH env var
function parseSshTarget() {
  const raw = process.env.FUSIONPBX_SSH || '';
  const at  = raw.lastIndexOf('@');
  if (at === -1) return null;
  return {
    host:     raw.slice(at + 1),
    username: raw.slice(0, at),
    password: process.env.FUSIONPBX_SSH_PASSWORD || '',
    port:     parseInt(process.env.FUSIONPBX_SSH_PORT || '22'),
  };
}

// Execute a shell command on the remote server via SSH.
// Always consumes stdout + stderr to prevent pipe-buffer deadlocks.
// Hard-kills the connection after timeoutMs to prevent UI hangs.
function sshExec(cfg, cmd, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    let timer;
    let settled = false;

    const finish = (code, stderr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      resolve({ code, stderr: stderr.trim() });
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      reject(err);
    };

    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) return fail(err);

        let stderr = '';
        stream.on('data', () => {});                          // drain stdout
        stream.stderr.on('data', (d) => { stderr += d; });
        stream.on('close', (code) => finish(code ?? 1, stderr));
        stream.on('error', fail);

        timer = setTimeout(() => fail(new Error(`SSH command timed out after ${timeoutMs / 1000}s`)), timeoutMs);
      });
    });
    conn.on('error', fail);
    conn.connect({ host: cfg.host, port: cfg.port, username: cfg.username, password: cfg.password, readyTimeout: 8000 });
  });
}

// Upload fileBuffer to the FusionPBX server when the API runs outside that server.
//
// Strategy:
//   1. Write to /tmp via SFTP  — qaium always has write access here.
//   2. SSH exec: sudo mv the file to the real recordings path and fix ownership.
//      This works when qaium has sudo; after running server-setup.sh it also works
//      without sudo because the recordings dir becomes group-writable (freeswitch group).
async function sftpUpload(fileBuffer, remotePath, log) {
  const cfg = parseSshTarget();
  if (!cfg || !cfg.password) throw new Error('FUSIONPBX_SSH / FUSIONPBX_SSH_PASSWORD not configured');

  const remoteDir = path.posix.dirname(remotePath);
  const tmpPath   = `/tmp/ivr_${crypto.randomUUID()}.wav`;

  // ── Step 1: write to /tmp ─────────────────────────────────────────────────
  log.info({ tmpPath }, 'staging file in /tmp via SFTP');
  const sftp = new SftpClient();
  try {
    await sftp.connect({ host: cfg.host, port: cfg.port, username: cfg.username, password: cfg.password, readyTimeout: 10000 });
    await sftp.put(fileBuffer, tmpPath);
    log.info({ tmpPath, bytes: fileBuffer.length }, 'staged in /tmp');
  } finally {
    await sftp.end().catch(() => {});
  }

  // ── Step 2: try direct SFTP mkdir + move (works if dir is group-writable) ─
  const sftp2 = new SftpClient();
  try {
    await sftp2.connect({ host: cfg.host, port: cfg.port, username: cfg.username, password: cfg.password, readyTimeout: 10000 });
    await sftp2.mkdir(remoteDir, true);
    await sftp2.rename(tmpPath, remotePath);
    log.info({ remotePath }, 'file saved via SFTP rename');
    return; // success — no sudo needed
  } catch {
    // directory not writable by qaium — fall through to sudo approach
    log.warn({ remoteDir }, 'direct SFTP write not permitted — trying sudo mv');
  } finally {
    await sftp2.end().catch(() => {});
  }

  // ── Step 3: try sudo mv (works when qaium has sudo on the server) ──────────
  // First test passwordless sudo (exits immediately, no hang).
  const noPassTest = await sshExec(cfg, 'sudo -n true', 5000).catch(() => ({ code: 1, stderr: '' }));
  const useSudo    = noPassTest.code === 0;

  if (!useSudo) {
    // Clean up staged file so it doesn't litter /tmp
    await sshExec(cfg, `rm -f '${tmpPath}'`, 5000).catch(() => {});

    throw new Error(
      'The FusionPBX server needs a one-time permission fix. ' +
      'SSH in and run:\n' +
      '  sudo usermod -aG freeswitch qaium\n' +
      '  sudo chmod g+ws /var/lib/freeswitch/storage/recordings\n' +
      'Then reconnect your SSH session and try again.'
    );
  }

  // Passwordless sudo is available — use it directly (no password pipe needed)
  const sudoMkdir = `sudo mkdir -p '${remoteDir}'`;
  const sudoMv    = `sudo mv '${tmpPath}' '${remotePath}'`;
  const sudoChown = `sudo chown freeswitch:freeswitch '${remotePath}' && sudo chmod 644 '${remotePath}'`;

  for (const [label, cmd] of [['mkdir', sudoMkdir], ['mv', sudoMv], ['chown', sudoChown]]) {
    const { code, stderr } = await sshExec(cfg, cmd);
    if (code !== 0) {
      await sshExec(cfg, `rm -f '${tmpPath}'`, 5000).catch(() => {});
      throw new Error(`SSH sudo ${label} failed (exit ${code}): ${stderr}`);
    }
  }
  log.info({ remotePath }, 'file saved via sudo mv');
}

module.exports = async function assetsRoutes(fastify) {

  // ── POST /api/assets/recordings/upload ─────────────────────────────────────
  // Accepts multipart/form-data with:
  //   domainUuid    — string
  //   recordingName — string (human display name, optional)
  //   file          — audio file (ideally .wav)
  fastify.post('/assets/recordings/upload', async (req, reply) => {
    const parts = req.parts();

    let domainUuid    = '';
    let recordingName = '';
    let fileBuffer    = null;
    let fileName      = '';

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'domainUuid')    domainUuid    = String(part.value);
        if (part.fieldname === 'recordingName') recordingName = String(part.value);
      } else if (part.type === 'file') {
        fileName   = part.filename || `recording_${Date.now()}.wav`;
        fileBuffer = await part.toBuffer();
      }
    }

    fastify.log.info({ domainUuid, recordingName, fileName, bytes: fileBuffer?.length ?? 0 }, 'upload received');

    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });
    if (!fileBuffer || fileBuffer.length === 0) return reply.code(400).send({ error: 'No file received — empty buffer' });

    // Sanitise filename
    fileName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!fileName.match(/\.(wav|mp3|ogg|flac)$/i)) fileName += '.wav';

    // Look up domain name for the directory path
    let domainName = domainUuid; // fallback
    try {
      const dr = await pool.query(
        'SELECT domain_name FROM v_domains WHERE domain_uuid = $1 LIMIT 1',
        [domainUuid]
      );
      if (dr.rows.length > 0) domainName = dr.rows[0].domain_name;
    } catch { /* continue with uuid as fallback */ }

    // FusionPBX expects recordings at: {recordings_base}/{domain_name}/{filename}
    // (no 'archive' subdirectory — that is for call recordings, not custom recordings)
    const saveDir    = path.join(FS_RECORDINGS_BASE, domainName);
    const remotePath = path.posix.join(FS_RECORDINGS_BASE, domainName, fileName);
    let   fileSaved  = false;

    try {
      await fsP.mkdir(saveDir, { recursive: true });
      await fsP.writeFile(path.join(saveDir, fileName), fileBuffer);
      fileSaved = true;
      fastify.log.info({ saveDir, fileName }, 'file saved locally');
    } catch (localErr) {
      fastify.log.warn({ err: localErr, saveDir }, 'local write failed — trying SFTP');
      try {
        await sftpUpload(fileBuffer, remotePath, fastify.log);
        fileSaved = true;
      } catch (sftpErr) {
        fastify.log.error({ err: sftpErr }, 'SFTP upload failed');
        return reply.code(500).send({ error: sftpErr.message });
      }
    }

    if (!fileSaved) {
      return reply.code(500).send({ error: 'Could not save audio file to server.' });
    }

    // Insert record into v_recordings
    const recordingUuid = crypto.randomUUID();
    const displayName   = (recordingName || fileName).replace(/\.[^.]+$/, '');
    await pool.query(
      `INSERT INTO v_recordings
         (recording_uuid, domain_uuid, recording_filename, recording_name, recording_description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (recording_uuid) DO NOTHING`,
      [recordingUuid, domainUuid, fileName, displayName, 'Uploaded via IVR Studio']
    ).catch((err) => {
      // If DB insert fails just log and return the filename anyway
      fastify.log.warn({ err }, 'DB insert for recording failed');
    });

    return { success: true, recording_uuid: recordingUuid, filename: fileName, name: displayName };
  });

  // ── GET /api/assets/recordings ──────────────────────────────────────────────
  // Returns all custom recordings for a domain from FusionPBX v_recordings
  fastify.get('/assets/recordings', async (req, reply) => {
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const result = await pool.query(
      `SELECT
         recording_uuid,
         recording_filename,
         recording_name,
         recording_description
       FROM public.v_recordings
       WHERE domain_uuid = $1
       ORDER BY recording_name ASC`,
      [domainUuid]
    );
    return result.rows;
  });

  // ── GET /api/assets/destinations ────────────────────────────────────────────
  // Returns aggregated dialable destinations from FusionPBX:
  // extensions, ring groups, call center queues, voicemails
  fastify.get('/assets/destinations', async (req, reply) => {
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    const [extResult, rgResult, queueResult, vmResult] = await Promise.all([
      // Extensions
      pool.query(
        `SELECT
           extension                                          AS destination,
           COALESCE(effective_caller_id_name, extension)     AS label,
           'extension'                                        AS type
         FROM public.v_extensions
         WHERE domain_uuid = $1
           AND extension_uuid IS NOT NULL
         ORDER BY extension ASC`,
        [domainUuid]
      ),
      // Ring groups
      pool.query(
        `SELECT
           ring_group_extension   AS destination,
           ring_group_name        AS label,
           'ring_group'           AS type
         FROM public.v_ring_groups
         WHERE domain_uuid = $1
         ORDER BY ring_group_name ASC`,
        [domainUuid]
      ),
      // Call center queues
      pool.query(
        `SELECT
           queue_extension        AS destination,
           queue_name             AS label,
           'queue'                AS type
         FROM public.v_call_center_queues
         WHERE domain_uuid = $1
         ORDER BY queue_name ASC`,
        [domainUuid]
      ).catch(() => ({ rows: [] })), // graceful if table has different columns
      // Voicemails
      pool.query(
        `SELECT
           voicemail_id           AS destination,
           COALESCE(voicemail_description, voicemail_id) AS label,
           'voicemail'            AS type
         FROM public.v_voicemails
         WHERE domain_uuid = $1
         ORDER BY voicemail_id ASC`,
        [domainUuid]
      ).catch(() => ({ rows: [] })),
    ]);

    return [
      ...extResult.rows.map((r) => ({ ...r, group: 'Extensions' })),
      ...rgResult.rows.map((r) => ({ ...r, group: 'Ring Groups' })),
      ...queueResult.rows.map((r) => ({ ...r, group: 'Queues' })),
      ...vmResult.rows.map((r) => ({ ...r, group: 'Voicemails' })),
    ];
  });

  // ── GET /api/assets/sounds ───────────────────────────────────────────────────
  // Returns all available audio files for a domain:
  //   • Custom recordings from v_recordings (domain-specific)
  //   • FreeSWITCH built-in system sounds (static catalog, organised by folder)
  // Paths are relative to the FreeSWITCH sounds base dir (locale/rate resolved by FS).
  fastify.get('/assets/sounds', async (req, reply) => {
    const { domainUuid } = req.query;
    if (!domainUuid) return reply.code(400).send({ error: 'domainUuid required' });

    // 1. Domain custom recordings
    const recResult = await pool.query(
      `SELECT recording_filename AS path,
              COALESCE(recording_name, recording_filename) AS label
       FROM public.v_recordings
       WHERE domain_uuid = $1
       ORDER BY recording_name ASC`,
      [domainUuid]
    ).catch(() => ({ rows: [] }));

    const categories = [
      ...(recResult.rows.length > 0 ? [{
        category: 'Custom Recordings',
        folder:   'recordings',
        files:    recResult.rows.map((r) => ({ path: r.path, label: r.label })),
      }] : []),
      ...FREESWITCH_SOUNDS,
    ];

    return categories;
  });

  // ── GET /api/templates ───────────────────────────────────────────────────────
  // Returns built-in IVR flow templates (no DB needed, static definitions)
  fastify.get('/templates', async () => {
    return TEMPLATES;
  });
};

// ── FreeSWITCH built-in sound catalog ────────────────────────────────────────
// Paths are relative to the sounds base dir; FreeSWITCH auto-resolves locale/rate.
// Based on the standard en/us/callie voice pack shipped with FreeSWITCH / FusionPBX.
const FREESWITCH_SOUNDS = [
  {
    category: 'IVR Prompts',
    folder: 'ivr',
    files: [
      { path: 'ivr/ivr-welcome.wav',                                     label: 'Welcome' },
      { path: 'ivr/ivr-thank_you_for_calling.wav',                       label: 'Thank you for calling' },
      { path: 'ivr/ivr-thank_you.wav',                                   label: 'Thank you' },
      { path: 'ivr/ivr-thank_you_for_using_this_service.wav',            label: 'Thank you for using this service' },
      { path: 'ivr/ivr-greeting.wav',                                    label: 'Greeting' },
      { path: 'ivr/ivr-goodbye.wav',                                     label: 'Goodbye' },
      { path: 'ivr/ivr-one_moment_please.wav',                           label: 'One moment please' },
      { path: 'ivr/ivr-please_hold.wav',                                 label: 'Please hold' },
      { path: 'ivr/ivr-please_stay_on_the_line.wav',                     label: 'Please stay on the line' },
      { path: 'ivr/ivr-please_try_again.wav',                            label: 'Please try again' },
      { path: 'ivr/ivr-please_enter_extension_followed_by_pound.wav',    label: 'Please enter extension followed by pound' },
      { path: 'ivr/ivr-please_enter_the_phone_number.wav',               label: 'Please enter the phone number' },
      { path: 'ivr/ivr-please_choose_from_the_following.wav',            label: 'Please choose from the following' },
      { path: 'ivr/ivr-to_repeat_these_options.wav',                     label: 'To repeat these options' },
      { path: 'ivr/ivr-press_1_for.wav',                                 label: 'Press 1 for' },
      { path: 'ivr/ivr-press_2_for.wav',                                 label: 'Press 2 for' },
      { path: 'ivr/ivr-press_3_for.wav',                                 label: 'Press 3 for' },
      { path: 'ivr/ivr-press_hash_key.wav',                              label: 'Press the hash/pound key' },
      { path: 'ivr/ivr-hold.wav',                                        label: 'Hold' },
      { path: 'ivr/ivr-hold_connect_call.wav',                           label: 'Please hold while we connect your call' },
      { path: 'ivr/ivr-please_hold_while_party_contacted.wav',           label: 'Please hold while party is contacted' },
      { path: 'ivr/ivr-menu.wav',                                        label: 'Menu' },
      { path: 'ivr/ivr-menu_options.wav',                                label: 'Menu options' },
      { path: 'ivr/ivr-option.wav',                                      label: 'Option' },
      { path: 'ivr/ivr-options.wav',                                     label: 'Options' },
      { path: 'ivr/ivr-not_available.wav',                               label: 'Not available' },
      { path: 'ivr/ivr-no_match_trying_again.wav',                       label: 'No match, trying again' },
      { path: 'ivr/ivr-did_not_receive_response.wav',                    label: 'Did not receive a response' },
      { path: 'ivr/ivr-sorry_i_didnt_catch_that.wav',                    label: "Sorry, I didn't catch that" },
      { path: 'ivr/ivr-invalid_extension.wav',                           label: 'Invalid extension' },
      { path: 'ivr/ivr-invalid_number.wav',                              label: 'Invalid number' },
      { path: 'ivr/ivr-bad_extension.wav',                               label: 'Bad extension' },
      { path: 'ivr/ivr-enter_destination_number.wav',                    label: 'Enter destination number' },
      { path: 'ivr/ivr-enter_number_for.wav',                            label: 'Enter number for' },
      { path: 'ivr/ivr-transfer_prompt.wav',                             label: 'Transfer prompt' },
      { path: 'ivr/ivr-your_call_is_being_placed.wav',                   label: 'Your call is being placed' },
      { path: 'ivr/ivr-this_call_may_be_recorded.wav',                   label: 'This call may be recorded' },
      { path: 'ivr/ivr-error.wav',                                       label: 'Error' },
      { path: 'ivr/ivr-abort.wav',                                       label: 'Abort' },
      { path: 'ivr/ivr-failover.wav',                                    label: 'Failover' },
      { path: 'ivr/ivr-feedback.wav',                                    label: 'Feedback' },
      { path: 'ivr/ivr-access_code.wav',                                 label: 'Access code' },
      { path: 'ivr/ivr-address.wav',                                     label: 'Address' },
      { path: 'ivr/ivr-dial_by_name.wav',                                label: 'Dial by name' },
      { path: 'ivr/ivr-enter_name_speak_instructions.wav',               label: 'Enter name (speak instructions)' },
      { path: 'ivr/ivr-extension_not_in_db.wav',                         label: 'Extension not in database' },
      { path: 'ivr/ivr-dont_know_anyone_by_that_name.wav',               label: "Don't know anyone by that name" },
      { path: 'ivr/ivr-no_callers_are_waiting.wav',                      label: 'No callers are waiting' },
      { path: 'ivr/ivr-you_are_currently.wav',                           label: 'You are currently' },
      { path: 'ivr/ivr-you_are_in_queue_number.wav',                     label: 'You are in queue number' },
      { path: 'ivr/ivr-you_have.wav',                                    label: 'You have' },
      { path: 'ivr/ivr-record_message.wav',                              label: 'Record message' },
      { path: 'ivr/ivr-record_message_follow_by_pound.wav',              label: 'Record message followed by pound' },
      { path: 'ivr/ivr-recording_started.wav',                           label: 'Recording started' },
      { path: 'ivr/ivr-at_the_tone_please_record.wav',                   label: 'At the tone please record' },
      { path: 'ivr/ivr-welcome_to_the_voicemail_system.wav',             label: 'Welcome to the voicemail system' },
    ],
  },
  {
    category: 'Voicemail',
    folder: 'voicemail',
    files: [
      { path: 'voicemail/vm-hello.wav',                      label: 'Hello' },
      { path: 'voicemail/vm-not_available.wav',              label: 'Not available' },
      { path: 'voicemail/vm-dear_caller.wav',                label: 'Dear caller' },
      { path: 'voicemail/vm-enter_id.wav',                   label: 'Enter ID' },
      { path: 'voicemail/vm-enter_pass.wav',                 label: 'Enter password' },
      { path: 'voicemail/vm-new.wav',                        label: 'New' },
      { path: 'voicemail/vm-message.wav',                    label: 'Message' },
      { path: 'voicemail/vm-messages.wav',                   label: 'Messages' },
      { path: 'voicemail/vm-empty.wav',                      label: 'Empty / no messages' },
      { path: 'voicemail/vm-you_have.wav',                   label: 'You have' },
      { path: 'voicemail/vm-saved.wav',                      label: 'Saved' },
      { path: 'voicemail/vm-deleted.wav',                    label: 'Deleted' },
      { path: 'voicemail/vm-urgent.wav',                     label: 'Urgent' },
      { path: 'voicemail/vm-marked_urgent.wav',              label: 'Marked urgent' },
      { path: 'voicemail/vm-record_greeting.wav',            label: 'Record greeting' },
      { path: 'voicemail/vm-play_greeting.wav',              label: 'Play greeting' },
      { path: 'voicemail/vm-greeting_number.wav',            label: 'Greeting number' },
      { path: 'voicemail/vm-choose_greeting.wav',            label: 'Choose greeting' },
      { path: 'voicemail/vm-choose_filename.wav',            label: 'Choose filename' },
      { path: 'voicemail/vm-tutorial.wav',                   label: 'Tutorial' },
      { path: 'voicemail/vm-tutorial_hold.wav',              label: 'Tutorial hold' },
      { path: 'voicemail/vm-tutorial_record_name.wav',       label: 'Tutorial: record name' },
      { path: 'voicemail/vm-password_needed.wav',            label: 'Password needed' },
      { path: 'voicemail/vm-password_has_been_reset.wav',    label: 'Password has been reset' },
      { path: 'voicemail/vm-access_denied.wav',              label: 'Access denied' },
      { path: 'voicemail/vm-extension.wav',                  label: 'Extension' },
      { path: 'voicemail/vm-if_happy_with_recording.wav',    label: 'If happy with recording' },
      { path: 'voicemail/vm-hear_envelope.wav',              label: 'Hear envelope' },
      { path: 'voicemail/vm-first_unread.wav',               label: 'First unread' },
      { path: 'voicemail/vm-for.wav',                        label: 'For' },
      { path: 'voicemail/vm-has.wav',                        label: 'Has' },
      { path: 'voicemail/vm-received.wav',                   label: 'Received' },
      { path: 'voicemail/vm-press.wav',                      label: 'Press' },
      { path: 'voicemail/vm-listen_to_recording.wav',        label: 'Listen to recording' },
      { path: 'voicemail/vm-abort.wav',                      label: 'Abort' },
      { path: 'voicemail/vm-sorry_you_are_having_problems.wav', label: 'Sorry you are having problems' },
    ],
  },
  {
    category: 'Digits & Numbers',
    folder: 'digits',
    files: [
      { path: 'digits/0.wav', label: 'Zero (0)' },
      { path: 'digits/1.wav', label: 'One (1)' },
      { path: 'digits/2.wav', label: 'Two (2)' },
      { path: 'digits/3.wav', label: 'Three (3)' },
      { path: 'digits/4.wav', label: 'Four (4)' },
      { path: 'digits/5.wav', label: 'Five (5)' },
      { path: 'digits/6.wav', label: 'Six (6)' },
      { path: 'digits/7.wav', label: 'Seven (7)' },
      { path: 'digits/8.wav', label: 'Eight (8)' },
      { path: 'digits/9.wav', label: 'Nine (9)' },
      { path: 'digits/star.wav',  label: 'Star (*)' },
      { path: 'digits/pound.wav', label: 'Pound (#)' },
      { path: 'digits/hundred.wav',  label: 'Hundred' },
      { path: 'digits/thousand.wav', label: 'Thousand' },
      { path: 'digits/million.wav',  label: 'Million' },
    ],
  },
  {
    category: 'Conference',
    folder: 'conference',
    files: [
      { path: 'conference/conf-alone_and_waiting.wav',           label: 'Alone and waiting' },
      { path: 'conference/conf-background-music.wav',            label: 'Background music' },
      { path: 'conference/conf-enter_conf_pin.wav',              label: 'Enter conference PIN' },
      { path: 'conference/conf-ha_pin.wav',                      label: 'HA PIN' },
      { path: 'conference/conf-has_joined.wav',                  label: 'Has joined' },
      { path: 'conference/conf-has_left.wav',                    label: 'Has left' },
      { path: 'conference/conf-locked.wav',                      label: 'Locked' },
      { path: 'conference/conf-muted.wav',                       label: 'Muted' },
      { path: 'conference/conf-unmuted.wav',                     label: 'Unmuted' },
      { path: 'conference/conf-members.wav',                     label: 'Members' },
      { path: 'conference/conf-menu.wav',                        label: 'Menu' },
      { path: 'conference/conf-only_1_in_conf.wav',              label: 'Only 1 in conference' },
      { path: 'conference/conf-recording_started.wav',           label: 'Recording started' },
      { path: 'conference/conf-recording_stopped.wav',           label: 'Recording stopped' },
      { path: 'conference/conf-there_are.wav',                   label: 'There are' },
      { path: 'conference/conf-unlocked.wav',                    label: 'Unlocked' },
      { path: 'conference/conf-you_are_muted.wav',               label: 'You are muted' },
      { path: 'conference/conf-you_are_not_muted.wav',           label: 'You are not muted' },
      { path: 'conference/conf-you_are_the_only_person.wav',     label: 'You are the only person' },
    ],
  },
  {
    category: 'Miscellaneous',
    folder: 'misc',
    files: [
      { path: 'misc/transfer.wav',     label: 'Transfer' },
      { path: 'misc/hold_music.wav',   label: 'Hold music' },
      { path: 'misc/button.wav',       label: 'Button click' },
      { path: 'misc/error.wav',        label: 'Error tone' },
      { path: 'misc/ding.wav',         label: 'Ding' },
      { path: 'misc/ring.wav',         label: 'Ring' },
    ],
  },
  {
    category: 'Music on Hold',
    folder: 'music',
    files: [
      { path: 'music/8000/suite-espanola.wav',    label: 'Suite Española' },
      { path: 'music/8000/danza-espanola-op37.wav', label: 'Danza Española Op.37' },
      { path: 'music/8000/partita-no-3.wav',      label: 'Partita No. 3' },
      { path: 'music/8000/dont-you-wish.wav',     label: "Don't You Wish" },
    ],
  },
];

// ── Built-in IVR Templates ───────────────────────────────────────────────────
// Sound file paths are relative to the FreeSWITCH sounds directory.
// FreeSWITCH auto-selects the correct sample-rate subfolder (8000/16000/etc).
// Files verified to exist on a standard FusionPBX/FreeSWITCH installation:
//   ivr/ivr-welcome.wav, ivr/ivr-thank_you_for_calling.wav,
//   ivr/ivr-please_enter_extension_followed_by_pound.wav,
//   ivr/ivr-one_moment_please.wav, ivr/ivr-please_try_again.wav,
//   ivr/ivr-to_repeat_these_options.wav, ivr/ivr-thank_you.wav
// Use silence_stream://200 for get_digits prompts when you have a custom recording.
const TEMPLATES = [
  {
    id: 'simple_menu',
    name: 'Simple Main Menu',
    description: 'Classic press-1-for-X IVR menu with up to 4 department options',
    category: 'General',
    icon: 'menu',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio',  position: { x: 300, y: 40  }, data: { label: 'Welcome',         file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'get_digits',  position: { x: 300, y: 160 }, data: { label: 'Main Menu',       prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 3, valid_digits: ['1','2','3','0'] } },
        { id: 'n3', type: 'transfer',    position: { x: 80,  y: 320 }, data: { label: 'Sales',           destination: '1001', transfer_type: 'blind' } },
        { id: 'n4', type: 'transfer',    position: { x: 260, y: 320 }, data: { label: 'Support',         destination: '1002', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',    position: { x: 440, y: 320 }, data: { label: 'Billing',         destination: '1003', transfer_type: 'blind' } },
        { id: 'n6', type: 'transfer',    position: { x: 620, y: 320 }, data: { label: 'Operator',        destination: '0',    transfer_type: 'blind' } },
        { id: 'n7', type: 'voicemail',   position: { x: 300, y: 460 }, data: { label: 'No Input → VM',   mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2', source: 'n1', target: 'n2' },
        { id: 'e2-3', source: 'n2', target: 'n3', sourceHandle: '1' },
        { id: 'e2-4', source: 'n2', target: 'n4', sourceHandle: '2' },
        { id: 'e2-5', source: 'n2', target: 'n5', sourceHandle: '3' },
        { id: 'e2-6', source: 'n2', target: 'n6', sourceHandle: '0' },
        { id: 'e2-7', source: 'n2', target: 'n7', sourceHandle: 'timeout' },
      ],
    },
  },
  {
    id: 'business_hours',
    name: 'Business Hours Routing',
    description: 'Routes callers differently during open hours vs closed / after hours',
    category: 'Routing',
    icon: 'clock',
    graph: {
      nodes: [
        { id: 'n1', type: 'time_condition', position: { x: 300, y: 40  }, data: { label: 'Business Hours?', schedule: { open: '09:00', close: '17:00', days: [2,3,4,5,6] } } },
        { id: 'n2', type: 'play_audio',     position: { x: 100, y: 200 }, data: { label: 'Open: Welcome',   file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n3', type: 'get_digits',     position: { x: 100, y: 320 }, data: { label: 'Open Menu',       prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 2, valid_digits: ['1','2'] } },
        { id: 'n4', type: 'transfer',       position: { x: 0,   y: 460 }, data: { label: 'Sales',           destination: '1001', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',       position: { x: 200, y: 460 }, data: { label: 'Support',         destination: '1002', transfer_type: 'blind' } },
        { id: 'n6', type: 'play_audio',     position: { x: 500, y: 200 }, data: { label: 'Closed: Message', file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n7', type: 'voicemail',      position: { x: 500, y: 340 }, data: { label: 'After Hours VM',  mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2', source: 'n1', target: 'n2', sourceHandle: 'open'   },
        { id: 'e1-6', source: 'n1', target: 'n6', sourceHandle: 'closed' },
        { id: 'e2-3', source: 'n2', target: 'n3' },
        { id: 'e3-4', source: 'n3', target: 'n4', sourceHandle: '1' },
        { id: 'e3-5', source: 'n3', target: 'n5', sourceHandle: '2' },
        { id: 'e6-7', source: 'n6', target: 'n7' },
      ],
    },
  },
  {
    id: 'sales_support',
    name: 'Sales & Support with Voicemail Fallback',
    description: 'Routes to live agents; falls back to voicemail if unavailable',
    category: 'General',
    icon: 'headset',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio', position: { x: 300, y: 40  }, data: { label: 'Greeting',       file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'get_digits', position: { x: 300, y: 160 }, data: { label: 'Dept Selection', prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 3, valid_digits: ['1','2','9'] } },
        { id: 'n3', type: 'transfer',   position: { x: 100, y: 320 }, data: { label: 'Sales Team',     destination: '1001', transfer_type: 'blind' } },
        { id: 'n4', type: 'transfer',   position: { x: 300, y: 320 }, data: { label: 'Support Team',   destination: '1002', transfer_type: 'blind' } },
        { id: 'n5', type: 'voicemail',  position: { x: 500, y: 320 }, data: { label: 'General VM',     mailbox_id: '1000' } },
        { id: 'n6', type: 'play_audio', position: { x: 300, y: 460 }, data: { label: 'Goodbye',        file: 'ivr/ivr-thank_you.wav' } },
        { id: 'n7', type: 'hangup',     position: { x: 300, y: 560 }, data: { label: 'Hangup',         cause: 'NORMAL_CLEARING' } },
      ],
      edges: [
        { id: 'e1-2',  source: 'n1', target: 'n2' },
        { id: 'e2-3',  source: 'n2', target: 'n3', sourceHandle: '1' },
        { id: 'e2-4',  source: 'n2', target: 'n4', sourceHandle: '2' },
        { id: 'e2-5',  source: 'n2', target: 'n5', sourceHandle: '9' },
        { id: 'e2-vm', source: 'n2', target: 'n5', sourceHandle: 'timeout' },
        { id: 'e5-6',  source: 'n5', target: 'n6' },
        { id: 'e6-7',  source: 'n6', target: 'n7' },
      ],
    },
  },
  {
    id: 'info_line',
    name: 'Informational Line',
    description: 'Plays information messages with repeat and callback options',
    category: 'Informational',
    icon: 'info',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio', position: { x: 300, y: 40  }, data: { label: 'Intro',          file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'play_audio', position: { x: 300, y: 160 }, data: { label: 'Info Message',   file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n3', type: 'get_digits', position: { x: 300, y: 280 }, data: { label: 'Repeat or Exit', prompt_file: 'ivr/ivr-to_repeat_these_options.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 2, valid_digits: ['1','2','0'] } },
        { id: 'n4', type: 'transfer',   position: { x: 100, y: 420 }, data: { label: 'Live Agent',     destination: '0', transfer_type: 'blind' } },
        { id: 'n5', type: 'play_audio', position: { x: 500, y: 420 }, data: { label: 'Goodbye',        file: 'ivr/ivr-thank_you.wav' } },
        { id: 'n6', type: 'hangup',     position: { x: 500, y: 520 }, data: { label: 'Hangup',         cause: 'NORMAL_CLEARING' } },
      ],
      edges: [
        { id: 'e1-2',  source: 'n1', target: 'n2' },
        { id: 'e2-3',  source: 'n2', target: 'n3' },
        { id: 'e3-2',  source: 'n3', target: 'n2', sourceHandle: '1', data: { loop: true } },
        { id: 'e3-4',  source: 'n3', target: 'n4', sourceHandle: '0' },
        { id: 'e3-5',  source: 'n3', target: 'n5', sourceHandle: '2' },
        { id: 'e3-t5', source: 'n3', target: 'n5', sourceHandle: 'timeout' },
        { id: 'e5-6',  source: 'n5', target: 'n6' },
      ],
    },
  },
  {
    id: 'api_lookup',
    name: 'API-Driven Caller Lookup',
    description: 'Looks up caller data via API, then routes based on result (e.g. VIP vs standard)',
    category: 'API-Driven',
    icon: 'api',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio',   position: { x: 300, y: 40  }, data: { label: 'Welcome',        file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'api_call',     position: { x: 300, y: 160 }, data: { label: 'Lookup Caller',  url: 'https://api.example.com/caller?ani={{ani}}', method: 'GET', timeout_ms: 3000, response_map: [{ json_path: '$.tier', variable: 'customer_tier' }] } },
        { id: 'n3', type: 'condition',    position: { x: 300, y: 300 }, data: { label: 'VIP?',           variable: 'customer_tier', operator: 'eq', value: 'vip' } },
        { id: 'n4', type: 'transfer',     position: { x: 100, y: 440 }, data: { label: 'VIP Queue',      destination: '1010', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',     position: { x: 300, y: 440 }, data: { label: 'Standard Queue', destination: '1002', transfer_type: 'blind' } },
        { id: 'n6', type: 'play_audio',   position: { x: 520, y: 300 }, data: { label: 'API Error Msg',  file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n7', type: 'transfer',     position: { x: 520, y: 440 }, data: { label: 'Fallback',       destination: '1002', transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',  source: 'n1', target: 'n2' },
        { id: 'e2-3',  source: 'n2', target: 'n3', sourceHandle: 'success' },
        { id: 'e2-6',  source: 'n2', target: 'n6', sourceHandle: 'error' },
        { id: 'e2-6t', source: 'n2', target: 'n6', sourceHandle: 'timeout' },
        { id: 'e3-4',  source: 'n3', target: 'n4', sourceHandle: 'true' },
        { id: 'e3-5',  source: 'n3', target: 'n5', sourceHandle: 'false' },
        { id: 'e6-7',  source: 'n6', target: 'n7' },
      ],
    },
  },

  // ── Business Templates ──────────────────────────────────────────────────────

  {
    id: 'healthcare_office',
    name: 'Healthcare / Medical Office',
    description: 'Medical office IVR with appointments, billing, pharmacy, nurse line and after-hours voicemail',
    category: 'Business',
    icon: 'medical',
    graph: {
      nodes: [
        { id: 'n1',  type: 'play_audio',     position: { x: 360, y: 40  }, data: { label: 'Welcome',         file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'time_condition',  position: { x: 360, y: 160 }, data: { label: 'Office Hours?',   schedule: { open: '08:00', close: '18:00', days: 'mon-fri' } } },
        { id: 'n3',  type: 'get_digits',      position: { x: 160, y: 320 }, data: { label: 'Main Menu',       prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','0'] } },
        { id: 'n4',  type: 'transfer',        position: { x: 0,   y: 480 }, data: { label: 'Appointments',    destination: '1001', transfer_type: 'blind' } },
        { id: 'n5',  type: 'transfer',        position: { x: 180, y: 480 }, data: { label: 'Billing',         destination: '1002', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',        position: { x: 360, y: 480 }, data: { label: 'Pharmacy',        destination: '1003', transfer_type: 'blind' } },
        { id: 'n7',  type: 'transfer',        position: { x: 540, y: 480 }, data: { label: 'Nurse Line',      destination: '1004', transfer_type: 'blind' } },
        { id: 'n8',  type: 'transfer',        position: { x: 720, y: 480 }, data: { label: 'Receptionist',    destination: '0',    transfer_type: 'blind' } },
        { id: 'n9',  type: 'voicemail',       position: { x: 160, y: 600 }, data: { label: 'No Input → VM',   mailbox_id: '1000' } },
        { id: 'n10', type: 'play_audio',      position: { x: 580, y: 320 }, data: { label: 'After Hours Msg', file: 'ivr/ivr-not_available.wav' } },
        { id: 'n11', type: 'voicemail',       position: { x: 580, y: 460 }, data: { label: 'After Hours VM',  mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2',  source: 'n1',  target: 'n2'  },
        { id: 'e2-3',  source: 'n2',  target: 'n3',  sourceHandle: 'open'   },
        { id: 'e2-10', source: 'n2',  target: 'n10', sourceHandle: 'closed' },
        { id: 'e3-4',  source: 'n3',  target: 'n4',  sourceHandle: '1' },
        { id: 'e3-5',  source: 'n3',  target: 'n5',  sourceHandle: '2' },
        { id: 'e3-6',  source: 'n3',  target: 'n6',  sourceHandle: '3' },
        { id: 'e3-7',  source: 'n3',  target: 'n7',  sourceHandle: '4' },
        { id: 'e3-8',  source: 'n3',  target: 'n8',  sourceHandle: '0' },
        { id: 'e3-9',  source: 'n3',  target: 'n9',  sourceHandle: 'timeout' },
        { id: 'e10-11',source: 'n10', target: 'n11' },
      ],
    },
  },

  {
    id: 'restaurant',
    name: 'Restaurant & Reservations',
    description: 'Restaurant IVR with reservations, hours/location info, catering enquiries and takeaway orders',
    category: 'Business',
    icon: 'restaurant',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio', position: { x: 300, y: 40  }, data: { label: 'Welcome',          file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'get_digits', position: { x: 300, y: 160 }, data: { label: 'Main Menu',        prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4'] } },
        { id: 'n3', type: 'transfer',   position: { x: 60,  y: 320 }, data: { label: 'Reservations',     destination: '1001', transfer_type: 'blind' } },
        { id: 'n4', type: 'play_audio', position: { x: 240, y: 320 }, data: { label: 'Hours & Location', file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n5', type: 'voicemail',  position: { x: 420, y: 320 }, data: { label: 'Catering Enquiry', mailbox_id: '1002' } },
        { id: 'n6', type: 'transfer',   position: { x: 600, y: 320 }, data: { label: 'Takeaway Orders',  destination: '1003', transfer_type: 'blind' } },
        { id: 'n7', type: 'play_audio', position: { x: 240, y: 460 }, data: { label: 'Goodbye',          file: 'ivr/ivr-thank_you.wav' } },
        { id: 'n8', type: 'hangup',     position: { x: 240, y: 560 }, data: { label: 'Hangup',           cause: 'NORMAL_CLEARING' } },
        { id: 'n9', type: 'voicemail',  position: { x: 300, y: 440 }, data: { label: 'No Input → VM',    mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2',  source: 'n1', target: 'n2' },
        { id: 'e2-3',  source: 'n2', target: 'n3', sourceHandle: '1' },
        { id: 'e2-4',  source: 'n2', target: 'n4', sourceHandle: '2' },
        { id: 'e2-5',  source: 'n2', target: 'n5', sourceHandle: '3' },
        { id: 'e2-6',  source: 'n2', target: 'n6', sourceHandle: '4' },
        { id: 'e2-9',  source: 'n2', target: 'n9', sourceHandle: 'timeout' },
        { id: 'e4-7',  source: 'n4', target: 'n7' },
        { id: 'e7-8',  source: 'n7', target: 'n8' },
      ],
    },
  },

  {
    id: 'hotel_hospitality',
    name: 'Hotel & Hospitality',
    description: 'Hotel front-desk IVR with reservations, concierge, room service, housekeeping and front desk',
    category: 'Business',
    icon: 'hotel',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio', position: { x: 360, y: 40  }, data: { label: 'Hotel Welcome',    file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'get_digits', position: { x: 360, y: 160 }, data: { label: 'Main Menu',        prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','5','0'] } },
        { id: 'n3', type: 'transfer',   position: { x: 0,   y: 320 }, data: { label: 'Reservations',     destination: '1001', transfer_type: 'blind' } },
        { id: 'n4', type: 'transfer',   position: { x: 150, y: 320 }, data: { label: 'Concierge',        destination: '1002', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',   position: { x: 300, y: 320 }, data: { label: 'Room Service',     destination: '1003', transfer_type: 'blind' } },
        { id: 'n6', type: 'transfer',   position: { x: 450, y: 320 }, data: { label: 'Housekeeping',     destination: '1004', transfer_type: 'blind' } },
        { id: 'n7', type: 'transfer',   position: { x: 600, y: 320 }, data: { label: 'Spa & Wellness',   destination: '1005', transfer_type: 'blind' } },
        { id: 'n8', type: 'transfer',   position: { x: 750, y: 320 }, data: { label: 'Front Desk',       destination: '0',    transfer_type: 'blind' } },
        { id: 'n9', type: 'voicemail',  position: { x: 360, y: 440 }, data: { label: 'No Input → VM',    mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2', source: 'n1', target: 'n2' },
        { id: 'e2-3', source: 'n2', target: 'n3', sourceHandle: '1' },
        { id: 'e2-4', source: 'n2', target: 'n4', sourceHandle: '2' },
        { id: 'e2-5', source: 'n2', target: 'n5', sourceHandle: '3' },
        { id: 'e2-6', source: 'n2', target: 'n6', sourceHandle: '4' },
        { id: 'e2-7', source: 'n2', target: 'n7', sourceHandle: '5' },
        { id: 'e2-8', source: 'n2', target: 'n8', sourceHandle: '0' },
        { id: 'e2-9', source: 'n2', target: 'n9', sourceHandle: 'timeout' },
      ],
    },
  },

  {
    id: 'real_estate',
    name: 'Real Estate Agency',
    description: 'Property agency IVR covering buy/sell, rentals, property management and agent contact',
    category: 'Business',
    icon: 'building',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio',    position: { x: 300, y: 40  }, data: { label: 'Welcome',            file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'time_condition', position: { x: 300, y: 160 }, data: { label: 'Office Open?',       schedule: { open: '09:00', close: '17:30', days: 'mon-sat' } } },
        { id: 'n3', type: 'get_digits',    position: { x: 100, y: 320 }, data: { label: 'Main Menu',           prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','0'] } },
        { id: 'n4', type: 'transfer',      position: { x: 0,   y: 480 }, data: { label: 'Buy / Sell',          destination: '1001', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',      position: { x: 180, y: 480 }, data: { label: 'Rentals',             destination: '1002', transfer_type: 'blind' } },
        { id: 'n6', type: 'transfer',      position: { x: 360, y: 480 }, data: { label: 'Property Mgmt',       destination: '1003', transfer_type: 'blind' } },
        { id: 'n7', type: 'voicemail',     position: { x: 540, y: 480 }, data: { label: 'Valuation Request',   mailbox_id: '1004' } },
        { id: 'n8', type: 'transfer',      position: { x: 720, y: 480 }, data: { label: 'Speak to Agent',      destination: '0',    transfer_type: 'blind' } },
        { id: 'n9', type: 'voicemail',     position: { x: 100, y: 600 }, data: { label: 'No Input → VM',       mailbox_id: '1000' } },
        { id: 'n10', type: 'play_audio',   position: { x: 520, y: 320 }, data: { label: 'After Hours Msg',     file: 'ivr/ivr-not_available.wav' } },
        { id: 'n11', type: 'voicemail',    position: { x: 520, y: 460 }, data: { label: 'After Hours VM',      mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: 'open'   },
        { id: 'e2-10',  source: 'n2',  target: 'n10', sourceHandle: 'closed' },
        { id: 'e3-4',   source: 'n3',  target: 'n4',  sourceHandle: '1' },
        { id: 'e3-5',   source: 'n3',  target: 'n5',  sourceHandle: '2' },
        { id: 'e3-6',   source: 'n3',  target: 'n6',  sourceHandle: '3' },
        { id: 'e3-7',   source: 'n3',  target: 'n7',  sourceHandle: '4' },
        { id: 'e3-8',   source: 'n3',  target: 'n8',  sourceHandle: '0' },
        { id: 'e3-9',   source: 'n3',  target: 'n9',  sourceHandle: 'timeout' },
        { id: 'e10-11', source: 'n10', target: 'n11' },
      ],
    },
  },

  {
    id: 'financial_services',
    name: 'Bank / Financial Services',
    description: 'Banking IVR with account services, loans, cards, investments and fraud hotline',
    category: 'Business',
    icon: 'bank',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio', position: { x: 400, y: 40  }, data: { label: 'Welcome',          file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'play_audio', position: { x: 400, y: 160 }, data: { label: 'Security Notice',  file: 'ivr/ivr-this_call_may_be_recorded.wav' } },
        { id: 'n3', type: 'get_digits', position: { x: 400, y: 280 }, data: { label: 'Main Menu',        prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','5','9'] } },
        { id: 'n4', type: 'transfer',   position: { x: 0,   y: 440 }, data: { label: 'Account Services', destination: '1001', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',   position: { x: 160, y: 440 }, data: { label: 'Loans & Mortgages',destination: '1002', transfer_type: 'blind' } },
        { id: 'n6', type: 'transfer',   position: { x: 320, y: 440 }, data: { label: 'Credit / Debit',   destination: '1003', transfer_type: 'blind' } },
        { id: 'n7', type: 'transfer',   position: { x: 480, y: 440 }, data: { label: 'Investments',      destination: '1004', transfer_type: 'blind' } },
        { id: 'n8', type: 'transfer',   position: { x: 640, y: 440 }, data: { label: 'Online Banking',   destination: '1005', transfer_type: 'blind' } },
        { id: 'n9', type: 'transfer',   position: { x: 800, y: 440 }, data: { label: '🚨 Fraud Hotline', destination: '1999', transfer_type: 'blind' } },
        { id: 'n10',type: 'voicemail',  position: { x: 400, y: 560 }, data: { label: 'No Input → VM',    mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2',  source: 'n1',  target: 'n2' },
        { id: 'e2-3',  source: 'n2',  target: 'n3' },
        { id: 'e3-4',  source: 'n3',  target: 'n4',  sourceHandle: '1' },
        { id: 'e3-5',  source: 'n3',  target: 'n5',  sourceHandle: '2' },
        { id: 'e3-6',  source: 'n3',  target: 'n6',  sourceHandle: '3' },
        { id: 'e3-7',  source: 'n3',  target: 'n7',  sourceHandle: '4' },
        { id: 'e3-8',  source: 'n3',  target: 'n8',  sourceHandle: '5' },
        { id: 'e3-9',  source: 'n3',  target: 'n9',  sourceHandle: '9' },
        { id: 'e3-10', source: 'n3',  target: 'n10', sourceHandle: 'timeout' },
      ],
    },
  },

  {
    id: 'after_hours_emergency',
    name: 'After Hours & Emergency Routing',
    description: 'Closed-hours IVR that separates true emergencies from general enquiries and routes accordingly',
    category: 'Business',
    icon: 'emergency',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio',    position: { x: 300, y: 40  }, data: { label: 'After Hours',      file: 'ivr/ivr-not_available.wav' } },
        { id: 'n2', type: 'get_digits',    position: { x: 300, y: 160 }, data: { label: 'Emergency Menu',   prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 8000, retries: 2, valid_digits: ['1','2','3'] } },
        { id: 'n3', type: 'play_audio',    position: { x: 80,  y: 320 }, data: { label: 'Routing Emergency',file: 'ivr/ivr-your_call_is_being_placed.wav' } },
        { id: 'n4', type: 'transfer',      position: { x: 80,  y: 440 }, data: { label: '🚨 On-Call Eng',   destination: '1099', transfer_type: 'blind' } },
        { id: 'n5', type: 'voicemail',     position: { x: 300, y: 320 }, data: { label: 'Leave a Message',  mailbox_id: '1000' } },
        { id: 'n6', type: 'set_variable',  position: { x: 520, y: 320 }, data: { label: 'Flag Callback',    key: 'callback_requested', value: 'true' } },
        { id: 'n7', type: 'play_audio',    position: { x: 520, y: 440 }, data: { label: 'Callback Confirm', file: 'ivr/ivr-thank_you.wav' } },
        { id: 'n8', type: 'hangup',        position: { x: 520, y: 540 }, data: { label: 'Hangup',           cause: 'NORMAL_CLEARING' } },
        { id: 'n9', type: 'voicemail',     position: { x: 300, y: 460 }, data: { label: 'No Input → VM',    mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2', source: 'n1', target: 'n2' },
        { id: 'e2-3', source: 'n2', target: 'n3', sourceHandle: '1' },
        { id: 'e2-5', source: 'n2', target: 'n5', sourceHandle: '2' },
        { id: 'e2-6', source: 'n2', target: 'n6', sourceHandle: '3' },
        { id: 'e2-9', source: 'n2', target: 'n9', sourceHandle: 'timeout' },
        { id: 'e3-4', source: 'n3', target: 'n4' },
        { id: 'e6-7', source: 'n6', target: 'n7' },
        { id: 'e7-8', source: 'n7', target: 'n8' },
      ],
    },
  },

  // ── API-Driven Templates ────────────────────────────────────────────────────

  {
    id: 'account_pin_auth',
    name: 'Account PIN Authentication',
    description: 'Caller enters their account number and PIN; API validates and routes authenticated callers to a personalised menu',
    category: 'API-Driven',
    icon: 'lock',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio',  position: { x: 300, y: 40  }, data: { label: 'Welcome',          file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'get_digits',  position: { x: 300, y: 160 }, data: { label: 'Enter Account No.', prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 6, max_digits: 10, timeout_ms: 8000, retries: 3, valid_digits: ['0','1','2','3','4','5','6','7','8','9'] } },
        { id: 'n3', type: 'get_digits',  position: { x: 300, y: 300 }, data: { label: 'Enter PIN',         prompt_file: 'ivr/ivr-access_code.wav', min_digits: 4, max_digits: 6, timeout_ms: 8000, retries: 3, valid_digits: ['0','1','2','3','4','5','6','7','8','9'] } },
        { id: 'n4', type: 'api_call',    position: { x: 300, y: 440 }, data: { label: 'Validate Auth',     url: 'https://api.example.com/auth', method: 'POST', timeout_ms: 5000, headers: { 'Content-Type': 'application/json' }, response_map: [{ json_path: '$.authenticated', variable: 'auth_ok' }, { json_path: '$.customer_name', variable: 'customer_name' }, { json_path: '$.account_type', variable: 'account_type' }] } },
        { id: 'n5', type: 'condition',   position: { x: 300, y: 580 }, data: { label: 'Auth OK?',          variable: 'auth_ok', operator: 'eq', value: 'true' } },
        { id: 'n6', type: 'get_digits',  position: { x: 100, y: 720 }, data: { label: 'Authenticated Menu',prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','0'] } },
        { id: 'n7', type: 'transfer',    position: { x: 0,   y: 880 }, data: { label: 'Account Services',  destination: '1001', transfer_type: 'blind' } },
        { id: 'n8', type: 'transfer',    position: { x: 180, y: 880 }, data: { label: 'Billing',           destination: '1002', transfer_type: 'blind' } },
        { id: 'n9', type: 'transfer',    position: { x: 360, y: 880 }, data: { label: 'Technical Support', destination: '1003', transfer_type: 'blind' } },
        { id: 'n10',type: 'transfer',    position: { x: 540, y: 880 }, data: { label: 'Operator',          destination: '0',    transfer_type: 'blind' } },
        { id: 'n11',type: 'play_audio',  position: { x: 520, y: 720 }, data: { label: 'Auth Failed Msg',   file: 'ivr/ivr-invalid_number.wav' } },
        { id: 'n12',type: 'transfer',    position: { x: 520, y: 840 }, data: { label: 'Manual Verify',     destination: '1099', transfer_type: 'blind' } },
        { id: 'n13',type: 'play_audio',  position: { x: 300, y: 560 }, data: { label: 'API Error',         file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n14',type: 'transfer',    position: { x: 300, y: 660 }, data: { label: 'Fallback Agent',    destination: '0',    transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3'  },
        { id: 'e3-4',   source: 'n3',  target: 'n4'  },
        { id: 'e4-5',   source: 'n4',  target: 'n5',  sourceHandle: 'success' },
        { id: 'e4-13',  source: 'n4',  target: 'n13', sourceHandle: 'error'   },
        { id: 'e4-13t', source: 'n4',  target: 'n13', sourceHandle: 'timeout' },
        { id: 'e5-6',   source: 'n5',  target: 'n6',  sourceHandle: 'true'  },
        { id: 'e5-11',  source: 'n5',  target: 'n11', sourceHandle: 'false' },
        { id: 'e6-7',   source: 'n6',  target: 'n7',  sourceHandle: '1' },
        { id: 'e6-8',   source: 'n6',  target: 'n8',  sourceHandle: '2' },
        { id: 'e6-9',   source: 'n6',  target: 'n9',  sourceHandle: '3' },
        { id: 'e6-10',  source: 'n6',  target: 'n10', sourceHandle: '0' },
        { id: 'e11-12', source: 'n11', target: 'n12' },
        { id: 'e13-14', source: 'n13', target: 'n14' },
      ],
    },
  },

  {
    id: 'order_status',
    name: 'Order Status Self-Service',
    description: 'Customer enters their order number; API retrieves status and announces it, with option to speak to an agent',
    category: 'API-Driven',
    icon: 'order',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio',  position: { x: 300, y: 40  }, data: { label: 'Welcome',           file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'get_digits',  position: { x: 300, y: 160 }, data: { label: 'Enter Order No.',   prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 4, max_digits: 12, timeout_ms: 10000, retries: 3, valid_digits: ['0','1','2','3','4','5','6','7','8','9'] } },
        { id: 'n3', type: 'api_call',    position: { x: 300, y: 300 }, data: { label: 'Fetch Order Status',url: 'https://api.example.com/orders/{{digits}}', method: 'GET', timeout_ms: 5000, response_map: [{ json_path: '$.status', variable: 'order_status' }, { json_path: '$.eta', variable: 'order_eta' }] } },
        { id: 'n4', type: 'condition',   position: { x: 300, y: 440 }, data: { label: 'Order Found?',      variable: 'order_status', operator: 'not_empty', value: '' } },
        { id: 'n5', type: 'set_variable',position: { x: 100, y: 580 }, data: { label: 'Log Status Read',   key: 'status_played', value: 'true' } },
        { id: 'n6', type: 'get_digits',  position: { x: 100, y: 700 }, data: { label: 'After Status Menu', prompt_file: 'ivr/ivr-to_repeat_these_options.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 2, valid_digits: ['1','2','0'] } },
        { id: 'n7', type: 'transfer',    position: { x: 0,   y: 860 }, data: { label: 'Repeat (loop)',     destination: '{{dnis}}', transfer_type: 'blind' } },
        { id: 'n8', type: 'transfer',    position: { x: 200, y: 860 }, data: { label: 'Speak to Agent',    destination: '1001',     transfer_type: 'blind' } },
        { id: 'n9', type: 'hangup',      position: { x: 400, y: 860 }, data: { label: 'Hangup',            cause: 'NORMAL_CLEARING' } },
        { id: 'n10',type: 'play_audio',  position: { x: 500, y: 440 }, data: { label: 'Not Found Msg',     file: 'ivr/ivr-invalid_number.wav' } },
        { id: 'n11',type: 'transfer',    position: { x: 500, y: 580 }, data: { label: 'Agent Fallback',    destination: '1001',     transfer_type: 'blind' } },
        { id: 'n12',type: 'play_audio',  position: { x: 300, y: 500 }, data: { label: 'API Error Msg',     file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n13',type: 'transfer',    position: { x: 300, y: 620 }, data: { label: 'Agent',             destination: '1001',     transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3'  },
        { id: 'e3-4',   source: 'n3',  target: 'n4',  sourceHandle: 'success' },
        { id: 'e3-12',  source: 'n3',  target: 'n12', sourceHandle: 'error'   },
        { id: 'e3-12t', source: 'n3',  target: 'n12', sourceHandle: 'timeout' },
        { id: 'e4-5',   source: 'n4',  target: 'n5',  sourceHandle: 'true'  },
        { id: 'e4-10',  source: 'n4',  target: 'n10', sourceHandle: 'false' },
        { id: 'e5-6',   source: 'n5',  target: 'n6'  },
        { id: 'e6-7',   source: 'n6',  target: 'n7',  sourceHandle: '1' },
        { id: 'e6-8',   source: 'n6',  target: 'n8',  sourceHandle: '0' },
        { id: 'e6-9',   source: 'n6',  target: 'n9',  sourceHandle: '2' },
        { id: 'e10-11', source: 'n10', target: 'n11' },
        { id: 'e12-13', source: 'n12', target: 'n13' },
      ],
    },
  },

  {
    id: 'dynamic_skills_routing',
    name: 'Dynamic Skills-Based Routing',
    description: 'API fetches caller profile (language, priority, product) and sets routing variables; conditions direct to the right agent queue',
    category: 'API-Driven',
    icon: 'routing',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio',  position: { x: 300, y: 40  }, data: { label: 'Welcome',             file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'api_call',    position: { x: 300, y: 160 }, data: { label: 'Fetch Caller Profile', url: 'https://api.example.com/profile?ani={{ani}}', method: 'GET', timeout_ms: 4000, response_map: [{ json_path: '$.language', variable: 'lang' }, { json_path: '$.priority', variable: 'priority' }, { json_path: '$.product', variable: 'product' }] } },
        { id: 'n3', type: 'condition',   position: { x: 300, y: 300 }, data: { label: 'High Priority?',       variable: 'priority', operator: 'eq', value: 'high' } },
        { id: 'n4', type: 'condition',   position: { x: 100, y: 440 }, data: { label: 'Language = ES?',       variable: 'lang', operator: 'eq', value: 'es' } },
        { id: 'n5', type: 'transfer',    position: { x: 0,   y: 580 }, data: { label: 'VIP Spanish Queue',    destination: '1010', transfer_type: 'blind' } },
        { id: 'n6', type: 'transfer',    position: { x: 200, y: 580 }, data: { label: 'VIP English Queue',    destination: '1011', transfer_type: 'blind' } },
        { id: 'n7', type: 'condition',   position: { x: 520, y: 440 }, data: { label: 'Product = Enterprise?',variable: 'product', operator: 'eq', value: 'enterprise' } },
        { id: 'n8', type: 'transfer',    position: { x: 400, y: 580 }, data: { label: 'Enterprise Queue',     destination: '1020', transfer_type: 'blind' } },
        { id: 'n9', type: 'transfer',    position: { x: 620, y: 580 }, data: { label: 'Standard Queue',       destination: '1002', transfer_type: 'blind' } },
        { id: 'n10',type: 'play_audio',  position: { x: 300, y: 420 }, data: { label: 'API Error',            file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n11',type: 'transfer',    position: { x: 300, y: 540 }, data: { label: 'Default Queue',        destination: '1002', transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: 'success' },
        { id: 'e2-10',  source: 'n2',  target: 'n10', sourceHandle: 'error'   },
        { id: 'e2-10t', source: 'n2',  target: 'n10', sourceHandle: 'timeout' },
        { id: 'e3-4',   source: 'n3',  target: 'n4',  sourceHandle: 'true'  },
        { id: 'e3-7',   source: 'n3',  target: 'n7',  sourceHandle: 'false' },
        { id: 'e4-5',   source: 'n4',  target: 'n5',  sourceHandle: 'true'  },
        { id: 'e4-6',   source: 'n4',  target: 'n6',  sourceHandle: 'false' },
        { id: 'e7-8',   source: 'n7',  target: 'n8',  sourceHandle: 'true'  },
        { id: 'e7-9',   source: 'n7',  target: 'n9',  sourceHandle: 'false' },
        { id: 'e10-11', source: 'n10', target: 'n11' },
      ],
    },
  },

  // ── Multi-Level IVR Templates ───────────────────────────────────────────────

  {
    id: 'enterprise_2level',
    name: 'Enterprise 2-Level Menu',
    description: 'Two-tier IVR: top menu routes to department sub-menus (Sales, Support, Billing), each with their own options',
    category: 'Multi-Level',
    icon: 'tree',
    graph: {
      nodes: [
        // Level 0 — entry
        { id: 'n1',  type: 'play_audio', position: { x: 460, y: 0   }, data: { label: 'Welcome',              file: 'ivr/ivr-thank_you_for_calling.wav' } },
        // Level 1 — main menu
        { id: 'n2',  type: 'get_digits', position: { x: 460, y: 120 }, data: { label: 'Main Menu',            prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','0'] } },
        // Level 2 — Sales sub-menu
        { id: 'n3',  type: 'play_audio', position: { x: 80,  y: 280 }, data: { label: 'Sales Intro',          file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n4',  type: 'get_digits', position: { x: 80,  y: 400 }, data: { label: 'Sales Sub-Menu',       prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n5',  type: 'transfer',   position: { x: 0,   y: 560 }, data: { label: 'New Sales',            destination: '2001', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',   position: { x: 160, y: 560 }, data: { label: 'Existing Account',     destination: '2002', transfer_type: 'blind' } },
        // Level 2 — Support sub-menu
        { id: 'n7',  type: 'play_audio', position: { x: 400, y: 280 }, data: { label: 'Support Intro',        file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n8',  type: 'get_digits', position: { x: 400, y: 400 }, data: { label: 'Support Sub-Menu',     prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        { id: 'n9',  type: 'transfer',   position: { x: 300, y: 560 }, data: { label: 'Technical Support',    destination: '3001', transfer_type: 'blind' } },
        { id: 'n10', type: 'transfer',   position: { x: 460, y: 560 }, data: { label: 'General Support',      destination: '3002', transfer_type: 'blind' } },
        { id: 'n11', type: 'voicemail',  position: { x: 620, y: 560 }, data: { label: 'Support Voicemail',    mailbox_id: '3000' } },
        // Level 2 — Billing sub-menu
        { id: 'n12', type: 'play_audio', position: { x: 720, y: 280 }, data: { label: 'Billing Intro',        file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n13', type: 'get_digits', position: { x: 720, y: 400 }, data: { label: 'Billing Sub-Menu',     prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n14', type: 'transfer',   position: { x: 640, y: 560 }, data: { label: 'Make Payment',         destination: '4001', transfer_type: 'blind' } },
        { id: 'n15', type: 'transfer',   position: { x: 800, y: 560 }, data: { label: 'Invoice Queries',      destination: '4002', transfer_type: 'blind' } },
        // Level 1 — direct operator
        { id: 'n16', type: 'transfer',   position: { x: 960, y: 280 }, data: { label: 'Operator',             destination: '0',    transfer_type: 'blind' } },
        // Timeout → voicemail
        { id: 'n17', type: 'voicemail',  position: { x: 460, y: 560 }, data: { label: 'No Input → VM',        mailbox_id: '1000' } },
        // Back-to-main from sub-menus (timeout → back to main)
        { id: 'n18', type: 'transfer',   position: { x: 80,  y: 560 }, data: { label: 'Back to Main',         destination: '{{dnis}}', transfer_type: 'blind' } },
      ],
      edges: [
        // Entry
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        // Main menu
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: '1' },
        { id: 'e2-7',   source: 'n2',  target: 'n7',  sourceHandle: '2' },
        { id: 'e2-12',  source: 'n2',  target: 'n12', sourceHandle: '3' },
        { id: 'e2-16',  source: 'n2',  target: 'n16', sourceHandle: '0' },
        { id: 'e2-17',  source: 'n2',  target: 'n17', sourceHandle: 'timeout' },
        // Sales sub-menu
        { id: 'e3-4',   source: 'n3',  target: 'n4'  },
        { id: 'e4-5',   source: 'n4',  target: 'n5',  sourceHandle: '1' },
        { id: 'e4-6',   source: 'n4',  target: 'n6',  sourceHandle: '2' },
        { id: 'e4-18',  source: 'n4',  target: 'n18', sourceHandle: '9' },
        { id: 'e4-18t', source: 'n4',  target: 'n18', sourceHandle: 'timeout' },
        // Support sub-menu
        { id: 'e7-8',   source: 'n7',  target: 'n8'  },
        { id: 'e8-9',   source: 'n8',  target: 'n9',  sourceHandle: '1' },
        { id: 'e8-10',  source: 'n8',  target: 'n10', sourceHandle: '2' },
        { id: 'e8-11',  source: 'n8',  target: 'n11', sourceHandle: '3' },
        { id: 'e8-18',  source: 'n8',  target: 'n18', sourceHandle: '9' },
        // Billing sub-menu
        { id: 'e12-13', source: 'n12', target: 'n13' },
        { id: 'e13-14', source: 'n13', target: 'n14', sourceHandle: '1' },
        { id: 'e13-15', source: 'n13', target: 'n15', sourceHandle: '2' },
        { id: 'e13-18', source: 'n13', target: 'n18', sourceHandle: '9' },
      ],
    },
  },

  {
    id: 'healthcare_multilevel',
    name: 'Healthcare 2-Level IVR',
    description: 'Medical centre top menu (Medical / Dental / Billing / Reception) each expanding to specialist sub-options',
    category: 'Multi-Level',
    icon: 'medical-tree',
    graph: {
      nodes: [
        // Entry
        { id: 'n1',  type: 'play_audio',    position: { x: 400, y: 0   }, data: { label: 'Medical Centre',      file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'time_condition', position: { x: 400, y: 120 }, data: { label: 'Open Hours?',         schedule: { open: '08:00', close: '18:00', days: 'mon-fri' } } },
        // Main menu (open)
        { id: 'n3',  type: 'get_digits',    position: { x: 200, y: 280 }, data: { label: 'Main Menu',           prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','0'] } },
        // Medical sub-menu
        { id: 'n4',  type: 'get_digits',    position: { x: 0,   y: 440 }, data: { label: 'Medical Sub-Menu',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        { id: 'n5',  type: 'transfer',      position: { x: 0,   y: 600 }, data: { label: 'GP Appointments',     destination: '2001', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',      position: { x: 160, y: 600 }, data: { label: 'Specialist Referral', destination: '2002', transfer_type: 'blind' } },
        { id: 'n7',  type: 'transfer',      position: { x: 320, y: 600 }, data: { label: '🚨 Urgent Care',      destination: '2099', transfer_type: 'blind' } },
        // Dental sub-menu
        { id: 'n8',  type: 'get_digits',    position: { x: 320, y: 440 }, data: { label: 'Dental Sub-Menu',     prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n9',  type: 'transfer',      position: { x: 480, y: 600 }, data: { label: 'Routine Dental',      destination: '3001', transfer_type: 'blind' } },
        { id: 'n10', type: 'transfer',      position: { x: 640, y: 600 }, data: { label: '🚨 Dental Emergency', destination: '3099', transfer_type: 'blind' } },
        // Billing
        { id: 'n11', type: 'transfer',      position: { x: 600, y: 440 }, data: { label: 'Billing Dept',        destination: '4001', transfer_type: 'blind' } },
        // Receptionist
        { id: 'n12', type: 'transfer',      position: { x: 800, y: 440 }, data: { label: 'Reception',           destination: '0',    transfer_type: 'blind' } },
        // Timeout / no input
        { id: 'n13', type: 'voicemail',     position: { x: 200, y: 560 }, data: { label: 'No Input → VM',       mailbox_id: '1000' } },
        // After hours
        { id: 'n14', type: 'play_audio',    position: { x: 620, y: 280 }, data: { label: 'After Hours',         file: 'ivr/ivr-not_available.wav' } },
        { id: 'n15', type: 'get_digits',    position: { x: 620, y: 400 }, data: { label: 'After Hours Menu',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2'] } },
        { id: 'n16', type: 'transfer',      position: { x: 540, y: 540 }, data: { label: '🚨 Emergency Line',   destination: '9001', transfer_type: 'blind' } },
        { id: 'n17', type: 'voicemail',     position: { x: 720, y: 540 }, data: { label: 'After Hours VM',      mailbox_id: '1000' } },
        // Back to main
        { id: 'n18', type: 'transfer',      position: { x: 0,   y: 600 }, data: { label: 'Back to Main',        destination: '{{dnis}}', transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: 'open'   },
        { id: 'e2-14',  source: 'n2',  target: 'n14', sourceHandle: 'closed' },
        { id: 'e3-4',   source: 'n3',  target: 'n4',  sourceHandle: '1' },
        { id: 'e3-8',   source: 'n3',  target: 'n8',  sourceHandle: '2' },
        { id: 'e3-11',  source: 'n3',  target: 'n11', sourceHandle: '3' },
        { id: 'e3-12',  source: 'n3',  target: 'n12', sourceHandle: '0' },
        { id: 'e3-13',  source: 'n3',  target: 'n13', sourceHandle: 'timeout' },
        { id: 'e4-5',   source: 'n4',  target: 'n5',  sourceHandle: '1' },
        { id: 'e4-6',   source: 'n4',  target: 'n6',  sourceHandle: '2' },
        { id: 'e4-7',   source: 'n4',  target: 'n7',  sourceHandle: '3' },
        { id: 'e4-18',  source: 'n4',  target: 'n18', sourceHandle: '9' },
        { id: 'e8-9',   source: 'n8',  target: 'n9',  sourceHandle: '1' },
        { id: 'e8-10',  source: 'n8',  target: 'n10', sourceHandle: '2' },
        { id: 'e8-18',  source: 'n8',  target: 'n18', sourceHandle: '9' },
        { id: 'e14-15', source: 'n14', target: 'n15' },
        { id: 'e15-16', source: 'n15', target: 'n16', sourceHandle: '1' },
        { id: 'e15-17', source: 'n15', target: 'n17', sourceHandle: '2' },
      ],
    },
  },

  {
    id: 'isp_support_multilevel',
    name: 'ISP / Telecom Support Multi-Level',
    description: 'Three-department (Internet, Phone, Billing) top menu each drilling into fault types, with API fault-check on Internet path',
    category: 'Multi-Level',
    icon: 'telecom',
    graph: {
      nodes: [
        // Entry
        { id: 'n1',  type: 'play_audio', position: { x: 460, y: 0   }, data: { label: 'Welcome',             file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'play_audio', position: { x: 460, y: 120 }, data: { label: 'Security Notice',     file: 'ivr/ivr-this_call_may_be_recorded.wav' } },
        // Main menu
        { id: 'n3',  type: 'get_digits', position: { x: 460, y: 240 }, data: { label: 'Main Menu',           prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','0'] } },
        // Internet sub-menu
        { id: 'n4',  type: 'api_call',   position: { x: 80,  y: 400 }, data: { label: 'Check Outage Status', url: 'https://api.example.com/outage?area={{ani}}', method: 'GET', timeout_ms: 4000, response_map: [{ json_path: '$.outage', variable: 'is_outage' }] } },
        { id: 'n5',  type: 'condition',  position: { x: 80,  y: 540 }, data: { label: 'Known Outage?',       variable: 'is_outage', operator: 'eq', value: 'true' } },
        { id: 'n6',  type: 'play_audio', position: { x: 0,   y: 680 }, data: { label: 'Outage Announcement', file: 'ivr/ivr-please_stay_on_the_line.wav' } },
        { id: 'n7',  type: 'hangup',     position: { x: 0,   y: 800 }, data: { label: 'Hangup',              cause: 'NORMAL_CLEARING' } },
        { id: 'n8',  type: 'get_digits', position: { x: 200, y: 680 }, data: { label: 'Internet Sub-Menu',   prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        { id: 'n9',  type: 'transfer',   position: { x: 140, y: 820 }, data: { label: 'Broadband Faults',    destination: '5001', transfer_type: 'blind' } },
        { id: 'n10', type: 'transfer',   position: { x: 300, y: 820 }, data: { label: 'Speed Issues',        destination: '5002', transfer_type: 'blind' } },
        { id: 'n11', type: 'transfer',   position: { x: 460, y: 820 }, data: { label: 'New Setup',           destination: '5003', transfer_type: 'blind' } },
        // Phone sub-menu
        { id: 'n12', type: 'get_digits', position: { x: 520, y: 400 }, data: { label: 'Phone Sub-Menu',      prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        { id: 'n13', type: 'transfer',   position: { x: 400, y: 560 }, data: { label: 'No Dial Tone',        destination: '6001', transfer_type: 'blind' } },
        { id: 'n14', type: 'transfer',   position: { x: 560, y: 560 }, data: { label: 'Call Quality',        destination: '6002', transfer_type: 'blind' } },
        { id: 'n15', type: 'transfer',   position: { x: 720, y: 560 }, data: { label: 'International Calls', destination: '6003', transfer_type: 'blind' } },
        // Billing sub-menu
        { id: 'n16', type: 'get_digits', position: { x: 760, y: 400 }, data: { label: 'Billing Sub-Menu',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n17', type: 'transfer',   position: { x: 680, y: 560 }, data: { label: 'Pay Bill',            destination: '7001', transfer_type: 'blind' } },
        { id: 'n18', type: 'transfer',   position: { x: 840, y: 560 }, data: { label: 'Billing Queries',     destination: '7002', transfer_type: 'blind' } },
        // TV
        { id: 'n19', type: 'transfer',   position: { x: 960, y: 400 }, data: { label: 'TV Support',          destination: '8001', transfer_type: 'blind' } },
        // Operator
        { id: 'n20', type: 'transfer',   position: { x: 1100,y: 400 }, data: { label: 'Operator',            destination: '0',    transfer_type: 'blind' } },
        // Back to main
        { id: 'n21', type: 'transfer',   position: { x: 80,  y: 820 }, data: { label: 'Back to Main',        destination: '{{dnis}}', transfer_type: 'blind' } },
        // Timeout
        { id: 'n22', type: 'voicemail',  position: { x: 460, y: 400 }, data: { label: 'No Input → VM',       mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3'  },
        // Main menu
        { id: 'e3-4',   source: 'n3',  target: 'n4',  sourceHandle: '1' },
        { id: 'e3-12',  source: 'n3',  target: 'n12', sourceHandle: '2' },
        { id: 'e3-16',  source: 'n3',  target: 'n16', sourceHandle: '3' },
        { id: 'e3-19',  source: 'n3',  target: 'n19', sourceHandle: '4' },
        { id: 'e3-20',  source: 'n3',  target: 'n20', sourceHandle: '0' },
        { id: 'e3-22',  source: 'n3',  target: 'n22', sourceHandle: 'timeout' },
        // Internet path
        { id: 'e4-5',   source: 'n4',  target: 'n5',  sourceHandle: 'success' },
        { id: 'e4-8',   source: 'n4',  target: 'n8',  sourceHandle: 'error'   },
        { id: 'e4-8t',  source: 'n4',  target: 'n8',  sourceHandle: 'timeout' },
        { id: 'e5-6',   source: 'n5',  target: 'n6',  sourceHandle: 'true'  },
        { id: 'e5-8',   source: 'n5',  target: 'n8',  sourceHandle: 'false' },
        { id: 'e6-7',   source: 'n6',  target: 'n7'  },
        { id: 'e8-9',   source: 'n8',  target: 'n9',  sourceHandle: '1' },
        { id: 'e8-10',  source: 'n8',  target: 'n10', sourceHandle: '2' },
        { id: 'e8-11',  source: 'n8',  target: 'n11', sourceHandle: '3' },
        { id: 'e8-21',  source: 'n8',  target: 'n21', sourceHandle: '9' },
        // Phone path
        { id: 'e12-13', source: 'n12', target: 'n13', sourceHandle: '1' },
        { id: 'e12-14', source: 'n12', target: 'n14', sourceHandle: '2' },
        { id: 'e12-15', source: 'n12', target: 'n15', sourceHandle: '3' },
        { id: 'e12-21', source: 'n12', target: 'n21', sourceHandle: '9' },
        // Billing path
        { id: 'e16-17', source: 'n16', target: 'n17', sourceHandle: '1' },
        { id: 'e16-18', source: 'n16', target: 'n18', sourceHandle: '2' },
        { id: 'e16-21', source: 'n16', target: 'n21', sourceHandle: '9' },
      ],
    },
  },
];
