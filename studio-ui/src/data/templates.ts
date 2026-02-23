// =============================================================================
// IVR Studio — Static Template Catalog
// All templates are embedded here so they are always available regardless of
// API server / database connectivity.  The TemplatesModal reads this file
// directly instead of calling /api/templates.
// =============================================================================

import type { IvrTemplate } from '../api/client';

export const TEMPLATES: IvrTemplate[] = [

  // ── General ────────────────────────────────────────────────────────────────

  {
    id: 'simple_menu',
    name: 'Simple Main Menu',
    description: 'Classic press-1-for-X IVR menu with up to 4 department options',
    category: 'General',
    icon: 'menu',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio', position: { x: 300, y: 40  }, data: { label: 'Welcome',       file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'get_digits', position: { x: 300, y: 160 }, data: { label: 'Main Menu',     prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 3, valid_digits: ['1','2','3','0'] } },
        { id: 'n3', type: 'transfer',   position: { x: 80,  y: 320 }, data: { label: 'Sales',         destination: '1001', transfer_type: 'blind' } },
        { id: 'n4', type: 'transfer',   position: { x: 260, y: 320 }, data: { label: 'Support',       destination: '1002', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',   position: { x: 440, y: 320 }, data: { label: 'Billing',       destination: '1003', transfer_type: 'blind' } },
        { id: 'n6', type: 'transfer',   position: { x: 620, y: 320 }, data: { label: 'Operator',      destination: '0',    transfer_type: 'blind' } },
        { id: 'n7', type: 'voicemail',  position: { x: 300, y: 460 }, data: { label: 'No Input → VM', mailbox_id: '1000' } },
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

  // ── API-Driven (original) ──────────────────────────────────────────────────

  {
    id: 'api_lookup',
    name: 'API-Driven Caller Lookup',
    description: 'Looks up caller data via API, then routes based on result (VIP vs standard)',
    category: 'API-Driven',
    icon: 'api',
    graph: {
      nodes: [
        { id: 'n1', type: 'play_audio', position: { x: 300, y: 40  }, data: { label: 'Welcome',        file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'api_call',   position: { x: 300, y: 160 }, data: { label: 'Lookup Caller',  url: 'https://api.example.com/caller?ani={{ani}}', method: 'GET', timeout_ms: 3000, response_map: [{ json_path: '$.tier', variable: 'customer_tier' }] } },
        { id: 'n3', type: 'condition',  position: { x: 300, y: 300 }, data: { label: 'VIP?',           variable: 'customer_tier', operator: 'eq', value: 'vip' } },
        { id: 'n4', type: 'transfer',   position: { x: 100, y: 440 }, data: { label: 'VIP Queue',      destination: '1010', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',   position: { x: 300, y: 440 }, data: { label: 'Standard Queue', destination: '1002', transfer_type: 'blind' } },
        { id: 'n6', type: 'play_audio', position: { x: 520, y: 300 }, data: { label: 'API Error Msg',  file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n7', type: 'transfer',   position: { x: 520, y: 440 }, data: { label: 'Fallback',       destination: '1002', transfer_type: 'blind' } },
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

  // ── Business Templates ─────────────────────────────────────────────────────

  {
    id: 'healthcare_office',
    name: 'Healthcare / Medical Office',
    description: 'Medical office IVR with appointments, billing, pharmacy, nurse line and after-hours voicemail',
    category: 'Business',
    icon: 'medical',
    graph: {
      nodes: [
        { id: 'n1',  type: 'play_audio',    position: { x: 360, y: 40  }, data: { label: 'Welcome',         file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'time_condition', position: { x: 360, y: 160 }, data: { label: 'Office Hours?',   schedule: { open: '08:00', close: '18:00', days: 'mon-fri' } } },
        { id: 'n3',  type: 'get_digits',    position: { x: 160, y: 320 }, data: { label: 'Main Menu',       prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','0'] } },
        { id: 'n4',  type: 'transfer',      position: { x: 0,   y: 480 }, data: { label: 'Appointments',    destination: '1001', transfer_type: 'blind' } },
        { id: 'n5',  type: 'transfer',      position: { x: 180, y: 480 }, data: { label: 'Billing',         destination: '1002', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',      position: { x: 360, y: 480 }, data: { label: 'Pharmacy',        destination: '1003', transfer_type: 'blind' } },
        { id: 'n7',  type: 'transfer',      position: { x: 540, y: 480 }, data: { label: 'Nurse Line',      destination: '1004', transfer_type: 'blind' } },
        { id: 'n8',  type: 'transfer',      position: { x: 720, y: 480 }, data: { label: 'Receptionist',    destination: '0',    transfer_type: 'blind' } },
        { id: 'n9',  type: 'voicemail',     position: { x: 160, y: 600 }, data: { label: 'No Input → VM',   mailbox_id: '1000' } },
        { id: 'n10', type: 'play_audio',    position: { x: 580, y: 320 }, data: { label: 'After Hours Msg', file: 'ivr/ivr-not_available.wav' } },
        { id: 'n11', type: 'voicemail',     position: { x: 580, y: 460 }, data: { label: 'After Hours VM',  mailbox_id: '1000' } },
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
        { id: 'e1-2', source: 'n1', target: 'n2' },
        { id: 'e2-3', source: 'n2', target: 'n3', sourceHandle: '1' },
        { id: 'e2-4', source: 'n2', target: 'n4', sourceHandle: '2' },
        { id: 'e2-5', source: 'n2', target: 'n5', sourceHandle: '3' },
        { id: 'e2-6', source: 'n2', target: 'n6', sourceHandle: '4' },
        { id: 'e2-9', source: 'n2', target: 'n9', sourceHandle: 'timeout' },
        { id: 'e4-7', source: 'n4', target: 'n7' },
        { id: 'e7-8', source: 'n7', target: 'n8' },
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
        { id: 'n1', type: 'play_audio', position: { x: 360, y: 40  }, data: { label: 'Hotel Welcome',  file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2', type: 'get_digits', position: { x: 360, y: 160 }, data: { label: 'Main Menu',      prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','5','0'] } },
        { id: 'n3', type: 'transfer',   position: { x: 0,   y: 320 }, data: { label: 'Reservations',   destination: '1001', transfer_type: 'blind' } },
        { id: 'n4', type: 'transfer',   position: { x: 150, y: 320 }, data: { label: 'Concierge',      destination: '1002', transfer_type: 'blind' } },
        { id: 'n5', type: 'transfer',   position: { x: 300, y: 320 }, data: { label: 'Room Service',   destination: '1003', transfer_type: 'blind' } },
        { id: 'n6', type: 'transfer',   position: { x: 450, y: 320 }, data: { label: 'Housekeeping',   destination: '1004', transfer_type: 'blind' } },
        { id: 'n7', type: 'transfer',   position: { x: 600, y: 320 }, data: { label: 'Spa & Wellness', destination: '1005', transfer_type: 'blind' } },
        { id: 'n8', type: 'transfer',   position: { x: 750, y: 320 }, data: { label: 'Front Desk',     destination: '0',    transfer_type: 'blind' } },
        { id: 'n9', type: 'voicemail',  position: { x: 360, y: 440 }, data: { label: 'No Input → VM',  mailbox_id: '1000' } },
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
        { id: 'n1',  type: 'play_audio',    position: { x: 300, y: 40  }, data: { label: 'Welcome',          file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'time_condition', position: { x: 300, y: 160 }, data: { label: 'Office Open?',     schedule: { open: '09:00', close: '17:30', days: 'mon-sat' } } },
        { id: 'n3',  type: 'get_digits',    position: { x: 100, y: 320 }, data: { label: 'Main Menu',         prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','0'] } },
        { id: 'n4',  type: 'transfer',      position: { x: 0,   y: 480 }, data: { label: 'Buy / Sell',        destination: '1001', transfer_type: 'blind' } },
        { id: 'n5',  type: 'transfer',      position: { x: 180, y: 480 }, data: { label: 'Rentals',           destination: '1002', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',      position: { x: 360, y: 480 }, data: { label: 'Property Mgmt',     destination: '1003', transfer_type: 'blind' } },
        { id: 'n7',  type: 'voicemail',     position: { x: 540, y: 480 }, data: { label: 'Valuation Request', mailbox_id: '1004' } },
        { id: 'n8',  type: 'transfer',      position: { x: 720, y: 480 }, data: { label: 'Speak to Agent',    destination: '0',    transfer_type: 'blind' } },
        { id: 'n9',  type: 'voicemail',     position: { x: 100, y: 600 }, data: { label: 'No Input → VM',     mailbox_id: '1000' } },
        { id: 'n10', type: 'play_audio',    position: { x: 520, y: 320 }, data: { label: 'After Hours Msg',   file: 'ivr/ivr-not_available.wav' } },
        { id: 'n11', type: 'voicemail',     position: { x: 520, y: 460 }, data: { label: 'After Hours VM',    mailbox_id: '1000' } },
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
        { id: 'n1',  type: 'play_audio', position: { x: 400, y: 40  }, data: { label: 'Welcome',          file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'play_audio', position: { x: 400, y: 160 }, data: { label: 'Security Notice',  file: 'ivr/ivr-this_call_may_be_recorded.wav' } },
        { id: 'n3',  type: 'get_digits', position: { x: 400, y: 280 }, data: { label: 'Main Menu',        prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','5','9'] } },
        { id: 'n4',  type: 'transfer',   position: { x: 0,   y: 440 }, data: { label: 'Account Services', destination: '1001', transfer_type: 'blind' } },
        { id: 'n5',  type: 'transfer',   position: { x: 160, y: 440 }, data: { label: 'Loans & Mortgages',destination: '1002', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',   position: { x: 320, y: 440 }, data: { label: 'Credit / Debit',   destination: '1003', transfer_type: 'blind' } },
        { id: 'n7',  type: 'transfer',   position: { x: 480, y: 440 }, data: { label: 'Investments',      destination: '1004', transfer_type: 'blind' } },
        { id: 'n8',  type: 'transfer',   position: { x: 640, y: 440 }, data: { label: 'Online Banking',   destination: '1005', transfer_type: 'blind' } },
        { id: 'n9',  type: 'transfer',   position: { x: 800, y: 440 }, data: { label: 'Fraud Hotline',    destination: '1999', transfer_type: 'blind' } },
        { id: 'n10', type: 'voicemail',  position: { x: 400, y: 560 }, data: { label: 'No Input → VM',    mailbox_id: '1000' } },
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
        { id: 'n1', type: 'play_audio',   position: { x: 300, y: 40  }, data: { label: 'After Hours',       file: 'ivr/ivr-not_available.wav' } },
        { id: 'n2', type: 'get_digits',   position: { x: 300, y: 160 }, data: { label: 'Emergency Menu',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 8000, retries: 2, valid_digits: ['1','2','3'] } },
        { id: 'n3', type: 'play_audio',   position: { x: 80,  y: 320 }, data: { label: 'Routing Emergency', file: 'ivr/ivr-your_call_is_being_placed.wav' } },
        { id: 'n4', type: 'transfer',     position: { x: 80,  y: 440 }, data: { label: 'On-Call Engineer',  destination: '1099', transfer_type: 'blind' } },
        { id: 'n5', type: 'voicemail',    position: { x: 300, y: 320 }, data: { label: 'Leave a Message',   mailbox_id: '1000' } },
        { id: 'n6', type: 'set_variable', position: { x: 520, y: 320 }, data: { label: 'Flag Callback',     key: 'callback_requested', value: 'true' } },
        { id: 'n7', type: 'play_audio',   position: { x: 520, y: 440 }, data: { label: 'Callback Confirm',  file: 'ivr/ivr-thank_you.wav' } },
        { id: 'n8', type: 'hangup',       position: { x: 520, y: 540 }, data: { label: 'Hangup',            cause: 'NORMAL_CLEARING' } },
        { id: 'n9', type: 'voicemail',    position: { x: 300, y: 460 }, data: { label: 'No Input → VM',     mailbox_id: '1000' } },
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

  // ─── NEW Business Templates ────────────────────────────────────────────────

  {
    id: 'legal_office',
    name: 'Legal Office / Law Firm',
    description: 'Law firm IVR with case enquiries, new client consultations, billing, urgent matters, and after-hours on-call routing',
    category: 'Business',
    icon: 'legal',
    graph: {
      nodes: [
        { id: 'n1',  type: 'play_audio',    position: { x: 400, y: 0   }, data: { label: 'Firm Welcome',       file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'time_condition', position: { x: 400, y: 120 }, data: { label: 'Office Hours?',      schedule: { open: '09:00', close: '17:30', days: 'mon-fri' } } },
        // ── Open hours ──
        { id: 'n3',  type: 'play_audio',    position: { x: 180, y: 280 }, data: { label: 'Confidentiality',    file: 'ivr/ivr-this_call_may_be_recorded.wav' } },
        { id: 'n4',  type: 'get_digits',    position: { x: 180, y: 400 }, data: { label: 'Main Menu',           prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 7000, retries: 3, valid_digits: ['1','2','3','4','5','9','0'] } },
        { id: 'n5',  type: 'transfer',      position: { x: 0,   y: 560 }, data: { label: 'Existing Cases',     destination: '2001', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',      position: { x: 160, y: 560 }, data: { label: 'New Consultation',   destination: '2002', transfer_type: 'blind' } },
        { id: 'n7',  type: 'transfer',      position: { x: 320, y: 560 }, data: { label: 'Billing & Invoices', destination: '2003', transfer_type: 'blind' } },
        { id: 'n8',  type: 'transfer',      position: { x: 480, y: 560 }, data: { label: 'Court Documents',    destination: '2004', transfer_type: 'blind' } },
        { id: 'n9',  type: 'play_audio',    position: { x: 640, y: 480 }, data: { label: 'Urgent Routing Msg', file: 'ivr/ivr-your_call_is_being_placed.wav' } },
        { id: 'n10', type: 'transfer',      position: { x: 640, y: 600 }, data: { label: 'Duty Solicitor',     destination: '2099', transfer_type: 'blind' } },
        { id: 'n11', type: 'voicemail',     position: { x: 800, y: 560 }, data: { label: 'Paralegal VM',       mailbox_id: '2010' } },
        { id: 'n12', type: 'transfer',      position: { x: 960, y: 560 }, data: { label: 'Reception',          destination: '0',    transfer_type: 'blind' } },
        { id: 'n13', type: 'voicemail',     position: { x: 180, y: 680 }, data: { label: 'No Input → VM',      mailbox_id: '2000' } },
        // ── After hours ──
        { id: 'n14', type: 'play_audio',    position: { x: 660, y: 280 }, data: { label: 'After Hours Msg',    file: 'ivr/ivr-not_available.wav' } },
        { id: 'n15', type: 'get_digits',    position: { x: 660, y: 400 }, data: { label: 'After Hours Menu',   prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 7000, retries: 2, valid_digits: ['1','2'] } },
        { id: 'n16', type: 'play_audio',    position: { x: 560, y: 560 }, data: { label: 'Emergency Routing',  file: 'ivr/ivr-your_call_is_being_placed.wav' } },
        { id: 'n17', type: 'transfer',      position: { x: 560, y: 680 }, data: { label: 'On-Call Solicitor',  destination: '2099', transfer_type: 'blind' } },
        { id: 'n18', type: 'voicemail',     position: { x: 760, y: 560 }, data: { label: 'After Hours VM',     mailbox_id: '2000' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: 'open'   },
        { id: 'e2-14',  source: 'n2',  target: 'n14', sourceHandle: 'closed' },
        { id: 'e3-4',   source: 'n3',  target: 'n4'  },
        { id: 'e4-5',   source: 'n4',  target: 'n5',  sourceHandle: '1' },
        { id: 'e4-6',   source: 'n4',  target: 'n6',  sourceHandle: '2' },
        { id: 'e4-7',   source: 'n4',  target: 'n7',  sourceHandle: '3' },
        { id: 'e4-8',   source: 'n4',  target: 'n8',  sourceHandle: '4' },
        { id: 'e4-9',   source: 'n4',  target: 'n9',  sourceHandle: '5' },
        { id: 'e4-11',  source: 'n4',  target: 'n11', sourceHandle: '9' },
        { id: 'e4-12',  source: 'n4',  target: 'n12', sourceHandle: '0' },
        { id: 'e4-13',  source: 'n4',  target: 'n13', sourceHandle: 'timeout' },
        { id: 'e9-10',  source: 'n9',  target: 'n10' },
        { id: 'e14-15', source: 'n14', target: 'n15' },
        { id: 'e15-16', source: 'n15', target: 'n16', sourceHandle: '1' },
        { id: 'e15-18', source: 'n15', target: 'n18', sourceHandle: '2' },
        { id: 'e16-17', source: 'n16', target: 'n17' },
      ],
    },
  },

  {
    id: 'insurance_company',
    name: 'Insurance Company',
    description: 'Insurance IVR with new claims, existing claim status, policy info, payments, and priority fraud hotline',
    category: 'Business',
    icon: 'shield',
    graph: {
      nodes: [
        { id: 'n1',  type: 'play_audio',    position: { x: 420, y: 0   }, data: { label: 'Welcome',             file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'play_audio',    position: { x: 420, y: 120 }, data: { label: 'Call Recording',      file: 'ivr/ivr-this_call_may_be_recorded.wav' } },
        { id: 'n3',  type: 'time_condition', position: { x: 420, y: 240 }, data: { label: 'Office Hours?',      schedule: { open: '08:00', close: '20:00', days: 'mon-sat' } } },
        // ── Open ──
        { id: 'n4',  type: 'get_digits',    position: { x: 200, y: 400 }, data: { label: 'Main Menu',           prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 7000, retries: 3, valid_digits: ['1','2','3','4','5','0'] } },
        // 1 = new claim
        { id: 'n5',  type: 'get_digits',    position: { x: 0,   y: 560 }, data: { label: 'Claim Type',          prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','4'] } },
        { id: 'n6',  type: 'transfer',      position: { x: 0,   y: 720 }, data: { label: 'Auto Claims',         destination: '3001', transfer_type: 'blind' } },
        { id: 'n7',  type: 'transfer',      position: { x: 160, y: 720 }, data: { label: 'Home Claims',         destination: '3002', transfer_type: 'blind' } },
        { id: 'n8',  type: 'transfer',      position: { x: 320, y: 720 }, data: { label: 'Health Claims',       destination: '3003', transfer_type: 'blind' } },
        { id: 'n9',  type: 'transfer',      position: { x: 480, y: 720 }, data: { label: 'Other Claims',        destination: '3004', transfer_type: 'blind' } },
        // 2 = existing claim
        { id: 'n10', type: 'transfer',      position: { x: 280, y: 560 }, data: { label: 'Existing Claims',     destination: '3010', transfer_type: 'blind' } },
        // 3 = policy info
        { id: 'n11', type: 'get_digits',    position: { x: 460, y: 560 }, data: { label: 'Policy Menu',         prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 2, valid_digits: ['1','2'] } },
        { id: 'n12', type: 'transfer',      position: { x: 400, y: 720 }, data: { label: 'Get Auto Quote',      destination: '3020', transfer_type: 'blind' } },
        { id: 'n13', type: 'transfer',      position: { x: 560, y: 720 }, data: { label: 'Policy Agent',        destination: '3021', transfer_type: 'blind' } },
        // 4 = billing
        { id: 'n14', type: 'transfer',      position: { x: 660, y: 560 }, data: { label: 'Billing & Payments',  destination: '3030', transfer_type: 'blind' } },
        // 5 = fraud (direct, no time check)
        { id: 'n15', type: 'play_audio',    position: { x: 840, y: 480 }, data: { label: 'Fraud Warning',       file: 'ivr/ivr-your_call_is_being_placed.wav' } },
        { id: 'n16', type: 'transfer',      position: { x: 840, y: 600 }, data: { label: 'Fraud Hotline',       destination: '3999', transfer_type: 'blind' } },
        // 0 = agent
        { id: 'n17', type: 'transfer',      position: { x: 1000, y: 560 }, data: { label: 'Agent',             destination: '0',    transfer_type: 'blind' } },
        // timeout
        { id: 'n18', type: 'voicemail',     position: { x: 200, y: 680 }, data: { label: 'No Input → VM',      mailbox_id: '3000' } },
        // ── Closed ──
        { id: 'n19', type: 'play_audio',    position: { x: 700, y: 400 }, data: { label: 'After Hours Msg',     file: 'ivr/ivr-not_available.wav' } },
        { id: 'n20', type: 'get_digits',    position: { x: 700, y: 520 }, data: { label: 'After Hours Options', prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2'] } },
        { id: 'n21', type: 'transfer',      position: { x: 620, y: 680 }, data: { label: 'Emergency Claims',    destination: '3099', transfer_type: 'blind' } },
        { id: 'n22', type: 'voicemail',     position: { x: 800, y: 680 }, data: { label: 'After Hours VM',      mailbox_id: '3000' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2' },
        { id: 'e2-3',   source: 'n2',  target: 'n3' },
        { id: 'e3-4',   source: 'n3',  target: 'n4',  sourceHandle: 'open'   },
        { id: 'e3-19',  source: 'n3',  target: 'n19', sourceHandle: 'closed' },
        // Main menu
        { id: 'e4-5',   source: 'n4',  target: 'n5',  sourceHandle: '1' },
        { id: 'e4-10',  source: 'n4',  target: 'n10', sourceHandle: '2' },
        { id: 'e4-11',  source: 'n4',  target: 'n11', sourceHandle: '3' },
        { id: 'e4-14',  source: 'n4',  target: 'n14', sourceHandle: '4' },
        { id: 'e4-15',  source: 'n4',  target: 'n15', sourceHandle: '5' },
        { id: 'e4-17',  source: 'n4',  target: 'n17', sourceHandle: '0' },
        { id: 'e4-18',  source: 'n4',  target: 'n18', sourceHandle: 'timeout' },
        // Claim type menu
        { id: 'e5-6',   source: 'n5',  target: 'n6',  sourceHandle: '1' },
        { id: 'e5-7',   source: 'n5',  target: 'n7',  sourceHandle: '2' },
        { id: 'e5-8',   source: 'n5',  target: 'n8',  sourceHandle: '3' },
        { id: 'e5-9',   source: 'n5',  target: 'n9',  sourceHandle: '4' },
        // Policy menu
        { id: 'e11-12', source: 'n11', target: 'n12', sourceHandle: '1' },
        { id: 'e11-13', source: 'n11', target: 'n13', sourceHandle: '2' },
        // Fraud
        { id: 'e15-16', source: 'n15', target: 'n16' },
        // After hours
        { id: 'e19-20', source: 'n19', target: 'n20' },
        { id: 'e20-21', source: 'n20', target: 'n21', sourceHandle: '1' },
        { id: 'e20-22', source: 'n20', target: 'n22', sourceHandle: '2' },
      ],
    },
  },

  {
    id: 'ecommerce_service',
    name: 'E-commerce Customer Service',
    description: 'Online retail IVR covering order tracking (with API), returns, product enquiries, accounts and wholesale',
    category: 'Business',
    icon: 'ecommerce',
    graph: {
      nodes: [
        { id: 'n1',  type: 'play_audio',  position: { x: 420, y: 0   }, data: { label: 'Welcome',            file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'get_digits',  position: { x: 420, y: 120 }, data: { label: 'Main Menu',           prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 7000, retries: 3, valid_digits: ['1','2','3','4','5','0'] } },
        // 1 — Orders & Shipping
        { id: 'n3',  type: 'get_digits',  position: { x: 0,   y: 280 }, data: { label: 'Orders Menu',         prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 2, valid_digits: ['1','2','3','9'] } },
        // 1.1 — Track order via API
        { id: 'n4',  type: 'get_digits',  position: { x: 0,   y: 440 }, data: { label: 'Enter Order Number',  prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 5, max_digits: 12, timeout_ms: 10000, retries: 3, valid_digits: ['0','1','2','3','4','5','6','7','8','9'] } },
        { id: 'n5',  type: 'api_call',    position: { x: 0,   y: 580 }, data: { label: 'Track Order API',     url: 'https://api.example.com/orders/{{digits}}', method: 'GET', timeout_ms: 5000, response_map: [{ json_path: '$.status', variable: 'order_status' }, { json_path: '$.eta', variable: 'order_eta' }, { json_path: '$.found', variable: 'order_found' }] } },
        { id: 'n6',  type: 'condition',   position: { x: 0,   y: 720 }, data: { label: 'Order Found?',        variable: 'order_found', operator: 'eq', value: 'true' } },
        { id: 'n7',  type: 'play_audio',  position: { x: 0,   y: 860 }, data: { label: 'Order Status Msg',    file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n8',  type: 'transfer',    position: { x: 160, y: 860 }, data: { label: 'Order Not Found',     destination: '4001', transfer_type: 'blind' } },
        { id: 'n9',  type: 'transfer',    position: { x: 0,   y: 1000 }, data: { label: 'Orders Support',     destination: '4001', transfer_type: 'blind' } },
        // 1.2 — Order problem
        { id: 'n10', type: 'transfer',    position: { x: 200, y: 440 }, data: { label: 'Order Problems',      destination: '4001', transfer_type: 'blind' } },
        // 1.3 — Cancel order
        { id: 'n11', type: 'transfer',    position: { x: 380, y: 440 }, data: { label: 'Cancellations',       destination: '4004', transfer_type: 'blind' } },
        // 1.9 — Back to main
        { id: 'n12', type: 'transfer',    position: { x: 560, y: 440 }, data: { label: 'Back to Main',        destination: '{{dnis}}', transfer_type: 'blind' } },
        // 2 — Returns
        { id: 'n13', type: 'play_audio',  position: { x: 280, y: 280 }, data: { label: 'Returns Policy',      file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n14', type: 'get_digits',  position: { x: 280, y: 400 }, data: { label: 'Returns Menu',        prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 2, valid_digits: ['1','2','0'] } },
        { id: 'n15', type: 'voicemail',   position: { x: 220, y: 540 }, data: { label: 'Start Return VM',     mailbox_id: '4002' } },
        { id: 'n16', type: 'transfer',    position: { x: 380, y: 540 }, data: { label: 'Return Status Agent', destination: '4002', transfer_type: 'blind' } },
        { id: 'n17', type: 'transfer',    position: { x: 540, y: 540 }, data: { label: 'Agent (Returns)',     destination: '0',    transfer_type: 'blind' } },
        // 3 — Products
        { id: 'n18', type: 'transfer',    position: { x: 560, y: 280 }, data: { label: 'Product Info Team',   destination: '4003', transfer_type: 'blind' } },
        // 4 — Account
        { id: 'n19', type: 'transfer',    position: { x: 720, y: 280 }, data: { label: 'Account Services',    destination: '4004', transfer_type: 'blind' } },
        // 5 — Wholesale
        { id: 'n20', type: 'voicemail',   position: { x: 880, y: 280 }, data: { label: 'Wholesale Enquiry',   mailbox_id: '4005' } },
        // 0 — Agent
        { id: 'n21', type: 'transfer',    position: { x: 1040, y: 280 }, data: { label: 'Agent',              destination: '0',    transfer_type: 'blind' } },
        // timeout
        { id: 'n22', type: 'voicemail',   position: { x: 420, y: 240 }, data: { label: 'No Input → VM',       mailbox_id: '4000' } },
        // API error
        { id: 'n23', type: 'play_audio',  position: { x: 200, y: 720 }, data: { label: 'API Error Msg',       file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n24', type: 'transfer',    position: { x: 200, y: 860 }, data: { label: 'Agent Fallback',      destination: '4001', transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2' },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: '1' },
        { id: 'e2-13',  source: 'n2',  target: 'n13', sourceHandle: '2' },
        { id: 'e2-18',  source: 'n2',  target: 'n18', sourceHandle: '3' },
        { id: 'e2-19',  source: 'n2',  target: 'n19', sourceHandle: '4' },
        { id: 'e2-20',  source: 'n2',  target: 'n20', sourceHandle: '5' },
        { id: 'e2-21',  source: 'n2',  target: 'n21', sourceHandle: '0' },
        { id: 'e2-22',  source: 'n2',  target: 'n22', sourceHandle: 'timeout' },
        // Orders sub-menu
        { id: 'e3-4',   source: 'n3',  target: 'n4',  sourceHandle: '1' },
        { id: 'e3-10',  source: 'n3',  target: 'n10', sourceHandle: '2' },
        { id: 'e3-11',  source: 'n3',  target: 'n11', sourceHandle: '3' },
        { id: 'e3-12',  source: 'n3',  target: 'n12', sourceHandle: '9' },
        // Track order
        { id: 'e4-5',   source: 'n4',  target: 'n5' },
        { id: 'e5-6',   source: 'n5',  target: 'n6',  sourceHandle: 'success' },
        { id: 'e5-23',  source: 'n5',  target: 'n23', sourceHandle: 'error'   },
        { id: 'e5-23t', source: 'n5',  target: 'n23', sourceHandle: 'timeout' },
        { id: 'e6-7',   source: 'n6',  target: 'n7',  sourceHandle: 'true'  },
        { id: 'e6-8',   source: 'n6',  target: 'n8',  sourceHandle: 'false' },
        { id: 'e7-9',   source: 'n7',  target: 'n9' },
        { id: 'e23-24', source: 'n23', target: 'n24' },
        // Returns sub-menu
        { id: 'e13-14', source: 'n13', target: 'n14' },
        { id: 'e14-15', source: 'n14', target: 'n15', sourceHandle: '1' },
        { id: 'e14-16', source: 'n14', target: 'n16', sourceHandle: '2' },
        { id: 'e14-17', source: 'n14', target: 'n17', sourceHandle: '0' },
      ],
    },
  },

  // ── API-Driven Templates (existing) ───────────────────────────────────────

  {
    id: 'account_pin_auth',
    name: 'Account PIN Authentication',
    description: 'Caller enters account number and PIN; API validates and routes authenticated callers to a personalised menu',
    category: 'API-Driven',
    icon: 'lock',
    graph: {
      nodes: [
        { id: 'n1',  type: 'play_audio', position: { x: 300, y: 40  }, data: { label: 'Welcome',           file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'get_digits', position: { x: 300, y: 160 }, data: { label: 'Enter Account No.', prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 6, max_digits: 10, timeout_ms: 8000, retries: 3, valid_digits: ['0','1','2','3','4','5','6','7','8','9'] } },
        { id: 'n3',  type: 'get_digits', position: { x: 300, y: 300 }, data: { label: 'Enter PIN',          prompt_file: 'ivr/ivr-access_code.wav', min_digits: 4, max_digits: 6, timeout_ms: 8000, retries: 3, valid_digits: ['0','1','2','3','4','5','6','7','8','9'] } },
        { id: 'n4',  type: 'api_call',   position: { x: 300, y: 440 }, data: { label: 'Validate Auth',      url: 'https://api.example.com/auth', method: 'POST', timeout_ms: 5000, headers: { 'Content-Type': 'application/json' }, response_map: [{ json_path: '$.authenticated', variable: 'auth_ok' }, { json_path: '$.customer_name', variable: 'customer_name' }, { json_path: '$.account_type', variable: 'account_type' }] } },
        { id: 'n5',  type: 'condition',  position: { x: 300, y: 580 }, data: { label: 'Auth OK?',           variable: 'auth_ok', operator: 'eq', value: 'true' } },
        { id: 'n6',  type: 'get_digits', position: { x: 100, y: 720 }, data: { label: 'Authenticated Menu', prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','0'] } },
        { id: 'n7',  type: 'transfer',   position: { x: 0,   y: 880 }, data: { label: 'Account Services',   destination: '1001', transfer_type: 'blind' } },
        { id: 'n8',  type: 'transfer',   position: { x: 180, y: 880 }, data: { label: 'Billing',            destination: '1002', transfer_type: 'blind' } },
        { id: 'n9',  type: 'transfer',   position: { x: 360, y: 880 }, data: { label: 'Technical Support',  destination: '1003', transfer_type: 'blind' } },
        { id: 'n10', type: 'transfer',   position: { x: 540, y: 880 }, data: { label: 'Operator',           destination: '0',    transfer_type: 'blind' } },
        { id: 'n11', type: 'play_audio', position: { x: 520, y: 720 }, data: { label: 'Auth Failed Msg',    file: 'ivr/ivr-invalid_number.wav' } },
        { id: 'n12', type: 'transfer',   position: { x: 520, y: 840 }, data: { label: 'Manual Verify',      destination: '1099', transfer_type: 'blind' } },
        { id: 'n13', type: 'play_audio', position: { x: 300, y: 560 }, data: { label: 'API Error',          file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n14', type: 'transfer',   position: { x: 300, y: 660 }, data: { label: 'Fallback Agent',     destination: '0',    transfer_type: 'blind' } },
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
    description: 'Customer enters order number; API retrieves status and announces it, with option to speak to an agent',
    category: 'API-Driven',
    icon: 'order',
    graph: {
      nodes: [
        { id: 'n1',  type: 'play_audio',  position: { x: 300, y: 40  }, data: { label: 'Welcome',          file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'get_digits',  position: { x: 300, y: 160 }, data: { label: 'Enter Order No.',   prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 4, max_digits: 12, timeout_ms: 10000, retries: 3, valid_digits: ['0','1','2','3','4','5','6','7','8','9'] } },
        { id: 'n3',  type: 'api_call',    position: { x: 300, y: 300 }, data: { label: 'Fetch Order Status', url: 'https://api.example.com/orders/{{digits}}', method: 'GET', timeout_ms: 5000, response_map: [{ json_path: '$.status', variable: 'order_status' }, { json_path: '$.eta', variable: 'order_eta' }] } },
        { id: 'n4',  type: 'condition',   position: { x: 300, y: 440 }, data: { label: 'Order Found?',      variable: 'order_status', operator: 'not_empty', value: '' } },
        { id: 'n5',  type: 'set_variable',position: { x: 100, y: 580 }, data: { label: 'Log Status Read',   key: 'status_played', value: 'true' } },
        { id: 'n6',  type: 'get_digits',  position: { x: 100, y: 700 }, data: { label: 'After Status Menu', prompt_file: 'ivr/ivr-to_repeat_these_options.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 2, valid_digits: ['1','2','0'] } },
        { id: 'n7',  type: 'transfer',    position: { x: 0,   y: 860 }, data: { label: 'Repeat (loop)',     destination: '{{dnis}}', transfer_type: 'blind' } },
        { id: 'n8',  type: 'transfer',    position: { x: 200, y: 860 }, data: { label: 'Speak to Agent',    destination: '1001',     transfer_type: 'blind' } },
        { id: 'n9',  type: 'hangup',      position: { x: 400, y: 860 }, data: { label: 'Hangup',            cause: 'NORMAL_CLEARING' } },
        { id: 'n10', type: 'play_audio',  position: { x: 500, y: 440 }, data: { label: 'Not Found Msg',     file: 'ivr/ivr-invalid_number.wav' } },
        { id: 'n11', type: 'transfer',    position: { x: 500, y: 580 }, data: { label: 'Agent Fallback',    destination: '1001',     transfer_type: 'blind' } },
        { id: 'n12', type: 'play_audio',  position: { x: 300, y: 500 }, data: { label: 'API Error Msg',     file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n13', type: 'transfer',    position: { x: 300, y: 620 }, data: { label: 'Agent',             destination: '1001',     transfer_type: 'blind' } },
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
        { id: 'n1',  type: 'play_audio', position: { x: 300, y: 40  }, data: { label: 'Welcome',              file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'api_call',   position: { x: 300, y: 160 }, data: { label: 'Fetch Caller Profile',  url: 'https://api.example.com/profile?ani={{ani}}', method: 'GET', timeout_ms: 4000, response_map: [{ json_path: '$.language', variable: 'lang' }, { json_path: '$.priority', variable: 'priority' }, { json_path: '$.product', variable: 'product' }] } },
        { id: 'n3',  type: 'condition',  position: { x: 300, y: 300 }, data: { label: 'High Priority?',        variable: 'priority', operator: 'eq', value: 'high' } },
        { id: 'n4',  type: 'condition',  position: { x: 100, y: 440 }, data: { label: 'Language = ES?',        variable: 'lang', operator: 'eq', value: 'es' } },
        { id: 'n5',  type: 'transfer',   position: { x: 0,   y: 580 }, data: { label: 'VIP Spanish Queue',     destination: '1010', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',   position: { x: 200, y: 580 }, data: { label: 'VIP English Queue',     destination: '1011', transfer_type: 'blind' } },
        { id: 'n7',  type: 'condition',  position: { x: 520, y: 440 }, data: { label: 'Product = Enterprise?', variable: 'product', operator: 'eq', value: 'enterprise' } },
        { id: 'n8',  type: 'transfer',   position: { x: 400, y: 580 }, data: { label: 'Enterprise Queue',      destination: '1020', transfer_type: 'blind' } },
        { id: 'n9',  type: 'transfer',   position: { x: 620, y: 580 }, data: { label: 'Standard Queue',        destination: '1002', transfer_type: 'blind' } },
        { id: 'n10', type: 'play_audio', position: { x: 300, y: 420 }, data: { label: 'API Error',             file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n11', type: 'transfer',   position: { x: 300, y: 540 }, data: { label: 'Default Queue',         destination: '1002', transfer_type: 'blind' } },
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

  // ── NEW Complex API-Driven Templates ──────────────────────────────────────

  {
    id: 'crm_personalized_ivr',
    name: 'CRM-Driven Personalized IVR',
    description: 'Looks up caller in CRM by phone number; plays personalised welcome, routes VIP callers differently, and surfaces open support tickets before routing',
    category: 'API-Driven',
    icon: 'crm',
    graph: {
      nodes: [
        // Entry
        { id: 'n1',  type: 'play_audio',  position: { x: 500, y: 0   }, data: { label: 'Welcome',              file: 'ivr/ivr-thank_you_for_calling.wav' } },
        // CRM lookup using caller's ANI
        { id: 'n2',  type: 'api_call',    position: { x: 500, y: 120 }, data: { label: 'CRM Lookup by ANI',    url: 'https://crm.example.com/api/caller?phone={{ani}}', method: 'GET', timeout_ms: 4000, response_map: [{ json_path: '$.found', variable: 'caller_found' }, { json_path: '$.account_type', variable: 'account_type' }, { json_path: '$.has_open_ticket', variable: 'has_open_ticket' }, { json_path: '$.customer_name', variable: 'customer_name' }] } },
        // ── API error path ──
        { id: 'n3',  type: 'play_audio',  position: { x: 820, y: 200 }, data: { label: 'API Error Msg',        file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n4',  type: 'transfer',    position: { x: 820, y: 320 }, data: { label: 'Fallback Agent',       destination: '0',    transfer_type: 'blind' } },
        // ── Condition: known caller? ──
        { id: 'n5',  type: 'condition',   position: { x: 500, y: 260 }, data: { label: 'Caller in CRM?',       variable: 'caller_found', operator: 'eq', value: 'true' } },
        // ── Known caller: check account type ──
        { id: 'n6',  type: 'condition',   position: { x: 240, y: 400 }, data: { label: 'Account Type = VIP?',  variable: 'account_type', operator: 'eq', value: 'vip' } },
        // ── VIP branch ──
        { id: 'n7',  type: 'play_audio',  position: { x: 80,  y: 540 }, data: { label: 'VIP Welcome',          file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n8',  type: 'condition',   position: { x: 80,  y: 660 }, data: { label: 'VIP Has Open Ticket?', variable: 'has_open_ticket', operator: 'eq', value: 'true' } },
        // VIP + open ticket
        { id: 'n9',  type: 'play_audio',  position: { x: 0,   y: 800 }, data: { label: 'Open Ticket Notice',   file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n10', type: 'get_digits',  position: { x: 0,   y: 920 }, data: { label: 'VIP Ticket Menu',      prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','0'] } },
        { id: 'n11', type: 'transfer',    position: { x: 0,   y: 1060}, data: { label: 'Ticket Status Team',   destination: '8001', transfer_type: 'blind' } },
        { id: 'n12', type: 'transfer',    position: { x: 180, y: 1060}, data: { label: 'VIP Priority Queue',   destination: '1010', transfer_type: 'blind' } },
        { id: 'n13', type: 'hangup',      position: { x: 360, y: 1060}, data: { label: 'Hangup',               cause: 'NORMAL_CLEARING' } },
        // VIP + no open ticket
        { id: 'n14', type: 'transfer',    position: { x: 200, y: 800 }, data: { label: 'VIP Queue (Direct)',   destination: '1010', transfer_type: 'blind' } },
        // ── Non-VIP branch: check open ticket ──
        { id: 'n15', type: 'condition',   position: { x: 400, y: 540 }, data: { label: 'Has Open Ticket?',     variable: 'has_open_ticket', operator: 'eq', value: 'true' } },
        { id: 'n16', type: 'play_audio',  position: { x: 320, y: 680 }, data: { label: 'Open Case Notice',     file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n17', type: 'get_digits',  position: { x: 320, y: 800 }, data: { label: 'Case Menu',            prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2'] } },
        { id: 'n18', type: 'transfer',    position: { x: 260, y: 940 }, data: { label: 'Case Management',      destination: '8002', transfer_type: 'blind' } },
        // Standard menu (shared by non-VIP no-ticket and case menu "2")
        { id: 'n19', type: 'get_digits',  position: { x: 520, y: 680 }, data: { label: 'Standard Menu',        prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','0'] } },
        { id: 'n20', type: 'transfer',    position: { x: 380, y: 820 }, data: { label: 'Sales',                destination: '1001', transfer_type: 'blind' } },
        { id: 'n21', type: 'transfer',    position: { x: 540, y: 820 }, data: { label: 'Support',              destination: '1002', transfer_type: 'blind' } },
        { id: 'n22', type: 'transfer',    position: { x: 700, y: 820 }, data: { label: 'Billing',              destination: '1003', transfer_type: 'blind' } },
        { id: 'n23', type: 'transfer',    position: { x: 860, y: 820 }, data: { label: 'Operator',             destination: '0',    transfer_type: 'blind' } },
        // ── Unknown caller branch ──
        { id: 'n24', type: 'play_audio',  position: { x: 740, y: 400 }, data: { label: 'New Caller Welcome',   file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n25', type: 'get_digits',  position: { x: 740, y: 520 }, data: { label: 'New Caller Menu',      prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','0'] } },
        { id: 'n26', type: 'transfer',    position: { x: 680, y: 660 }, data: { label: 'New Customer Setup',   destination: '1005', transfer_type: 'blind' } },
        { id: 'n27', type: 'transfer',    position: { x: 860, y: 660 }, data: { label: 'General Support',      destination: '1002', transfer_type: 'blind' } },
        { id: 'n28', type: 'transfer',    position: { x: 1040, y: 660}, data: { label: 'Operator',             destination: '0',    transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-5',   source: 'n2',  target: 'n5',  sourceHandle: 'success' },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: 'error'   },
        { id: 'e2-3t',  source: 'n2',  target: 'n3',  sourceHandle: 'timeout' },
        { id: 'e3-4',   source: 'n3',  target: 'n4'  },
        // Known vs unknown
        { id: 'e5-6',   source: 'n5',  target: 'n6',  sourceHandle: 'true'  },
        { id: 'e5-24',  source: 'n5',  target: 'n24', sourceHandle: 'false' },
        // VIP vs non-VIP
        { id: 'e6-7',   source: 'n6',  target: 'n7',  sourceHandle: 'true'  },
        { id: 'e6-15',  source: 'n6',  target: 'n15', sourceHandle: 'false' },
        // VIP path
        { id: 'e7-8',   source: 'n7',  target: 'n8'  },
        { id: 'e8-9',   source: 'n8',  target: 'n9',  sourceHandle: 'true'  },
        { id: 'e8-14',  source: 'n8',  target: 'n14', sourceHandle: 'false' },
        { id: 'e9-10',  source: 'n9',  target: 'n10' },
        { id: 'e10-11', source: 'n10', target: 'n11', sourceHandle: '1' },
        { id: 'e10-12', source: 'n10', target: 'n12', sourceHandle: '2' },
        { id: 'e10-13', source: 'n10', target: 'n13', sourceHandle: '0' },
        // Non-VIP + open ticket
        { id: 'e15-16', source: 'n15', target: 'n16', sourceHandle: 'true'  },
        { id: 'e15-19', source: 'n15', target: 'n19', sourceHandle: 'false' },
        { id: 'e16-17', source: 'n16', target: 'n17' },
        { id: 'e17-18', source: 'n17', target: 'n18', sourceHandle: '1' },
        { id: 'e17-19', source: 'n17', target: 'n19', sourceHandle: '2' },
        // Standard menu
        { id: 'e19-20', source: 'n19', target: 'n20', sourceHandle: '1' },
        { id: 'e19-21', source: 'n19', target: 'n21', sourceHandle: '2' },
        { id: 'e19-22', source: 'n19', target: 'n22', sourceHandle: '3' },
        { id: 'e19-23', source: 'n19', target: 'n23', sourceHandle: '0' },
        // New caller
        { id: 'e24-25', source: 'n24', target: 'n25' },
        { id: 'e25-26', source: 'n25', target: 'n26', sourceHandle: '1' },
        { id: 'e25-27', source: 'n25', target: 'n27', sourceHandle: '2' },
        { id: 'e25-28', source: 'n25', target: 'n28', sourceHandle: '0' },
      ],
    },
  },

  {
    id: 'multi_api_account_service',
    name: 'Multi-API Smart Account Service',
    description: 'Two sequential API calls: first verifies account, second fetches details. Routes by account status, tier (Premium/Standard), overdue balance, and service suspension — all with different audio per condition',
    category: 'API-Driven',
    icon: 'layers',
    graph: {
      nodes: [
        // Entry
        { id: 'n1',  type: 'play_audio',  position: { x: 500, y: 0   }, data: { label: 'Welcome',             file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'play_audio',  position: { x: 500, y: 120 }, data: { label: 'Security Notice',     file: 'ivr/ivr-this_call_may_be_recorded.wav' } },
        { id: 'n3',  type: 'get_digits',  position: { x: 500, y: 240 }, data: { label: 'Enter Account No.',   prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 8, max_digits: 10, timeout_ms: 10000, retries: 3, valid_digits: ['0','1','2','3','4','5','6','7','8','9'] } },
        { id: 'n4',  type: 'set_variable',position: { x: 500, y: 360 }, data: { label: 'Store Account ID',    key: 'account_id', value: '{{digits}}' } },
        // API Call 1: Verify account existence + status
        { id: 'n5',  type: 'api_call',    position: { x: 500, y: 480 }, data: { label: 'API 1: Verify Account', url: 'https://api.example.com/accounts/verify?id={{account_id}}', method: 'GET', timeout_ms: 5000, response_map: [{ json_path: '$.auth_status', variable: 'auth_status' }, { json_path: '$.tier', variable: 'account_tier' }, { json_path: '$.customer_name', variable: 'customer_name' }] } },
        // API 1 error
        { id: 'n6',  type: 'play_audio',  position: { x: 820, y: 560 }, data: { label: 'Service Unavailable', file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n7',  type: 'transfer',    position: { x: 820, y: 680 }, data: { label: 'Fallback Agent',      destination: '0',    transfer_type: 'blind' } },
        // Condition: active account?
        { id: 'n8',  type: 'condition',   position: { x: 500, y: 640 }, data: { label: 'Account Active?',     variable: 'auth_status', operator: 'eq', value: 'active' } },
        // ── Active branch: API Call 2 ──
        { id: 'n9',  type: 'api_call',    position: { x: 260, y: 780 }, data: { label: 'API 2: Fetch Details', url: 'https://api.example.com/accounts/{{account_id}}/details', method: 'GET', timeout_ms: 5000, response_map: [{ json_path: '$.service_status', variable: 'service_status' }, { json_path: '$.has_overdue', variable: 'has_overdue' }, { json_path: '$.balance', variable: 'balance' }] } },
        // API 2 error → fallback
        { id: 'n10', type: 'transfer',    position: { x: 560, y: 860 }, data: { label: 'Agent (API2 Error)',   destination: '0',    transfer_type: 'blind' } },
        // Condition: suspended?
        { id: 'n11', type: 'condition',   position: { x: 260, y: 940 }, data: { label: 'Service Suspended?',  variable: 'service_status', operator: 'eq', value: 'suspended' } },
        // Suspended path
        { id: 'n12', type: 'play_audio',  position: { x: 60,  y: 1080}, data: { label: 'Suspended Audio',     file: 'ivr/ivr-not_available.wav' } },
        { id: 'n13', type: 'get_digits',  position: { x: 60,  y: 1200}, data: { label: 'Suspended Options',   prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','0'] } },
        { id: 'n14', type: 'transfer',    position: { x: 0,   y: 1340}, data: { label: 'Billing (Reactivate)',  destination: '1002', transfer_type: 'blind' } },
        { id: 'n15', type: 'transfer',    position: { x: 160, y: 1340}, data: { label: 'Appeals Team',         destination: '1005', transfer_type: 'blind' } },
        { id: 'n16', type: 'transfer',    position: { x: 320, y: 1340}, data: { label: 'Operator',             destination: '0',    transfer_type: 'blind' } },
        // Not suspended: check tier
        { id: 'n17', type: 'condition',   position: { x: 460, y: 1080}, data: { label: 'Premium Account?',    variable: 'account_tier', operator: 'eq', value: 'premium' } },
        // Premium + overdue check
        { id: 'n18', type: 'condition',   position: { x: 340, y: 1220}, data: { label: 'Overdue Balance?',    variable: 'has_overdue', operator: 'eq', value: 'true' } },
        { id: 'n19', type: 'play_audio',  position: { x: 200, y: 1360}, data: { label: 'Overdue Balance Msg', file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n20', type: 'get_digits',  position: { x: 200, y: 1480}, data: { label: 'Overdue Options',     prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n21', type: 'transfer',    position: { x: 120, y: 1620}, data: { label: 'Pay Now (IVR)',        destination: '1099', transfer_type: 'blind' } },
        { id: 'n22', type: 'transfer',    position: { x: 280, y: 1620}, data: { label: 'Billing Agent',        destination: '1002', transfer_type: 'blind' } },
        // Premium menu (after overdue check)
        { id: 'n23', type: 'play_audio',  position: { x: 500, y: 1360}, data: { label: 'Premium Welcome Msg', file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n24', type: 'get_digits',  position: { x: 500, y: 1480}, data: { label: 'Premium Menu',        prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','0'] } },
        { id: 'n25', type: 'transfer',    position: { x: 380, y: 1620}, data: { label: 'Account Services',    destination: '1001', transfer_type: 'blind' } },
        { id: 'n26', type: 'transfer',    position: { x: 540, y: 1620}, data: { label: 'VIP Technical',       destination: '1010', transfer_type: 'blind' } },
        { id: 'n27', type: 'transfer',    position: { x: 700, y: 1620}, data: { label: 'Priority Support',    destination: '1011', transfer_type: 'blind' } },
        { id: 'n28', type: 'transfer',    position: { x: 860, y: 1620}, data: { label: 'Operator',            destination: '0',    transfer_type: 'blind' } },
        // Standard menu
        { id: 'n29', type: 'get_digits',  position: { x: 740, y: 1220}, data: { label: 'Standard Menu',       prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','0'] } },
        { id: 'n30', type: 'transfer',    position: { x: 620, y: 1360}, data: { label: 'Account Services',    destination: '1001', transfer_type: 'blind' } },
        { id: 'n31', type: 'transfer',    position: { x: 780, y: 1360}, data: { label: 'Billing',             destination: '1002', transfer_type: 'blind' } },
        { id: 'n32', type: 'transfer',    position: { x: 940, y: 1360}, data: { label: 'Support',             destination: '1003', transfer_type: 'blind' } },
        { id: 'n33', type: 'transfer',    position: { x: 1100,y: 1360}, data: { label: 'Operator',            destination: '0',    transfer_type: 'blind' } },
        // ── Inactive/Invalid branch ──
        { id: 'n34', type: 'condition',   position: { x: 760, y: 780 }, data: { label: 'Account Suspended?', variable: 'auth_status', operator: 'eq', value: 'suspended' } },
        { id: 'n35', type: 'play_audio',  position: { x: 680, y: 920 }, data: { label: 'Suspended Acct Msg', file: 'ivr/ivr-not_available.wav' } },
        { id: 'n36', type: 'transfer',    position: { x: 680, y: 1040}, data: { label: 'Billing (Suspended)', destination: '1002', transfer_type: 'blind' } },
        { id: 'n37', type: 'play_audio',  position: { x: 900, y: 920 }, data: { label: 'Invalid Acct Msg',   file: 'ivr/ivr-invalid_number.wav' } },
        { id: 'n38', type: 'get_digits',  position: { x: 900, y: 1040}, data: { label: 'Invalid Options',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 5000, retries: 2, valid_digits: ['1','0'] } },
        { id: 'n39', type: 'transfer',    position: { x: 840, y: 1180}, data: { label: 'Retry (loop)',        destination: '{{dnis}}', transfer_type: 'blind' } },
        { id: 'n40', type: 'transfer',    position: { x: 1000,y: 1180}, data: { label: 'Agent',              destination: '0',    transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3'  },
        { id: 'e3-4',   source: 'n3',  target: 'n4'  },
        { id: 'e4-5',   source: 'n4',  target: 'n5'  },
        // API 1 results
        { id: 'e5-8',   source: 'n5',  target: 'n8',  sourceHandle: 'success' },
        { id: 'e5-6',   source: 'n5',  target: 'n6',  sourceHandle: 'error'   },
        { id: 'e5-6t',  source: 'n5',  target: 'n6',  sourceHandle: 'timeout' },
        { id: 'e6-7',   source: 'n6',  target: 'n7'  },
        // Active vs not
        { id: 'e8-9',   source: 'n8',  target: 'n9',  sourceHandle: 'true'  },
        { id: 'e8-34',  source: 'n8',  target: 'n34', sourceHandle: 'false' },
        // API 2 results
        { id: 'e9-11',  source: 'n9',  target: 'n11', sourceHandle: 'success' },
        { id: 'e9-10',  source: 'n9',  target: 'n10', sourceHandle: 'error'   },
        { id: 'e9-10t', source: 'n9',  target: 'n10', sourceHandle: 'timeout' },
        // Suspended vs not
        { id: 'e11-12', source: 'n11', target: 'n12', sourceHandle: 'true'  },
        { id: 'e11-17', source: 'n11', target: 'n17', sourceHandle: 'false' },
        // Suspended menu
        { id: 'e12-13', source: 'n12', target: 'n13' },
        { id: 'e13-14', source: 'n13', target: 'n14', sourceHandle: '1' },
        { id: 'e13-15', source: 'n13', target: 'n15', sourceHandle: '2' },
        { id: 'e13-16', source: 'n13', target: 'n16', sourceHandle: '0' },
        // Premium vs standard
        { id: 'e17-18', source: 'n17', target: 'n18', sourceHandle: 'true'  },
        { id: 'e17-29', source: 'n17', target: 'n29', sourceHandle: 'false' },
        // Overdue check
        { id: 'e18-19', source: 'n18', target: 'n19', sourceHandle: 'true'  },
        { id: 'e18-23', source: 'n18', target: 'n23', sourceHandle: 'false' },
        { id: 'e19-20', source: 'n19', target: 'n20' },
        { id: 'e20-21', source: 'n20', target: 'n21', sourceHandle: '1' },
        { id: 'e20-22', source: 'n20', target: 'n22', sourceHandle: '2' },
        { id: 'e20-23', source: 'n20', target: 'n23', sourceHandle: '9' },
        // Premium menu
        { id: 'e23-24', source: 'n23', target: 'n24' },
        { id: 'e24-25', source: 'n24', target: 'n25', sourceHandle: '1' },
        { id: 'e24-26', source: 'n24', target: 'n26', sourceHandle: '2' },
        { id: 'e24-27', source: 'n24', target: 'n27', sourceHandle: '3' },
        { id: 'e24-28', source: 'n24', target: 'n28', sourceHandle: '0' },
        // Standard menu
        { id: 'e29-30', source: 'n29', target: 'n30', sourceHandle: '1' },
        { id: 'e29-31', source: 'n29', target: 'n31', sourceHandle: '2' },
        { id: 'e29-32', source: 'n29', target: 'n32', sourceHandle: '3' },
        { id: 'e29-33', source: 'n29', target: 'n33', sourceHandle: '0' },
        // Suspended/invalid
        { id: 'e34-35', source: 'n34', target: 'n35', sourceHandle: 'true'  },
        { id: 'e34-37', source: 'n34', target: 'n37', sourceHandle: 'false' },
        { id: 'e35-36', source: 'n35', target: 'n36' },
        { id: 'e37-38', source: 'n37', target: 'n38' },
        { id: 'e38-39', source: 'n38', target: 'n39', sourceHandle: '1' },
        { id: 'e38-40', source: 'n38', target: 'n40', sourceHandle: '0' },
      ],
    },
  },

  {
    id: 'appointment_management',
    name: 'Appointment Management System',
    description: 'Enter booking reference; API looks it up, reads back details, and lets caller confirm, reschedule, or cancel — cancel triggers a second API call. Falls back gracefully on all errors',
    category: 'API-Driven',
    icon: 'calendar',
    graph: {
      nodes: [
        // Entry
        { id: 'n1',  type: 'play_audio',  position: { x: 400, y: 0   }, data: { label: 'Welcome',               file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'get_digits',  position: { x: 400, y: 120 }, data: { label: 'Initial Menu',           prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 7000, retries: 3, valid_digits: ['1','2','0'] } },
        { id: 'n3',  type: 'transfer',    position: { x: 600, y: 280 }, data: { label: 'Book New Appt',          destination: '5001', transfer_type: 'blind' } },
        { id: 'n4',  type: 'transfer',    position: { x: 800, y: 280 }, data: { label: 'Reception',              destination: '0',    transfer_type: 'blind' } },
        // ── Manage existing appointment ──
        { id: 'n5',  type: 'play_audio',  position: { x: 160, y: 280 }, data: { label: 'Booking Ref Prompt',     file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav' } },
        { id: 'n6',  type: 'get_digits',  position: { x: 160, y: 400 }, data: { label: 'Enter Booking Ref',      prompt_file: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', min_digits: 6, max_digits: 10, timeout_ms: 12000, retries: 3, valid_digits: ['0','1','2','3','4','5','6','7','8','9'] } },
        { id: 'n7',  type: 'set_variable',position: { x: 160, y: 520 }, data: { label: 'Store Booking Ref',      key: 'booking_ref', value: '{{digits}}' } },
        // API lookup
        { id: 'n8',  type: 'api_call',    position: { x: 160, y: 640 }, data: { label: 'API: Lookup Booking',    url: 'https://api.example.com/appointments/{{booking_ref}}', method: 'GET', timeout_ms: 5000, response_map: [{ json_path: '$.found', variable: 'appt_found' }, { json_path: '$.status', variable: 'appt_status' }, { json_path: '$.doctor', variable: 'appt_doctor' }, { json_path: '$.date', variable: 'appt_date' }] } },
        // API error
        { id: 'n9',  type: 'play_audio',  position: { x: 480, y: 720 }, data: { label: 'Lookup Failed Msg',      file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n10', type: 'transfer',    position: { x: 480, y: 840 }, data: { label: 'Reception (API Error)',  destination: '0',    transfer_type: 'blind' } },
        // Condition: found?
        { id: 'n11', type: 'condition',   position: { x: 160, y: 800 }, data: { label: 'Booking Found?',         variable: 'appt_found', operator: 'eq', value: 'true' } },
        // Not found
        { id: 'n12', type: 'play_audio',  position: { x: 0,   y: 940 }, data: { label: 'Not Found Msg',          file: 'ivr/ivr-invalid_number.wav' } },
        { id: 'n13', type: 'get_digits',  position: { x: 0,   y: 1060}, data: { label: 'Not Found Options',      prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','0'] } },
        { id: 'n14', type: 'transfer',    position: { x: 0,   y: 1200}, data: { label: 'Retry (loop)',            destination: '{{dnis}}', transfer_type: 'blind' } },
        { id: 'n15', type: 'transfer',    position: { x: 160, y: 1200}, data: { label: 'Book New Appt',          destination: '5001', transfer_type: 'blind' } },
        { id: 'n16', type: 'transfer',    position: { x: 320, y: 1200}, data: { label: 'Reception',              destination: '0',    transfer_type: 'blind' } },
        // Found: check status
        { id: 'n17', type: 'condition',   position: { x: 300, y: 940 }, data: { label: 'Status = Confirmed?',    variable: 'appt_status', operator: 'eq', value: 'confirmed' } },
        // Pending/other status
        { id: 'n18', type: 'play_audio',  position: { x: 580, y: 1060}, data: { label: 'Pending Appt Msg',       file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n19', type: 'transfer',    position: { x: 580, y: 1180}, data: { label: 'Scheduling Team',        destination: '5002', transfer_type: 'blind' } },
        // Confirmed: options
        { id: 'n20', type: 'play_audio',  position: { x: 300, y: 1080}, data: { label: 'Appointment Details',    file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n21', type: 'get_digits',  position: { x: 300, y: 1200}, data: { label: 'Appointment Options',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 7000, retries: 2, valid_digits: ['1','2','3','0'] } },
        // 1 = Confirm OK
        { id: 'n22', type: 'play_audio',  position: { x: 160, y: 1360}, data: { label: 'Confirmed Thank You',    file: 'ivr/ivr-thank_you.wav' } },
        { id: 'n23', type: 'hangup',      position: { x: 160, y: 1480}, data: { label: 'Hangup',                 cause: 'NORMAL_CLEARING' } },
        // 2 = Reschedule
        { id: 'n24', type: 'transfer',    position: { x: 380, y: 1360}, data: { label: 'Reschedule Team',        destination: '5002', transfer_type: 'blind' } },
        // 3 = Cancel (second API call)
        { id: 'n25', type: 'api_call',    position: { x: 560, y: 1360}, data: { label: 'API: Cancel Booking',    url: 'https://api.example.com/appointments/{{booking_ref}}/cancel', method: 'DELETE', timeout_ms: 5000 } },
        { id: 'n26', type: 'play_audio',  position: { x: 480, y: 1500}, data: { label: 'Cancellation Confirmed', file: 'ivr/ivr-thank_you.wav' } },
        { id: 'n27', type: 'hangup',      position: { x: 480, y: 1620}, data: { label: 'Hangup',                 cause: 'NORMAL_CLEARING' } },
        { id: 'n28', type: 'play_audio',  position: { x: 680, y: 1500}, data: { label: 'Cancel Failed Msg',      file: 'ivr/ivr-please_try_again.wav' } },
        { id: 'n29', type: 'transfer',    position: { x: 680, y: 1620}, data: { label: 'Reception (Cancel Err)', destination: '0',    transfer_type: 'blind' } },
        // 0 = Reception
        { id: 'n30', type: 'transfer',    position: { x: 760, y: 1360}, data: { label: 'Reception',              destination: '0',    transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-5',   source: 'n2',  target: 'n5',  sourceHandle: '1' },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: '2' },
        { id: 'e2-4',   source: 'n2',  target: 'n4',  sourceHandle: '0' },
        // Booking ref entry
        { id: 'e5-6',   source: 'n5',  target: 'n6'  },
        { id: 'e6-7',   source: 'n6',  target: 'n7'  },
        { id: 'e7-8',   source: 'n7',  target: 'n8'  },
        // API lookup results
        { id: 'e8-11',  source: 'n8',  target: 'n11', sourceHandle: 'success' },
        { id: 'e8-9',   source: 'n8',  target: 'n9',  sourceHandle: 'error'   },
        { id: 'e8-9t',  source: 'n8',  target: 'n9',  sourceHandle: 'timeout' },
        { id: 'e9-10',  source: 'n9',  target: 'n10' },
        // Found vs not found
        { id: 'e11-17', source: 'n11', target: 'n17', sourceHandle: 'true'  },
        { id: 'e11-12', source: 'n11', target: 'n12', sourceHandle: 'false' },
        // Not found options
        { id: 'e12-13', source: 'n12', target: 'n13' },
        { id: 'e13-14', source: 'n13', target: 'n14', sourceHandle: '1' },
        { id: 'e13-15', source: 'n13', target: 'n15', sourceHandle: '2' },
        { id: 'e13-16', source: 'n13', target: 'n16', sourceHandle: '0' },
        // Confirmed vs pending
        { id: 'e17-20', source: 'n17', target: 'n20', sourceHandle: 'true'  },
        { id: 'e17-18', source: 'n17', target: 'n18', sourceHandle: 'false' },
        { id: 'e18-19', source: 'n18', target: 'n19' },
        // Appointment options
        { id: 'e20-21', source: 'n20', target: 'n21' },
        { id: 'e21-22', source: 'n21', target: 'n22', sourceHandle: '1' },
        { id: 'e21-24', source: 'n21', target: 'n24', sourceHandle: '2' },
        { id: 'e21-25', source: 'n21', target: 'n25', sourceHandle: '3' },
        { id: 'e21-30', source: 'n21', target: 'n30', sourceHandle: '0' },
        { id: 'e22-23', source: 'n22', target: 'n23' },
        // Cancel API
        { id: 'e25-26', source: 'n25', target: 'n26', sourceHandle: 'success' },
        { id: 'e25-28', source: 'n25', target: 'n28', sourceHandle: 'error'   },
        { id: 'e25-28t',source: 'n25', target: 'n28', sourceHandle: 'timeout' },
        { id: 'e26-27', source: 'n26', target: 'n27' },
        { id: 'e28-29', source: 'n28', target: 'n29' },
      ],
    },
  },

  // ── Multi-Level IVR Templates (existing) ──────────────────────────────────

  {
    id: 'enterprise_2level',
    name: 'Enterprise 2-Level Menu',
    description: 'Two-tier IVR: top menu routes to department sub-menus (Sales, Support, Billing), each with their own options',
    category: 'Multi-Level',
    icon: 'tree',
    graph: {
      nodes: [
        { id: 'n1',  type: 'play_audio', position: { x: 460, y: 0   }, data: { label: 'Welcome',          file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'get_digits', position: { x: 460, y: 120 }, data: { label: 'Main Menu',         prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','0'] } },
        { id: 'n3',  type: 'play_audio', position: { x: 80,  y: 280 }, data: { label: 'Sales Intro',       file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n4',  type: 'get_digits', position: { x: 80,  y: 400 }, data: { label: 'Sales Sub-Menu',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n5',  type: 'transfer',   position: { x: 0,   y: 560 }, data: { label: 'New Sales',         destination: '2001', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',   position: { x: 160, y: 560 }, data: { label: 'Existing Account',  destination: '2002', transfer_type: 'blind' } },
        { id: 'n7',  type: 'play_audio', position: { x: 400, y: 280 }, data: { label: 'Support Intro',     file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n8',  type: 'get_digits', position: { x: 400, y: 400 }, data: { label: 'Support Sub-Menu',  prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        { id: 'n9',  type: 'transfer',   position: { x: 300, y: 560 }, data: { label: 'Technical Support', destination: '3001', transfer_type: 'blind' } },
        { id: 'n10', type: 'transfer',   position: { x: 460, y: 560 }, data: { label: 'General Support',   destination: '3002', transfer_type: 'blind' } },
        { id: 'n11', type: 'voicemail',  position: { x: 620, y: 560 }, data: { label: 'Support Voicemail', mailbox_id: '3000' } },
        { id: 'n12', type: 'play_audio', position: { x: 720, y: 280 }, data: { label: 'Billing Intro',     file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n13', type: 'get_digits', position: { x: 720, y: 400 }, data: { label: 'Billing Sub-Menu',  prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n14', type: 'transfer',   position: { x: 640, y: 560 }, data: { label: 'Make Payment',      destination: '4001', transfer_type: 'blind' } },
        { id: 'n15', type: 'transfer',   position: { x: 800, y: 560 }, data: { label: 'Invoice Queries',   destination: '4002', transfer_type: 'blind' } },
        { id: 'n16', type: 'transfer',   position: { x: 960, y: 280 }, data: { label: 'Operator',          destination: '0',    transfer_type: 'blind' } },
        { id: 'n17', type: 'voicemail',  position: { x: 460, y: 560 }, data: { label: 'No Input → VM',     mailbox_id: '1000' } },
        { id: 'n18', type: 'transfer',   position: { x: 80,  y: 560 }, data: { label: 'Back to Main',      destination: '{{dnis}}', transfer_type: 'blind' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: '1' },
        { id: 'e2-7',   source: 'n2',  target: 'n7',  sourceHandle: '2' },
        { id: 'e2-12',  source: 'n2',  target: 'n12', sourceHandle: '3' },
        { id: 'e2-16',  source: 'n2',  target: 'n16', sourceHandle: '0' },
        { id: 'e2-17',  source: 'n2',  target: 'n17', sourceHandle: 'timeout' },
        { id: 'e3-4',   source: 'n3',  target: 'n4'  },
        { id: 'e4-5',   source: 'n4',  target: 'n5',  sourceHandle: '1' },
        { id: 'e4-6',   source: 'n4',  target: 'n6',  sourceHandle: '2' },
        { id: 'e4-18',  source: 'n4',  target: 'n18', sourceHandle: '9' },
        { id: 'e4-18t', source: 'n4',  target: 'n18', sourceHandle: 'timeout' },
        { id: 'e7-8',   source: 'n7',  target: 'n8'  },
        { id: 'e8-9',   source: 'n8',  target: 'n9',  sourceHandle: '1' },
        { id: 'e8-10',  source: 'n8',  target: 'n10', sourceHandle: '2' },
        { id: 'e8-11',  source: 'n8',  target: 'n11', sourceHandle: '3' },
        { id: 'e8-18',  source: 'n8',  target: 'n18', sourceHandle: '9' },
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
        { id: 'n1',  type: 'play_audio',    position: { x: 400, y: 0   }, data: { label: 'Medical Centre',      file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'time_condition', position: { x: 400, y: 120 }, data: { label: 'Open Hours?',         schedule: { open: '08:00', close: '18:00', days: 'mon-fri' } } },
        { id: 'n3',  type: 'get_digits',    position: { x: 200, y: 280 }, data: { label: 'Main Menu',           prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','0'] } },
        { id: 'n4',  type: 'get_digits',    position: { x: 0,   y: 440 }, data: { label: 'Medical Sub-Menu',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        { id: 'n5',  type: 'transfer',      position: { x: 0,   y: 600 }, data: { label: 'GP Appointments',     destination: '2001', transfer_type: 'blind' } },
        { id: 'n6',  type: 'transfer',      position: { x: 160, y: 600 }, data: { label: 'Specialist Referral', destination: '2002', transfer_type: 'blind' } },
        { id: 'n7',  type: 'transfer',      position: { x: 320, y: 600 }, data: { label: 'Urgent Care',         destination: '2099', transfer_type: 'blind' } },
        { id: 'n8',  type: 'get_digits',    position: { x: 320, y: 440 }, data: { label: 'Dental Sub-Menu',     prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n9',  type: 'transfer',      position: { x: 480, y: 600 }, data: { label: 'Routine Dental',      destination: '3001', transfer_type: 'blind' } },
        { id: 'n10', type: 'transfer',      position: { x: 640, y: 600 }, data: { label: 'Dental Emergency',    destination: '3099', transfer_type: 'blind' } },
        { id: 'n11', type: 'transfer',      position: { x: 600, y: 440 }, data: { label: 'Billing Dept',        destination: '4001', transfer_type: 'blind' } },
        { id: 'n12', type: 'transfer',      position: { x: 800, y: 440 }, data: { label: 'Reception',           destination: '0',    transfer_type: 'blind' } },
        { id: 'n13', type: 'voicemail',     position: { x: 200, y: 560 }, data: { label: 'No Input → VM',       mailbox_id: '1000' } },
        { id: 'n14', type: 'play_audio',    position: { x: 620, y: 280 }, data: { label: 'After Hours',         file: 'ivr/ivr-not_available.wav' } },
        { id: 'n15', type: 'get_digits',    position: { x: 620, y: 400 }, data: { label: 'After Hours Menu',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2'] } },
        { id: 'n16', type: 'transfer',      position: { x: 540, y: 540 }, data: { label: 'Emergency Line',      destination: '9001', transfer_type: 'blind' } },
        { id: 'n17', type: 'voicemail',     position: { x: 720, y: 540 }, data: { label: 'After Hours VM',      mailbox_id: '1000' } },
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
    description: 'Three-department (Internet, Phone, Billing) top menu each drilling into fault types, with API outage-check on Internet path',
    category: 'Multi-Level',
    icon: 'telecom',
    graph: {
      nodes: [
        { id: 'n1',  type: 'play_audio', position: { x: 460, y: 0   }, data: { label: 'Welcome',             file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'play_audio', position: { x: 460, y: 120 }, data: { label: 'Security Notice',     file: 'ivr/ivr-this_call_may_be_recorded.wav' } },
        { id: 'n3',  type: 'get_digits', position: { x: 460, y: 240 }, data: { label: 'Main Menu',           prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','4','0'] } },
        { id: 'n4',  type: 'api_call',   position: { x: 80,  y: 400 }, data: { label: 'Check Outage Status', url: 'https://api.example.com/outage?area={{ani}}', method: 'GET', timeout_ms: 4000, response_map: [{ json_path: '$.outage', variable: 'is_outage' }] } },
        { id: 'n5',  type: 'condition',  position: { x: 80,  y: 540 }, data: { label: 'Known Outage?',       variable: 'is_outage', operator: 'eq', value: 'true' } },
        { id: 'n6',  type: 'play_audio', position: { x: 0,   y: 680 }, data: { label: 'Outage Announcement', file: 'ivr/ivr-please_stay_on_the_line.wav' } },
        { id: 'n7',  type: 'hangup',     position: { x: 0,   y: 800 }, data: { label: 'Hangup',              cause: 'NORMAL_CLEARING' } },
        { id: 'n8',  type: 'get_digits', position: { x: 200, y: 680 }, data: { label: 'Internet Sub-Menu',   prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        { id: 'n9',  type: 'transfer',   position: { x: 140, y: 820 }, data: { label: 'Broadband Faults',    destination: '5001', transfer_type: 'blind' } },
        { id: 'n10', type: 'transfer',   position: { x: 300, y: 820 }, data: { label: 'Speed Issues',        destination: '5002', transfer_type: 'blind' } },
        { id: 'n11', type: 'transfer',   position: { x: 460, y: 820 }, data: { label: 'New Setup',           destination: '5003', transfer_type: 'blind' } },
        { id: 'n12', type: 'get_digits', position: { x: 520, y: 400 }, data: { label: 'Phone Sub-Menu',      prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        { id: 'n13', type: 'transfer',   position: { x: 400, y: 560 }, data: { label: 'No Dial Tone',        destination: '6001', transfer_type: 'blind' } },
        { id: 'n14', type: 'transfer',   position: { x: 560, y: 560 }, data: { label: 'Call Quality',        destination: '6002', transfer_type: 'blind' } },
        { id: 'n15', type: 'transfer',   position: { x: 720, y: 560 }, data: { label: 'International Calls', destination: '6003', transfer_type: 'blind' } },
        { id: 'n16', type: 'get_digits', position: { x: 760, y: 400 }, data: { label: 'Billing Sub-Menu',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n17', type: 'transfer',   position: { x: 680, y: 560 }, data: { label: 'Pay Bill',            destination: '7001', transfer_type: 'blind' } },
        { id: 'n18', type: 'transfer',   position: { x: 840, y: 560 }, data: { label: 'Billing Queries',     destination: '7002', transfer_type: 'blind' } },
        { id: 'n19', type: 'transfer',   position: { x: 960, y: 400 }, data: { label: 'TV Support',          destination: '8001', transfer_type: 'blind' } },
        { id: 'n20', type: 'transfer',   position: { x: 1100,y: 400 }, data: { label: 'Operator',            destination: '0',    transfer_type: 'blind' } },
        { id: 'n21', type: 'transfer',   position: { x: 80,  y: 820 }, data: { label: 'Back to Main',        destination: '{{dnis}}', transfer_type: 'blind' } },
        { id: 'n22', type: 'voicemail',  position: { x: 460, y: 400 }, data: { label: 'No Input → VM',       mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-3',   source: 'n2',  target: 'n3'  },
        { id: 'e3-4',   source: 'n3',  target: 'n4',  sourceHandle: '1' },
        { id: 'e3-12',  source: 'n3',  target: 'n12', sourceHandle: '2' },
        { id: 'e3-16',  source: 'n3',  target: 'n16', sourceHandle: '3' },
        { id: 'e3-19',  source: 'n3',  target: 'n19', sourceHandle: '4' },
        { id: 'e3-20',  source: 'n3',  target: 'n20', sourceHandle: '0' },
        { id: 'e3-22',  source: 'n3',  target: 'n22', sourceHandle: 'timeout' },
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
        { id: 'e12-13', source: 'n12', target: 'n13', sourceHandle: '1' },
        { id: 'e12-14', source: 'n12', target: 'n14', sourceHandle: '2' },
        { id: 'e12-15', source: 'n12', target: 'n15', sourceHandle: '3' },
        { id: 'e12-21', source: 'n12', target: 'n21', sourceHandle: '9' },
        { id: 'e16-17', source: 'n16', target: 'n17', sourceHandle: '1' },
        { id: 'e16-18', source: 'n16', target: 'n18', sourceHandle: '2' },
        { id: 'e16-21', source: 'n16', target: 'n21', sourceHandle: '9' },
      ],
    },
  },

  // ── NEW Multi-Level Templates ──────────────────────────────────────────────

  {
    id: 'multilingual_ivr',
    name: 'Multilingual IVR (3 Languages)',
    description: 'Language selection (English / Spanish / French), then each language has its own full department sub-menu with matching routing queues',
    category: 'Multi-Level',
    icon: 'globe',
    graph: {
      nodes: [
        // Entry
        { id: 'n1',  type: 'play_audio', position: { x: 460, y: 0   }, data: { label: 'Language Prompt',      file: 'ivr/ivr-please_choose_from_the_following.wav' } },
        { id: 'n2',  type: 'get_digits', position: { x: 460, y: 120 }, data: { label: 'Select Language',      prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 7000, retries: 3, valid_digits: ['1','2','3'] } },
        { id: 'n3',  type: 'set_variable',position:{ x: 460, y: 240 }, data: { label: 'Default Language EN',  key: 'language', value: 'en' } },

        // ── English path ──
        { id: 'n4',  type: 'set_variable',position:{ x: 80,  y: 280 }, data: { label: 'Set Lang = EN',        key: 'language', value: 'en' } },
        { id: 'n5',  type: 'play_audio', position: { x: 80,  y: 400 }, data: { label: 'EN Welcome',           file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n6',  type: 'get_digits', position: { x: 80,  y: 520 }, data: { label: 'EN Main Menu',         prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','0'] } },
        { id: 'n7',  type: 'transfer',   position: { x: 0,   y: 680 }, data: { label: 'EN Sales',             destination: '1001', transfer_type: 'blind' } },
        { id: 'n8',  type: 'transfer',   position: { x: 140, y: 680 }, data: { label: 'EN Support',           destination: '1002', transfer_type: 'blind' } },
        { id: 'n9',  type: 'transfer',   position: { x: 280, y: 680 }, data: { label: 'EN Billing',           destination: '1003', transfer_type: 'blind' } },
        { id: 'n10', type: 'transfer',   position: { x: 420, y: 680 }, data: { label: 'EN Operator',          destination: '0',    transfer_type: 'blind' } },

        // ── Spanish path ──
        { id: 'n11', type: 'set_variable',position:{ x: 460, y: 280 }, data: { label: 'Set Lang = ES',        key: 'language', value: 'es' } },
        { id: 'n12', type: 'play_audio', position: { x: 460, y: 400 }, data: { label: 'ES Welcome',           file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n13', type: 'get_digits', position: { x: 460, y: 520 }, data: { label: 'ES Main Menu',         prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','0'] } },
        { id: 'n14', type: 'transfer',   position: { x: 380, y: 680 }, data: { label: 'ES Ventas',            destination: '2001', transfer_type: 'blind' } },
        { id: 'n15', type: 'transfer',   position: { x: 520, y: 680 }, data: { label: 'ES Soporte',           destination: '2002', transfer_type: 'blind' } },
        { id: 'n16', type: 'transfer',   position: { x: 660, y: 680 }, data: { label: 'ES Facturación',       destination: '2003', transfer_type: 'blind' } },
        { id: 'n17', type: 'transfer',   position: { x: 800, y: 680 }, data: { label: 'ES Operador',          destination: '0',    transfer_type: 'blind' } },

        // ── French path ──
        { id: 'n18', type: 'set_variable',position:{ x: 840, y: 280 }, data: { label: 'Set Lang = FR',        key: 'language', value: 'fr' } },
        { id: 'n19', type: 'play_audio', position: { x: 840, y: 400 }, data: { label: 'FR Bienvenue',         file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n20', type: 'get_digits', position: { x: 840, y: 520 }, data: { label: 'FR Menu Principal',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 3, valid_digits: ['1','2','3','0'] } },
        { id: 'n21', type: 'transfer',   position: { x: 760, y: 680 }, data: { label: 'FR Ventes',            destination: '3001', transfer_type: 'blind' } },
        { id: 'n22', type: 'transfer',   position: { x: 900, y: 680 }, data: { label: 'FR Support',           destination: '3002', transfer_type: 'blind' } },
        { id: 'n23', type: 'transfer',   position: { x: 1040,y: 680 }, data: { label: 'FR Facturation',       destination: '3003', transfer_type: 'blind' } },
        { id: 'n24', type: 'transfer',   position: { x: 1180,y: 680 }, data: { label: 'FR Opérateur',         destination: '0',    transfer_type: 'blind' } },

        // Timeout → default English
        { id: 'n25', type: 'voicemail',  position: { x: 460, y: 400 }, data: { label: 'No Input → VM',        mailbox_id: '1000' } },
      ],
      edges: [
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-4',   source: 'n2',  target: 'n4',  sourceHandle: '1' },
        { id: 'e2-11',  source: 'n2',  target: 'n11', sourceHandle: '2' },
        { id: 'e2-18',  source: 'n2',  target: 'n18', sourceHandle: '3' },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: 'timeout' },
        { id: 'e3-5',   source: 'n3',  target: 'n5'  },
        // English
        { id: 'e4-5',   source: 'n4',  target: 'n5'  },
        { id: 'e5-6',   source: 'n5',  target: 'n6'  },
        { id: 'e6-7',   source: 'n6',  target: 'n7',  sourceHandle: '1' },
        { id: 'e6-8',   source: 'n6',  target: 'n8',  sourceHandle: '2' },
        { id: 'e6-9',   source: 'n6',  target: 'n9',  sourceHandle: '3' },
        { id: 'e6-10',  source: 'n6',  target: 'n10', sourceHandle: '0' },
        // Spanish
        { id: 'e11-12', source: 'n11', target: 'n12' },
        { id: 'e12-13', source: 'n12', target: 'n13' },
        { id: 'e13-14', source: 'n13', target: 'n14', sourceHandle: '1' },
        { id: 'e13-15', source: 'n13', target: 'n15', sourceHandle: '2' },
        { id: 'e13-16', source: 'n13', target: 'n16', sourceHandle: '3' },
        { id: 'e13-17', source: 'n13', target: 'n17', sourceHandle: '0' },
        // French
        { id: 'e18-19', source: 'n18', target: 'n19' },
        { id: 'e19-20', source: 'n19', target: 'n20' },
        { id: 'e20-21', source: 'n20', target: 'n21', sourceHandle: '1' },
        { id: 'e20-22', source: 'n20', target: 'n22', sourceHandle: '2' },
        { id: 'e20-23', source: 'n20', target: 'n23', sourceHandle: '3' },
        { id: 'e20-24', source: 'n20', target: 'n24', sourceHandle: '0' },
        // Timeout
        { id: 'e2-25',  source: 'n2',  target: 'n25', sourceHandle: 'timeout' },
      ],
    },
  },

  {
    id: 'enterprise_3level',
    name: 'Large Enterprise 3-Level IVR',
    description: '3-tier IVR: Region → Division → Team. Caller first selects region (North/South/HQ), then department (Sales/Support/Finance), then specific team — with time-check and API skills routing at level 3',
    category: 'Multi-Level',
    icon: 'sitemap',
    graph: {
      nodes: [
        // Entry & time check
        { id: 'n1',  type: 'play_audio',    position: { x: 560, y: 0   }, data: { label: 'Welcome',              file: 'ivr/ivr-thank_you_for_calling.wav' } },
        { id: 'n2',  type: 'time_condition', position: { x: 560, y: 120 }, data: { label: 'Business Hours?',      schedule: { open: '08:00', close: '18:00', days: 'mon-fri' } } },
        // After hours
        { id: 'n3',  type: 'play_audio',    position: { x: 960, y: 260 }, data: { label: 'After Hours Msg',      file: 'ivr/ivr-not_available.wav' } },
        { id: 'n4',  type: 'voicemail',     position: { x: 960, y: 380 }, data: { label: 'After Hours VM',       mailbox_id: '1000' } },
        // ── Level 1: Region ──
        { id: 'n5',  type: 'get_digits',    position: { x: 560, y: 260 }, data: { label: 'L1: Select Region',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 7000, retries: 3, valid_digits: ['1','2','3','0'] } },

        // ── Region 1: North ──
        { id: 'n6',  type: 'play_audio',    position: { x: 80,  y: 420 }, data: { label: 'North Region',         file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n7',  type: 'get_digits',    position: { x: 80,  y: 540 }, data: { label: 'L2: North Dept',       prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        // North → Sales
        { id: 'n8',  type: 'get_digits',    position: { x: 0,   y: 700 }, data: { label: 'L3: North Sales',      prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n9',  type: 'transfer',      position: { x: 0,   y: 840 }, data: { label: 'N-Sales New Biz',      destination: '1101', transfer_type: 'blind' } },
        { id: 'n10', type: 'transfer',      position: { x: 160, y: 840 }, data: { label: 'N-Sales Renewals',     destination: '1102', transfer_type: 'blind' } },
        // North → Support (with API skills routing)
        { id: 'n11', type: 'api_call',      position: { x: 220, y: 700 }, data: { label: 'API: Check N-Support', url: 'https://api.example.com/skills?dept=north_support&ani={{ani}}', method: 'GET', timeout_ms: 3000, response_map: [{ json_path: '$.queue', variable: 'n_support_queue' }] } },
        { id: 'n12', type: 'transfer',      position: { x: 200, y: 860 }, data: { label: 'N-Support (Routed)',   destination: '{{n_support_queue}}', transfer_type: 'blind' } },
        { id: 'n13', type: 'transfer',      position: { x: 380, y: 860 }, data: { label: 'N-Support Fallback',   destination: '1103', transfer_type: 'blind' } },
        // North → Finance
        { id: 'n14', type: 'get_digits',    position: { x: 420, y: 700 }, data: { label: 'L3: North Finance',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2'] } },
        { id: 'n15', type: 'transfer',      position: { x: 380, y: 840 }, data: { label: 'N-Finance Billing',    destination: '1104', transfer_type: 'blind' } },
        { id: 'n16', type: 'transfer',      position: { x: 540, y: 840 }, data: { label: 'N-Finance Treasury',   destination: '1105', transfer_type: 'blind' } },
        // Back to main (North)
        { id: 'n17', type: 'transfer',      position: { x: 80,  y: 700 }, data: { label: 'Back to Regions',      destination: '{{dnis}}', transfer_type: 'blind' } },

        // ── Region 2: South ──
        { id: 'n18', type: 'play_audio',    position: { x: 640, y: 420 }, data: { label: 'South Region',         file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n19', type: 'get_digits',    position: { x: 640, y: 540 }, data: { label: 'L2: South Dept',       prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','9'] } },
        // South → Sales
        { id: 'n20', type: 'get_digits',    position: { x: 560, y: 700 }, data: { label: 'L3: South Sales',      prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','9'] } },
        { id: 'n21', type: 'transfer',      position: { x: 560, y: 840 }, data: { label: 'S-Sales New Biz',      destination: '2101', transfer_type: 'blind' } },
        { id: 'n22', type: 'transfer',      position: { x: 720, y: 840 }, data: { label: 'S-Sales Renewals',     destination: '2102', transfer_type: 'blind' } },
        // South → Support
        { id: 'n23', type: 'transfer',      position: { x: 800, y: 700 }, data: { label: 'S-Support Queue',      destination: '2103', transfer_type: 'blind' } },
        // South → Finance
        { id: 'n24', type: 'get_digits',    position: { x: 960, y: 700 }, data: { label: 'L3: South Finance',    prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2'] } },
        { id: 'n25', type: 'transfer',      position: { x: 920, y: 840 }, data: { label: 'S-Finance Billing',    destination: '2104', transfer_type: 'blind' } },
        { id: 'n26', type: 'transfer',      position: { x: 1080,y: 840 }, data: { label: 'S-Finance Treasury',   destination: '2105', transfer_type: 'blind' } },
        // Back to main (South)
        { id: 'n27', type: 'transfer',      position: { x: 640, y: 700 }, data: { label: 'Back to Regions',      destination: '{{dnis}}', transfer_type: 'blind' } },

        // ── Region 3: HQ ──
        { id: 'n28', type: 'play_audio',    position: { x: 1200,y: 420 }, data: { label: 'HQ Region',            file: 'ivr/ivr-one_moment_please.wav' } },
        { id: 'n29', type: 'get_digits',    position: { x: 1200,y: 540 }, data: { label: 'L2: HQ Dept',          prompt_file: 'ivr/ivr-please_choose_from_the_following.wav', min_digits: 1, max_digits: 1, timeout_ms: 6000, retries: 2, valid_digits: ['1','2','3','4','9'] } },
        { id: 'n30', type: 'transfer',      position: { x: 1060,y: 700 }, data: { label: 'HQ Executive',         destination: '3001', transfer_type: 'blind' } },
        { id: 'n31', type: 'transfer',      position: { x: 1200,y: 700 }, data: { label: 'HQ HR / Recruitment',  destination: '3002', transfer_type: 'blind' } },
        { id: 'n32', type: 'transfer',      position: { x: 1340,y: 700 }, data: { label: 'HQ IT Helpdesk',       destination: '3003', transfer_type: 'blind' } },
        { id: 'n33', type: 'transfer',      position: { x: 1480,y: 700 }, data: { label: 'HQ Legal',             destination: '3004', transfer_type: 'blind' } },
        { id: 'n34', type: 'transfer',      position: { x: 1200,y: 700 }, data: { label: 'Back to Regions',      destination: '{{dnis}}', transfer_type: 'blind' } },

        // Operator / default (Level 1 digit 0)
        { id: 'n35', type: 'transfer',      position: { x: 1400,y: 260 }, data: { label: 'Main Operator',        destination: '0',    transfer_type: 'blind' } },
        // Timeout
        { id: 'n36', type: 'voicemail',     position: { x: 560, y: 400 }, data: { label: 'No Input → VM',        mailbox_id: '1000' } },
      ],
      edges: [
        // Entry
        { id: 'e1-2',   source: 'n1',  target: 'n2'  },
        { id: 'e2-5',   source: 'n2',  target: 'n5',  sourceHandle: 'open'   },
        { id: 'e2-3',   source: 'n2',  target: 'n3',  sourceHandle: 'closed' },
        { id: 'e3-4',   source: 'n3',  target: 'n4'  },
        // Level 1: region
        { id: 'e5-6',   source: 'n5',  target: 'n6',  sourceHandle: '1' },
        { id: 'e5-18',  source: 'n5',  target: 'n18', sourceHandle: '2' },
        { id: 'e5-28',  source: 'n5',  target: 'n28', sourceHandle: '3' },
        { id: 'e5-35',  source: 'n5',  target: 'n35', sourceHandle: '0' },
        { id: 'e5-36',  source: 'n5',  target: 'n36', sourceHandle: 'timeout' },
        // North → Level 2
        { id: 'e6-7',   source: 'n6',  target: 'n7'  },
        { id: 'e7-8',   source: 'n7',  target: 'n8',  sourceHandle: '1' },
        { id: 'e7-11',  source: 'n7',  target: 'n11', sourceHandle: '2' },
        { id: 'e7-14',  source: 'n7',  target: 'n14', sourceHandle: '3' },
        { id: 'e7-17',  source: 'n7',  target: 'n17', sourceHandle: '9' },
        // North Sales level 3
        { id: 'e8-9',   source: 'n8',  target: 'n9',  sourceHandle: '1' },
        { id: 'e8-10',  source: 'n8',  target: 'n10', sourceHandle: '2' },
        { id: 'e8-17',  source: 'n8',  target: 'n17', sourceHandle: '9' },
        // North Support API
        { id: 'e11-12', source: 'n11', target: 'n12', sourceHandle: 'success' },
        { id: 'e11-13', source: 'n11', target: 'n13', sourceHandle: 'error'   },
        { id: 'e11-13t',source: 'n11', target: 'n13', sourceHandle: 'timeout' },
        // North Finance level 3
        { id: 'e14-15', source: 'n14', target: 'n15', sourceHandle: '1' },
        { id: 'e14-16', source: 'n14', target: 'n16', sourceHandle: '2' },
        { id: 'e14-17', source: 'n14', target: 'n17', sourceHandle: '9' },
        // South → Level 2
        { id: 'e18-19', source: 'n18', target: 'n19' },
        { id: 'e19-20', source: 'n19', target: 'n20', sourceHandle: '1' },
        { id: 'e19-23', source: 'n19', target: 'n23', sourceHandle: '2' },
        { id: 'e19-24', source: 'n19', target: 'n24', sourceHandle: '3' },
        { id: 'e19-27', source: 'n19', target: 'n27', sourceHandle: '9' },
        // South Sales level 3
        { id: 'e20-21', source: 'n20', target: 'n21', sourceHandle: '1' },
        { id: 'e20-22', source: 'n20', target: 'n22', sourceHandle: '2' },
        { id: 'e20-27', source: 'n20', target: 'n27', sourceHandle: '9' },
        // South Finance level 3
        { id: 'e24-25', source: 'n24', target: 'n25', sourceHandle: '1' },
        { id: 'e24-26', source: 'n24', target: 'n26', sourceHandle: '2' },
        { id: 'e24-27', source: 'n24', target: 'n27', sourceHandle: '9' },
        // HQ → Level 2
        { id: 'e28-29', source: 'n28', target: 'n29' },
        { id: 'e29-30', source: 'n29', target: 'n30', sourceHandle: '1' },
        { id: 'e29-31', source: 'n29', target: 'n31', sourceHandle: '2' },
        { id: 'e29-32', source: 'n29', target: 'n32', sourceHandle: '3' },
        { id: 'e29-33', source: 'n29', target: 'n33', sourceHandle: '4' },
        { id: 'e29-34', source: 'n29', target: 'n34', sourceHandle: '9' },
      ],
    },
  },

];
