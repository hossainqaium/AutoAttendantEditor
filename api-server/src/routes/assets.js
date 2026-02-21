'use strict';

const pool = require('../db');

module.exports = async function assetsRoutes(fastify) {

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
    category: 'Advanced',
    icon: 'api',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio',   position: { x: 300, y: 40  }, data: { label: 'Welcome',        file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'api_call',     position: { x: 300, y: 160 }, data: { label: 'Lookup Caller',  url: 'https://api.example.com/caller?ani={{ani}}', method: 'GET', timeout_ms: 3000, response_map: [{ json_path: '$.tier', variable: 'customer_tier' }] } },
        { id: 'n3', type: 'condition',    position: { x: 300, y: 300 }, data: { label: 'VIP?',           variable: 'customer_tier', operator: 'eq', value: 'vip' } },
        { id: 'n4', type: 'transfer',     position: { x: 100, y: 440 }, data: { label: 'VIP Queue',      destination: '1010', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',     position: { x: 300, y: 440 }, data: { label: 'Standard Queue', destination: '1002', transfer_type: 'blind' } },
        { id: 'n6', type: 'play_audio',   position: { x: 500, y: 300 }, data: { label: 'API Error Msg',  file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n7', type: 'transfer',     position: { x: 500, y: 440 }, data: { label: 'Fallback',       destination: '1002', transfer_type: 'blind' } },
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
];
