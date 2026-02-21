'use strict';

const crypto = require('crypto');
const pool   = require('../db');

// Stable sentinel so we can identify IVR Studio–owned dialplan rows
const IVR_STUDIO_APP_UUID = '00000000-0000-0000-0000-697672737475';

// Derive a deterministic UUID from domain + destination + context.
// Lets us do ON CONFLICT (dialplan_uuid) without a separate unique index.
function stableUuid(domainUuid, destination, context) {
  const h = crypto
    .createHash('md5')
    .update(`ivr_studio:${domainUuid}:${destination}:${context}`)
    .digest('hex');
  return [h.slice(0,8), h.slice(8,12), h.slice(12,16), h.slice(16,20), h.slice(20)].join('-');
}

// Build the FreeSWITCH dialplan XML snippet
function buildDialplanXml(destination) {
  const safe = destination.replace(/[^0-9a-zA-Z+*#]/g, '');
  return `<extension name="ivr_studio_${safe}" continue="false">
  <condition field="destination_number" expression="^(${safe})$">
    <action application="set" data="ivr_dnis=\${destination_number}"/>
    <action application="lua" data="ivr_studio/ivr_interpreter.lua"/>
  </condition>
</extension>`;
}

// Upsert a single dialplan row for one context
async function upsertOne(db, { domainUuid, domainName, destination, flowName, context }) {
  const uuid = stableUuid(domainUuid, destination, context);
  const xml  = buildDialplanXml(destination);

  await db.query(
    `INSERT INTO public.v_dialplans (
       dialplan_uuid, app_uuid, domain_uuid,
       dialplan_context, dialplan_name, dialplan_number,
       dialplan_order, dialplan_enabled, dialplan_description,
       dialplan_xml, insert_date, insert_user
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6,
       100, 'true', 'Managed by IVR Studio — do not edit manually',
       $7, NOW(), NULL
     )
     ON CONFLICT (dialplan_uuid) DO UPDATE SET
       dialplan_xml         = EXCLUDED.dialplan_xml,
       dialplan_name        = EXCLUDED.dialplan_name,
       dialplan_enabled     = 'true',
       dialplan_description = EXCLUDED.dialplan_description`,
    [uuid, IVR_STUDIO_APP_UUID, domainUuid,
     context, `IVR Studio: ${flowName}`, destination,
     xml]
  );
}

// Insert into BOTH public (incoming PSTN DIDs) and the domain context
// (internal SIP extensions, e.g. "192.168.0.113").
// routeType: 'both' | 'public' | 'internal'
async function upsertDialplanEntry(clientOrNull, { domainUuid, domainName, destination, flowName, routeType = 'both' }) {
  const db = clientOrNull || pool;

  const publicCtx   = 'public';
  const internalCtx = domainName; // e.g. "192.168.0.113"

  if (routeType === 'both' || routeType === 'public') {
    await upsertOne(db, { domainUuid, domainName, destination, flowName, context: publicCtx });
  }
  if (routeType === 'both' || routeType === 'internal') {
    await upsertOne(db, { domainUuid, domainName, destination, flowName, context: internalCtx });
  }
}

// Delete IVR Studio dialplan rows for a given destination (all contexts)
async function deleteDialplanEntry(clientOrNull, { domainUuid, destination }) {
  const db = clientOrNull || pool;
  await db.query(
    `DELETE FROM public.v_dialplans
     WHERE domain_uuid = $1
       AND dialplan_number = $2
       AND app_uuid = $3`,
    [domainUuid, destination, IVR_STUDIO_APP_UUID]
  );
}

module.exports = {
  upsertDialplanEntry,
  deleteDialplanEntry,
  buildDialplanXml,
};
