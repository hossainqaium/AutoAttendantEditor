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
// Condition  — simple (true/false) OR multi-branch (if/elseif/else) with
//             AND / OR compound clauses per branch
// ---------------------------------------------------------------------------
const OP_SHORT: Record<string, string> = {
  eq: '==', neq: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=',
  contains: '∋', not_contains: '∌', empty: '∅', not_empty: '≠∅',
};

type Clause  = { id: string; variable: string; operator: string; value: string; join?: 'and'|'or' };
type CBranch = { id: string; label: string; clauses?: Clause[]; operator?: string; value?: string };

// Render a 1-line summary of a branch's clauses (max 2 shown)
function clauseSummary(b: CBranch, fallbackVar: string): string {
  const clauses: Clause[] = b.clauses?.length
    ? b.clauses
    : [{ id: '', variable: fallbackVar, operator: b.operator || 'eq', value: b.value || '' }];

  return clauses
    .slice(0, 2)
    .map((c, i) => {
      const join = i > 0 ? ` ${(c.join || 'and').toUpperCase()} ` : '';
      const val  = c.value ? ` "${c.value}"` : '';
      return `${join}${c.variable || '?'} ${OP_SHORT[c.operator] || c.operator}${val}`;
    })
    .join('') + (clauses.length > 2 ? ' …' : '');
}

export function ConditionNode({ id, data, selected }: NodeProps) {
  const branches = (data.branches as CBranch[]) || [];
  const fallbackVar = String(data.variable || '?');

  const outputs = branches.length > 0
    ? [
        ...branches.map((b) => ({ id: b.id, label: b.label || b.id })),
        { id: 'else', label: 'Else' },
      ]
    : [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }];

  return (
    <NodeBase nodeId={id} label={String(data.label || 'Condition')} icon={<GitBranch size={13}/>}
      color="bg-orange-500" selected={selected} handles={{ outputs }}>
      {branches.length > 0 ? (
        <div className="space-y-1 min-w-[170px]">
          {branches.slice(0, 3).map((b, i) => (
            <div key={b.id} className="border-l-2 border-orange-200 pl-1.5">
              <span className={`text-[8px] font-bold ${i === 0 ? 'text-orange-500' : 'text-amber-500'}`}>
                {i === 0 ? 'IF' : 'ELIF'}
              </span>
              <p className="font-mono text-[9px] text-gray-500 leading-tight truncate max-w-[160px]">
                {clauseSummary(b, fallbackVar)}
              </p>
            </div>
          ))}
          {branches.length > 3 && (
            <p className="text-[9px] text-gray-400 pl-1.5">+{branches.length - 3} more…</p>
          )}
          <div className="border-l-2 border-gray-200 pl-1.5">
            <span className="text-[8px] font-bold text-gray-400">ELSE</span>
          </div>
        </div>
      ) : (
        <p className="font-mono text-[10px] truncate">
          {fallbackVar} {OP_SHORT[String(data.operator)] || String(data.operator || '==')} &quot;{String(data.value || '?')}&quot;
        </p>
      )}
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
