// =============================================================================
// All IVR Studio node type components
// =============================================================================

import React from 'react';
import { useFlowStore } from '../../store/flowStore';
import { NodeBase } from './NodeBase';
import {
  Volume2, Hash, PhoneForwarded, Voicemail,
  GitBranch, Clock, Globe, PhoneOff, Variable,
} from 'lucide-react';

type NodeProps = { id: string; data: Record<string, unknown>; selected: boolean };

// ---------------------------------------------------------------------------
// Play Audio
// ---------------------------------------------------------------------------
export function PlayAudioNode({ id, data, selected }: NodeProps) {
  return (
    <NodeBase nodeId={id} label={String(data.label || 'Play Audio')} icon={<Volume2 size={13}/>}
      color="bg-emerald-500" selected={selected}>
      <p className="truncate">{String(data.file || data.file_var || 'No file set')}</p>
    </NodeBase>
  );
}

// ---------------------------------------------------------------------------
// Get Digits
// ---------------------------------------------------------------------------
export function GetDigitsNode({ id, data, selected }: NodeProps) {
  const activeDigits = (data.valid_digits as string[] | undefined) || ['1','2'];
  const outputs = [
    ...activeDigits.map((d) => ({ id: d, label: `Press ${d}` })),
    { id: 'timeout', label: 'Timeout' },
    { id: 'invalid', label: 'Invalid' },
  ];
  return (
    <NodeBase nodeId={id} label={String(data.label || 'Get Digits')} icon={<Hash size={13}/>}
      color="bg-violet-500" selected={selected} handles={{ outputs }}>
      <p>Max: {String(data.max_digits || 1)} digit(s)</p>
      <p>Timeout: {String(data.timeout_ms || 5000)}ms</p>
    </NodeBase>
  );
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------
export function TransferNode({ id, data, selected }: NodeProps) {
  return (
    <NodeBase nodeId={id} label={String(data.label || 'Transfer')} icon={<PhoneForwarded size={13}/>}
      color="bg-sky-500" selected={selected}
      handles={{ outputs: [{ id: 'failed', label: 'Failed' }] }}>
      <p className="truncate">{String(data.destination || 'No destination')}</p>
      <p className="text-gray-400">{String(data.transfer_type || 'blind')}</p>
    </NodeBase>
  );
}

// ---------------------------------------------------------------------------
// Voicemail
// ---------------------------------------------------------------------------
export function VoicemailNode({ id, data, selected }: NodeProps) {
  return (
    <NodeBase nodeId={id} label={String(data.label || 'Voicemail')} icon={<Voicemail size={13}/>}
      color="bg-amber-500" selected={selected} handles={{ outputs: [] }}>
      <p>Mailbox: {String(data.mailbox_id || '{{dnis}}')}</p>
    </NodeBase>
  );
}

// ---------------------------------------------------------------------------
// Condition
// ---------------------------------------------------------------------------
export function ConditionNode({ id, data, selected }: NodeProps) {
  return (
    <NodeBase nodeId={id} label={String(data.label || 'Condition')} icon={<GitBranch size={13}/>}
      color="bg-orange-500" selected={selected}
      handles={{ outputs: [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }] }}>
      <p className="truncate font-mono text-[10px]">
        {String(data.variable || '?')} {String(data.operator || '==')} {String(data.value || '?')}
      </p>
    </NodeBase>
  );
}

// ---------------------------------------------------------------------------
// Time Condition
// ---------------------------------------------------------------------------
export function TimeConditionNode({ id, data, selected }: NodeProps) {
  const sched = (data.schedule as { open?: string; close?: string } | undefined) || {};
  return (
    <NodeBase nodeId={id} label={String(data.label || 'Time Condition')} icon={<Clock size={13}/>}
      color="bg-teal-500" selected={selected}
      handles={{ outputs: [{ id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' }] }}>
      <p>{sched.open || '--:--'} – {sched.close || '--:--'}</p>
    </NodeBase>
  );
}

// ---------------------------------------------------------------------------
// API Call
// ---------------------------------------------------------------------------
export function ApiCallNode({ id, data, selected }: NodeProps) {
  return (
    <NodeBase nodeId={id} label={String(data.label || 'API Call')} icon={<Globe size={13}/>}
      color="bg-indigo-500" selected={selected}
      handles={{ outputs: [
        { id: 'success', label: 'Success' },
        { id: 'timeout', label: 'Timeout' },
        { id: 'error',   label: 'Error' },
      ]}}>
      <p className="font-semibold text-[10px]">{String(data.method || 'GET')}</p>
      <p className="truncate text-[10px]">{String(data.url || 'No URL')}</p>
    </NodeBase>
  );
}

// ---------------------------------------------------------------------------
// Hangup
// ---------------------------------------------------------------------------
export function HangupNode({ id, data, selected }: NodeProps) {
  return (
    <NodeBase nodeId={id} label={String(data.label || 'Hangup')} icon={<PhoneOff size={13}/>}
      color="bg-red-500" selected={selected} handles={{ outputs: [] }}>
      <p>{String(data.cause || 'NORMAL_CLEARING')}</p>
    </NodeBase>
  );
}

// ---------------------------------------------------------------------------
// Set Variable
// ---------------------------------------------------------------------------
export function SetVariableNode({ id, data, selected }: NodeProps) {
  return (
    <NodeBase nodeId={id} label={String(data.label || 'Set Variable')} icon={<Variable size={13}/>}
      color="bg-gray-600" selected={selected}>
      <p className="font-mono text-[10px] truncate">
        {String(data.key || 'key')} = {String(data.value || '...')}
      </p>
    </NodeBase>
  );
}

// ---------------------------------------------------------------------------
// Node type registry for ReactFlow
// ---------------------------------------------------------------------------
export const nodeTypes = {
  play_audio:     PlayAudioNode,
  get_digits:     GetDigitsNode,
  transfer:       TransferNode,
  voicemail:      VoicemailNode,
  condition:      ConditionNode,
  time_condition: TimeConditionNode,
  api_call:       ApiCallNode,
  hangup:         HangupNode,
  set_variable:   SetVariableNode,
};
