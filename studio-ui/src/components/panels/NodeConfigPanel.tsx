// =============================================================================
// Node Configuration Side Panel
// Renders the config form for the selected node type.
// Audio file and destination fields fetch live data from FusionPBX.
// =============================================================================

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { X, Plus, Trash2, RefreshCw, ChevronDown, Music, Phone, Search, FolderOpen, Play, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getRecordings, getDestinations, type Destination, type SoundCategory, type SoundFile } from '../../api/client';

// ── FreeSWITCH built-in sound catalog (static, always available) ──────────────
// Paths are relative to the FS sounds dir; FreeSWITCH auto-resolves locale/rate.
const BUILTIN_SOUNDS: SoundCategory[] = [
  {
    category: 'IVR Prompts',
    folder: 'ivr',
    files: [
      { path: 'ivr/ivr-welcome.wav',                                  label: 'Welcome' },
      { path: 'ivr/ivr-thank_you_for_calling.wav',                    label: 'Thank you for calling' },
      { path: 'ivr/ivr-thank_you.wav',                                label: 'Thank you' },
      { path: 'ivr/ivr-thank_you_for_using_this_service.wav',         label: 'Thank you for using this service' },
      { path: 'ivr/ivr-greeting.wav',                                 label: 'Greeting' },
      { path: 'ivr/ivr-goodbye.wav',                                  label: 'Goodbye' },
      { path: 'ivr/ivr-one_moment_please.wav',                        label: 'One moment please' },
      { path: 'ivr/ivr-please_hold.wav',                              label: 'Please hold' },
      { path: 'ivr/ivr-please_stay_on_the_line.wav',                  label: 'Please stay on the line' },
      { path: 'ivr/ivr-please_try_again.wav',                         label: 'Please try again' },
      { path: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', label: 'Please enter extension followed by #' },
      { path: 'ivr/ivr-please_enter_the_phone_number.wav',            label: 'Please enter the phone number' },
      { path: 'ivr/ivr-please_choose_from_the_following.wav',         label: 'Please choose from the following' },
      { path: 'ivr/ivr-to_repeat_these_options.wav',                  label: 'To repeat these options' },
      { path: 'ivr/ivr-press_1_for.wav',                              label: 'Press 1 for' },
      { path: 'ivr/ivr-press_2_for.wav',                              label: 'Press 2 for' },
      { path: 'ivr/ivr-press_3_for.wav',                              label: 'Press 3 for' },
      { path: 'ivr/ivr-press_hash_key.wav',                           label: 'Press the # key' },
      { path: 'ivr/ivr-hold.wav',                                     label: 'Hold' },
      { path: 'ivr/ivr-hold_connect_call.wav',                        label: 'Please hold while we connect your call' },
      { path: 'ivr/ivr-please_hold_while_party_contacted.wav',        label: 'Please hold while party is contacted' },
      { path: 'ivr/ivr-menu.wav',                                     label: 'Menu' },
      { path: 'ivr/ivr-menu_options.wav',                             label: 'Menu options' },
      { path: 'ivr/ivr-not_available.wav',                            label: 'Not available' },
      { path: 'ivr/ivr-no_match_trying_again.wav',                    label: 'No match, trying again' },
      { path: 'ivr/ivr-did_not_receive_response.wav',                 label: 'Did not receive a response' },
      { path: 'ivr/ivr-sorry_i_didnt_catch_that.wav',                 label: "Sorry, I didn't catch that" },
      { path: 'ivr/ivr-invalid_extension.wav',                        label: 'Invalid extension' },
      { path: 'ivr/ivr-invalid_number.wav',                           label: 'Invalid number' },
      { path: 'ivr/ivr-bad_extension.wav',                            label: 'Bad extension' },
      { path: 'ivr/ivr-enter_destination_number.wav',                 label: 'Enter destination number' },
      { path: 'ivr/ivr-transfer_prompt.wav',                          label: 'Transfer prompt' },
      { path: 'ivr/ivr-your_call_is_being_placed.wav',                label: 'Your call is being placed' },
      { path: 'ivr/ivr-this_call_may_be_recorded.wav',                label: 'This call may be recorded' },
      { path: 'ivr/ivr-error.wav',                                    label: 'Error' },
      { path: 'ivr/ivr-abort.wav',                                    label: 'Abort' },
      { path: 'ivr/ivr-failover.wav',                                 label: 'Failover' },
      { path: 'ivr/ivr-access_code.wav',                              label: 'Access code' },
      { path: 'ivr/ivr-dial_by_name.wav',                             label: 'Dial by name' },
      { path: 'ivr/ivr-extension_not_in_db.wav',                      label: 'Extension not in database' },
      { path: 'ivr/ivr-dont_know_anyone_by_that_name.wav',            label: "Don't know anyone by that name" },
      { path: 'ivr/ivr-no_callers_are_waiting.wav',                   label: 'No callers are waiting' },
      { path: 'ivr/ivr-you_are_in_queue_number.wav',                  label: 'You are in queue number' },
      { path: 'ivr/ivr-you_have.wav',                                 label: 'You have' },
      { path: 'ivr/ivr-record_message.wav',                           label: 'Record message' },
      { path: 'ivr/ivr-at_the_tone_please_record.wav',                label: 'At the tone please record' },
      { path: 'ivr/ivr-welcome_to_the_voicemail_system.wav',          label: 'Welcome to the voicemail system' },
    ],
  },
  {
    category: 'Voicemail',
    folder: 'voicemail',
    files: [
      { path: 'voicemail/vm-hello.wav',                         label: 'Hello' },
      { path: 'voicemail/vm-not_available.wav',                 label: 'Not available' },
      { path: 'voicemail/vm-dear_caller.wav',                   label: 'Dear caller' },
      { path: 'voicemail/vm-enter_id.wav',                      label: 'Enter ID' },
      { path: 'voicemail/vm-enter_pass.wav',                    label: 'Enter password' },
      { path: 'voicemail/vm-new.wav',                           label: 'New' },
      { path: 'voicemail/vm-message.wav',                       label: 'Message' },
      { path: 'voicemail/vm-messages.wav',                      label: 'Messages' },
      { path: 'voicemail/vm-empty.wav',                         label: 'Empty / no messages' },
      { path: 'voicemail/vm-you_have.wav',                      label: 'You have' },
      { path: 'voicemail/vm-saved.wav',                         label: 'Saved' },
      { path: 'voicemail/vm-deleted.wav',                       label: 'Deleted' },
      { path: 'voicemail/vm-urgent.wav',                        label: 'Urgent' },
      { path: 'voicemail/vm-record_greeting.wav',               label: 'Record greeting' },
      { path: 'voicemail/vm-play_greeting.wav',                 label: 'Play greeting' },
      { path: 'voicemail/vm-greeting_number.wav',               label: 'Greeting number' },
      { path: 'voicemail/vm-choose_greeting.wav',               label: 'Choose greeting' },
      { path: 'voicemail/vm-tutorial.wav',                      label: 'Tutorial' },
      { path: 'voicemail/vm-tutorial_hold.wav',                 label: 'Tutorial hold' },
      { path: 'voicemail/vm-tutorial_record_name.wav',          label: 'Tutorial: record name' },
      { path: 'voicemail/vm-password_needed.wav',               label: 'Password needed' },
      { path: 'voicemail/vm-password_has_been_reset.wav',       label: 'Password has been reset' },
      { path: 'voicemail/vm-access_denied.wav',                 label: 'Access denied' },
      { path: 'voicemail/vm-if_happy_with_recording.wav',       label: 'If happy with recording' },
      { path: 'voicemail/vm-hear_envelope.wav',                 label: 'Hear envelope' },
      { path: 'voicemail/vm-received.wav',                      label: 'Received' },
      { path: 'voicemail/vm-press.wav',                         label: 'Press' },
      { path: 'voicemail/vm-listen_to_recording.wav',           label: 'Listen to recording' },
      { path: 'voicemail/vm-abort.wav',                         label: 'Abort' },
      { path: 'voicemail/vm-sorry_you_are_having_problems.wav', label: 'Sorry you are having problems' },
    ],
  },
  {
    category: 'Digits & Numbers',
    folder: 'digits',
    files: [
      { path: 'digits/0.wav',        label: 'Zero (0)' },
      { path: 'digits/1.wav',        label: 'One (1)' },
      { path: 'digits/2.wav',        label: 'Two (2)' },
      { path: 'digits/3.wav',        label: 'Three (3)' },
      { path: 'digits/4.wav',        label: 'Four (4)' },
      { path: 'digits/5.wav',        label: 'Five (5)' },
      { path: 'digits/6.wav',        label: 'Six (6)' },
      { path: 'digits/7.wav',        label: 'Seven (7)' },
      { path: 'digits/8.wav',        label: 'Eight (8)' },
      { path: 'digits/9.wav',        label: 'Nine (9)' },
      { path: 'digits/star.wav',     label: 'Star (*)' },
      { path: 'digits/pound.wav',    label: 'Pound (#)' },
      { path: 'digits/hundred.wav',  label: 'Hundred' },
      { path: 'digits/thousand.wav', label: 'Thousand' },
      { path: 'digits/million.wav',  label: 'Million' },
    ],
  },
  {
    category: 'Conference',
    folder: 'conference',
    files: [
      { path: 'conference/conf-alone_and_waiting.wav',       label: 'Alone and waiting' },
      { path: 'conference/conf-background-music.wav',        label: 'Background music' },
      { path: 'conference/conf-enter_conf_pin.wav',          label: 'Enter conference PIN' },
      { path: 'conference/conf-has_joined.wav',              label: 'Has joined' },
      { path: 'conference/conf-has_left.wav',                label: 'Has left' },
      { path: 'conference/conf-locked.wav',                  label: 'Locked' },
      { path: 'conference/conf-muted.wav',                   label: 'Muted' },
      { path: 'conference/conf-unmuted.wav',                 label: 'Unmuted' },
      { path: 'conference/conf-members.wav',                 label: 'Members' },
      { path: 'conference/conf-menu.wav',                    label: 'Menu' },
      { path: 'conference/conf-only_1_in_conf.wav',          label: 'Only 1 in conference' },
      { path: 'conference/conf-recording_started.wav',       label: 'Recording started' },
      { path: 'conference/conf-recording_stopped.wav',       label: 'Recording stopped' },
      { path: 'conference/conf-there_are.wav',               label: 'There are' },
      { path: 'conference/conf-you_are_muted.wav',           label: 'You are muted' },
      { path: 'conference/conf-you_are_not_muted.wav',       label: 'You are not muted' },
      { path: 'conference/conf-you_are_the_only_person.wav', label: 'You are the only person' },
    ],
  },
  {
    category: 'Miscellaneous',
    folder: 'misc',
    files: [
      { path: 'misc/transfer.wav',   label: 'Transfer tone' },
      { path: 'misc/hold_music.wav', label: 'Hold music' },
      { path: 'misc/button.wav',     label: 'Button click' },
      { path: 'misc/error.wav',      label: 'Error tone' },
      { path: 'misc/ding.wav',       label: 'Ding' },
      { path: 'misc/ring.wav',       label: 'Ring' },
    ],
  },
  {
    category: 'Music on Hold',
    folder: 'music',
    files: [
      { path: 'music/8000/suite-espanola.wav',      label: 'Suite Española' },
      { path: 'music/8000/danza-espanola-op37.wav', label: 'Danza Española Op.37' },
      { path: 'music/8000/partita-no-3.wav',        label: 'Partita No. 3' },
      { path: 'music/8000/dont-you-wish.wav',       label: "Don't You Wish" },
    ],
  },
];

// ── Operator select options (reused in simple and multi-branch modes) ─────────
// ── Operators ─────────────────────────────────────────────────────────────────
const OPERATORS = [
  { value: 'eq',          label: '== equals'          , short: '=='  },
  { value: 'neq',         label: '!= not equals'      , short: '!='  },
  { value: 'gt',          label: '>  greater than'    , short: '>'   },
  { value: 'lt',          label: '<  less than'        , short: '<'   },
  { value: 'gte',         label: '>= greater or equal', short: '>='  },
  { value: 'lte',         label: '<= less or equal'   , short: '<='  },
  { value: 'contains',    label: '∋  contains'        , short: '∋'   },
  { value: 'not_contains',label: '∌  not contains'    , short: '∌'   },
  { value: 'empty',       label: '∅  is empty'        , short: '∅'   },
  { value: 'not_empty',   label: '≠∅ is not empty'    , short: '≠∅'  },
];
const NO_VALUE_OPS = new Set(['empty', 'not_empty']);

// ── Branch / clause data types ─────────────────────────────────────────────────
interface ConditionClause {
  id:       string;
  variable: string;
  operator: string;
  value:    string;
  join?:    'and' | 'or'; // join with the PREVIOUS clause (undefined for first)
}

interface ConditionBranch {
  id:      string;
  label:   string;
  clauses: ConditionClause[];
  // legacy flat fields (before clauses were added) — kept for backward compat
  operator?: string;
  value?:    string;
}

// Convert a legacy branch (operator/value at branch level) to the new clauses format
function normalizeBranch(b: ConditionBranch, fallbackVariable: string): ConditionBranch {
  if (b.clauses && b.clauses.length > 0) return b;
  return {
    ...b,
    clauses: [{
      id:       `c_${b.id}`,
      variable: fallbackVariable,
      operator: b.operator || 'eq',
      value:    b.value    || '',
    }],
  };
}

// ── Single-branch clause editor (reused for each branch) ─────────────────────
function BranchEditor({
  branch,
  idx,
  onUpdate,
  onRemove,
}: {
  branch:   ConditionBranch;
  idx:      number;
  onUpdate: (b: ConditionBranch) => void;
  onRemove: () => void;
}) {
  const setClauses = (cls: ConditionClause[]) => onUpdate({ ...branch, clauses: cls });

  const addClause = (join: 'and' | 'or') =>
    setClauses([...branch.clauses, { id: `c${Date.now()}`, variable: '', operator: 'eq', value: '', join }]);

  const removeClause = (id: string) => {
    if (branch.clauses.length <= 1) return;
    setClauses(branch.clauses.filter((c) => c.id !== id));
  };

  const updateClause = (id: string, key: string, val: string) =>
    setClauses(branch.clauses.map((c) => (c.id === id ? { ...c, [key]: val } : c)));

  const toggleJoin = (id: string) =>
    setClauses(branch.clauses.map((c) =>
      c.id === id ? { ...c, join: c.join === 'or' ? 'and' : 'or' } : c
    ));

  return (
    <div className="rounded-lg border border-orange-100 bg-orange-50/30 p-2 space-y-1.5">
      {/* Branch header: If / Else-If badge + delete */}
      <div className="flex items-center justify-between">
        <span className={cn(
          'text-[10px] font-bold px-1.5 py-0.5 rounded',
          idx === 0 ? 'bg-orange-500 text-white' : 'bg-amber-100 text-amber-700'
        )}>
          {idx === 0 ? 'If' : `Else If ${idx}`}
        </span>
        <button onClick={onRemove} title="Remove branch" className="text-gray-300 hover:text-red-400 transition-colors">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Clause list */}
      {branch.clauses.map((clause, ci) => (
        <div key={clause.id}>
          {/* AND / OR join toggle (between clauses) */}
          {ci > 0 && (
            <div className="flex items-center gap-1.5 my-1">
              <button
                onClick={() => toggleJoin(clause.id)}
                title="Click to toggle AND / OR"
                className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer',
                  clause.join === 'or'
                    ? 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200'
                    : 'bg-blue-100   text-blue-700   border-blue-300   hover:bg-blue-200'
                )}
              >
                {(clause.join || 'and').toUpperCase()}
              </button>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          )}

          {/* variable + op + value row */}
          <div className="flex items-center gap-1">
            <input
              value={clause.variable}
              onChange={(e) => updateClause(clause.id, 'variable', e.target.value)}
              placeholder="variable"
              title="Variable name (e.g. account_tier)"
              className="border border-gray-200 rounded px-1.5 py-1 text-[11px] font-mono min-w-0 flex-[2] bg-white"
            />
            <select
              value={clause.operator}
              onChange={(e) => updateClause(clause.id, 'operator', e.target.value)}
              className="border border-gray-200 rounded px-0.5 py-1 text-[11px] w-12 bg-white shrink-0"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.short}</option>
              ))}
            </select>
            {!NO_VALUE_OPS.has(clause.operator) && (
              <input
                value={clause.value}
                onChange={(e) => updateClause(clause.id, 'value', e.target.value)}
                placeholder="value"
                className="border border-gray-200 rounded px-1.5 py-1 text-[11px] font-mono min-w-0 flex-[2] bg-white"
              />
            )}
            {branch.clauses.length > 1 && (
              <button onClick={() => removeClause(clause.id)} className="text-gray-200 hover:text-red-400 transition-colors shrink-0">
                <X size={10} />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add AND / OR clause */}
      <div className="flex gap-1 pt-0.5">
        <button
          onClick={() => addClause('and')}
          className="text-[10px] text-blue-600 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50 transition-colors flex items-center gap-0.5"
        >
          <Plus size={9} /> AND
        </button>
        <button
          onClick={() => addClause('or')}
          className="text-[10px] text-purple-600 border border-purple-200 rounded px-2 py-0.5 hover:bg-purple-50 transition-colors flex items-center gap-0.5"
        >
          <Plus size={9} /> OR
        </button>
      </div>

      {/* Output handle label */}
      <div className="flex items-center gap-1.5 pt-1.5 border-t border-orange-100">
        <span className="text-[10px] text-gray-400 shrink-0">→ handle</span>
        <input
          value={branch.label}
          onChange={(e) => onUpdate({ ...branch, label: e.target.value })}
          placeholder="Output label (e.g. VIP Active)"
          className="border border-gray-200 rounded px-1.5 py-1 text-[11px] flex-1 bg-white"
        />
      </div>
    </div>
  );
}

// ── Condition node editor — supports simple if/else and multi if/elseif/else ──
function ConditionEditor({
  data,
  set,
}: {
  data: Record<string, unknown>;
  set:  (k: string, v: unknown) => void;
}) {
  const rawBranches = (data.branches as ConditionBranch[]) || [];
  // Normalize: convert any legacy flat branches to new clauses format
  const branches = rawBranches.map((b) => normalizeBranch(b, String(data.variable || '')));
  const isMulti   = branches.length > 0;

  const setBranches = (next: ConditionBranch[]) => set('branches', next);

  const addBranch = () =>
    setBranches([
      ...branches,
      {
        id:      `b${Date.now()}`,
        label:   '',
        clauses: [{ id: `c${Date.now()}`, variable: String(data.variable || ''), operator: 'eq', value: '' }],
      },
    ]);

  const updateBranch = (b: ConditionBranch) =>
    setBranches(branches.map((x) => (x.id === b.id ? b : x)));

  const removeBranch = (id: string) =>
    setBranches(branches.filter((b) => b.id !== id));

  const switchToMulti = () =>
    setBranches([{
      id:      `b${Date.now()}`,
      label:   String(data.value || 'Branch 1'),
      clauses: [{
        id:       `c${Date.now()}`,
        variable: String(data.variable || ''),
        operator: String(data.operator  || 'eq'),
        value:    String(data.value     || ''),
      }],
    }]);

  const switchToSimple = () => setBranches([]);

  return (
    <>
      {/* Label */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">Label</label>
        <input
          value={String(data.label || '')}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Condition"
          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
        />
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
        <button
          onClick={switchToSimple}
          className={cn(
            'flex-1 py-1.5 transition-colors',
            !isMulti ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
          )}
        >
          If / Else
        </button>
        <button
          onClick={switchToMulti}
          className={cn(
            'flex-1 py-1.5 transition-colors',
            isMulti ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
          )}
        >
          Multi-Branch
        </button>
      </div>

      {!isMulti ? (
        /* ── Simple if / else (single variable, single condition) ── */
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Variable</label>
            <input
              value={String(data.variable || '')}
              onChange={(e) => set('variable', e.target.value)}
              placeholder="e.g. account_type"
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm font-mono"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Operator</label>
            <select
              value={String(data.operator || 'eq')}
              onChange={(e) => set('operator', e.target.value)}
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>
          {!NO_VALUE_OPS.has(String(data.operator || 'eq')) && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Value</label>
              <input
                value={String(data.value || '')}
                onChange={(e) => set('value', e.target.value)}
                placeholder="e.g. premium"
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm font-mono"
              />
            </div>
          )}
          <p className="text-[10px] text-gray-400 bg-gray-50 rounded px-2 py-1">
            Outputs: <span className="font-semibold text-green-600">true</span> / <span className="font-semibold text-red-500">false</span>
          </p>
        </>
      ) : (
        /* ── Multi-branch: each branch has AND/OR clauses ── */
        <div className="space-y-2">
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Each branch can check <span className="font-semibold text-blue-600">multiple variables</span> joined by{' '}
            <span className="font-semibold text-blue-600">AND</span> /{' '}
            <span className="font-semibold text-purple-600">OR</span>.
            Click the AND/OR badge to toggle.
          </p>

          {branches.map((branch, idx) => (
            <BranchEditor
              key={branch.id}
              branch={branch}
              idx={idx}
              onUpdate={updateBranch}
              onRemove={() => removeBranch(branch.id)}
            />
          ))}

          {/* Else (always present) */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">Else</span>
            <span className="text-[10px] text-gray-400">default — fires when no branch matches</span>
          </div>

          <button
            onClick={addBranch}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-orange-600 border border-dashed border-orange-300 rounded-md py-1.5 hover:bg-orange-50 transition-colors"
          >
            <Plus size={12} /> Add Else-If Branch
          </button>
        </div>
      )}
    </>
  );
}

export function NodeConfigPanel() {
  const { nodes, selectedNodeId, setSelectedNodeId, updateNodeData, selectedDomain } = useFlowStore();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) return null;

  return (
    <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-sm text-gray-800 capitalize">
          {node.type?.replace(/_/g, ' ')} Config
        </h3>
        <button onClick={() => setSelectedNodeId(null)} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <NodeConfigForm
          node={node}
          domainUuid={selectedDomain?.domain_uuid}
          onChange={(data) => updateNodeData(node.id, data)}
        />
      </div>
    </div>
  );
}

// ── Main Form Router ──────────────────────────────────────────────────────────
function NodeConfigForm({
  node,
  domainUuid,
  onChange,
}: {
  node: { type?: string; data: Record<string, unknown> };
  domainUuid?: string;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(node.data || {});

  useEffect(() => { setData(node.data || {}); }, [node.data]);

  const set = useCallback((key: string, value: unknown) => {
    setData((prev) => {
      const next = { ...prev, [key]: value };
      onChange(next);
      return next;
    });
  }, [onChange]);

  const field = (label: string, key: string, type = 'text', placeholder = '') => (
    <Field key={key} label={label}>
      <input
        type={type}
        value={String(data[key] ?? '')}
        placeholder={placeholder}
        onChange={(e) => set(key, type === 'number' ? Number(e.target.value) : e.target.value)}
        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </Field>
  );

  switch (node.type) {
    case 'play_audio':
      return <>
        {field('Label', 'label', 'text', 'Play Audio')}
        <Field label="Audio File">
          <div className="flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <AudioFilePicker
                domainUuid={domainUuid}
                value={String(data.file || '')}
                onChange={(v) => set('file', v)}
              />
            </div>
            <AudioPlayButton
              path={String(data.file || '')}
              domainUuid={domainUuid}
              title="Play audio"
            />
          </div>
        </Field>
        {field('Dynamic File Variable', 'file_var', 'text', 'e.g. greeting_file')}
      </>;

    case 'get_digits':
      return <>
        {field('Label', 'label', 'text', 'Get Digits')}
        <Field label="Welcome Audio">
          <div className="flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <AudioFilePicker
                domainUuid={domainUuid}
                value={String(data.welcome_audio || '')}
                onChange={(v) => set('welcome_audio', v)}
              />
            </div>
            <AudioPlayButton path={String(data.welcome_audio || '')} domainUuid={domainUuid} title="Play welcome" />
          </div>
        </Field>
        <Field label="Prompt Audio">
          <div className="flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <AudioFilePicker
                domainUuid={domainUuid}
                value={String(data.prompt_file || '')}
                onChange={(v) => set('prompt_file', v)}
              />
            </div>
            <AudioPlayButton path={String(data.prompt_file || '')} domainUuid={domainUuid} title="Play prompt" />
          </div>
        </Field>
        <Field label="No Input Audio">
          <div className="flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <AudioFilePicker
                domainUuid={domainUuid}
                value={String(data.no_input_audio || data.invalid_audio || '')}
                onChange={(v) => set('no_input_audio', v)}
              />
            </div>
            <AudioPlayButton path={String(data.no_input_audio || data.invalid_audio || '')} domainUuid={domainUuid} title="Play no input" />
          </div>
        </Field>
        <Field label="Timed Out Audio">
          <div className="flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <AudioFilePicker
                domainUuid={domainUuid}
                value={String(data.timed_out_audio || '')}
                onChange={(v) => set('timed_out_audio', v)}
              />
            </div>
            <AudioPlayButton path={String(data.timed_out_audio || '')} domainUuid={domainUuid} title="Play timed out" />
          </div>
        </Field>
        {field('Min Digits', 'min_digits', 'number')}
        {field('Max Digits', 'max_digits', 'number')}
        {field('Timeout (ms)', 'timeout_ms', 'number')}
        {field('Retries', 'retries', 'number')}
        <Field label="Valid Digits (outputs)">
          <ValidDigitsEditor
            value={(data.valid_digits as string[]) || ['1', '2']}
            onChange={(v) => set('valid_digits', v)}
          />
        </Field>
      </>;

    case 'transfer':
      return <>
        {field('Label', 'label', 'text', 'Transfer')}
        <Field label="Destination">
          <DestinationPicker
            domainUuid={domainUuid}
            value={String(data.destination || '')}
            onChange={(v) => set('destination', v)}
          />
        </Field>
        <Field label="Transfer Type">
          <select
            value={String(data.transfer_type || 'blind')}
            onChange={(e) => set('transfer_type', e.target.value)}
            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="blind">Blind</option>
            <option value="att">Attended</option>
          </select>
        </Field>
        {field('Context (optional)', 'context', 'text', 'default')}
      </>;

    case 'voicemail':
      return <>
        {field('Label', 'label', 'text', 'Voicemail')}
        <Field label="Mailbox">
          <DestinationPicker
            domainUuid={domainUuid}
            value={String(data.mailbox_id || '')}
            onChange={(v) => set('mailbox_id', v)}
            filterType="voicemail"
            placeholder="{{dnis}} or 1001"
          />
        </Field>
      </>;

    case 'condition':
      return <ConditionEditor data={data} set={set} />;

    case 'time_condition':
      return <>
        {field('Label', 'label', 'text', 'Time Condition')}
        <Field label="Open Time">
          <input type="time"
            value={String((data.schedule as Record<string, string> | undefined)?.open || '09:00')}
            onChange={(e) => set('schedule', { ...(data.schedule as object || {}), open: e.target.value })}
            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Close Time">
          <input type="time"
            value={String((data.schedule as Record<string, string> | undefined)?.close || '17:00')}
            onChange={(e) => set('schedule', { ...(data.schedule as object || {}), close: e.target.value })}
            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Days">
          <select
            value={String((data.schedule as Record<string, string> | undefined)?.days || 'mon-fri')}
            onChange={(e) => set('schedule', { ...(data.schedule as object || {}), days: e.target.value })}
            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="mon-fri">Monday – Friday</option>
            <option value="mon-sat">Monday – Saturday</option>
            <option value="all">Every Day</option>
          </select>
        </Field>
      </>;

    case 'api_call':
      return <ApiCallConfig data={data} set={set} />;

    case 'hangup':
      return <>
        {field('Label', 'label', 'text', 'Hangup')}
        <Field label="Cause Code">
          <select
            value={String(data.cause || 'NORMAL_CLEARING')}
            onChange={(e) => set('cause', e.target.value)}
            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="NORMAL_CLEARING">NORMAL_CLEARING</option>
            <option value="USER_BUSY">USER_BUSY</option>
            <option value="NO_ANSWER">NO_ANSWER</option>
            <option value="UNALLOCATED_NUMBER">UNALLOCATED_NUMBER</option>
          </select>
        </Field>
      </>;

    case 'set_variable':
      return <>
        {field('Label', 'label', 'text', 'Set Variable')}
        {field('Variable Name', 'key', 'text', 'my_variable')}
        {field('Value', 'value', 'text', 'static value or {{other_var}}')}
      </>;

    default:
      return <p className="text-sm text-gray-400">No config for this node type</p>;
  }
}

// ── Audio File Picker ─────────────────────────────────────────────────────────
// Built-in FreeSWITCH sounds are always shown from the static BUILTIN_SOUNDS
// Play button for selected audio path (used in Get Digits config for confirmation)
function AudioPlayButton({
  path,
  domainUuid,
  title = 'Play',
}: {
  path: string;
  domainUuid?: string;
  title?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const toggle = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    if (!path.trim()) return;
    const url = `/api/assets/sounds/stream?path=${encodeURIComponent(path.trim())}`
      + (domainUuid ? `&domainUuid=${encodeURIComponent(domainUuid)}` : '');
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => setPlaying(false));
    audio.onended = () => { setPlaying(false); audioRef.current = null; };
    audio.onerror = () => { setPlaying(false); audioRef.current = null; };
    setPlaying(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!path.trim()}
      title={title}
      className={cn(
        'shrink-0 p-2 rounded-lg border transition-colors',
        path.trim()
          ? 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-indigo-600 hover:border-indigo-300'
          : 'border-gray-100 text-gray-300 cursor-not-allowed'
      )}
    >
      {playing ? <Square size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
    </button>
  );
}

// catalog.  Custom recordings are fetched from the server and prepended at the
// top.  The search box filters what is already visible — no searching required
// to see the list.
function AudioFilePicker({
  domainUuid,
  value,
  onChange,
}: {
  domainUuid?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // Start with the static built-in list so files are visible immediately
  const [categories, setCategories] = useState<SoundCategory[]>(BUILTIN_SOUNDS);
  const [loadingRec, setLoadingRec] = useState(false);
  const [open, setOpen]             = useState(false);
  const [search, setSearch]         = useState('');
  const [mode, setMode]             = useState<'browse' | 'manual'>('browse');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  // Fetch custom recordings from the server and prepend as a "Custom Recordings" group
  const loadRecordings = useCallback(() => {
    if (!domainUuid) return;
    setLoadingRec(true);
    getRecordings(domainUuid)
      .then((recs) => {
        if (recs.length === 0) {
          // No custom recordings — just show built-ins
          setCategories(BUILTIN_SOUNDS);
          return;
        }
        const customCat: SoundCategory = {
          category: 'Custom Recordings',
          folder: 'recordings',
          files: recs.map((r) => ({
            path: r.recording_filename,
            label: r.recording_name || r.recording_filename,
          })),
        };
        setCategories([customCat, ...BUILTIN_SOUNDS]);
      })
      .catch(() => {
        // API unavailable — keep showing built-ins only
        setCategories(BUILTIN_SOUNDS);
      })
      .finally(() => setLoadingRec(false));
  }, [domainUuid]);

  useEffect(() => { loadRecordings(); }, [loadRecordings]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 40);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Position the dropdown anchored to the trigger button using fixed coords
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow >= 200) {
        setDropStyle({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      } else {
        setDropStyle({ bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right });
      }
    }
    setOpen((v) => !v);
    setSearch('');
  };

  // Filtered list — search works across all categories simultaneously
  const q = search.trim().toLowerCase();
  const visibleCategories: SoundCategory[] = q
    ? categories
        .map((cat) => ({
          ...cat,
          files: cat.files.filter(
            (f) => f.label.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
          ),
        }))
        .filter((cat) => cat.files.length > 0)
    : categories;

  const totalVisible = visibleCategories.reduce((n, c) => n + c.files.length, 0);

  const pick = (file: SoundFile) => {
    onChange(file.path);
    setOpen(false);
    setSearch('');
  };

  // Resolve the friendly label for the currently selected path
  const currentLabel = (() => {
    for (const cat of categories) {
      const f = cat.files.find((f) => f.path === value);
      if (f) return f.label;
    }
    return value || null;
  })();

  return (
    <div className="space-y-1.5">
      {/* ── Mode toggle ─────────────────────────────────────────── */}
      <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit">
        {(['browse', 'manual'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={cn('text-[11px] px-2.5 py-0.5 rounded-md font-medium transition-colors',
              mode === m ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
            )}>
            {m === 'browse' ? 'Browse' : 'Type Path'}
          </button>
        ))}
      </div>

      {mode === 'browse' ? (
        <>
          {/* ── Trigger (dropdown button) ─────────────────────── */}
          <button
            ref={triggerRef}
            onClick={openDropdown}
            className={cn(
              'w-full flex items-center gap-2 border rounded-md px-2.5 py-1.5 text-sm bg-white text-left transition-colors',
              open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-200 hover:border-indigo-300'
            )}
          >
            <Music size={13} className="text-gray-400 shrink-0" />
            <span className={cn('flex-1 truncate', currentLabel ? 'text-gray-800' : 'text-gray-400')}>
              {currentLabel || '— select audio file —'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {loadingRec && <RefreshCw size={11} className="animate-spin text-gray-400" />}
              <ChevronDown size={13} className={cn('text-gray-400 transition-transform', open && 'rotate-180')} />
            </div>
          </button>

          {/* ── Dropdown popup ──────────────────────────────────── */}
          {open && (
            <div
              ref={dropRef}
              className="fixed z-[9999] w-[340px] bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
              style={{ ...dropStyle, maxHeight: 'min(460px, 70vh)' }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0 bg-gray-50">
                <Music size={13} className="text-indigo-500" />
                <span className="text-xs font-semibold text-gray-700 flex-1">Select Audio File</span>
                <span className="text-[10px] text-gray-400">{totalVisible} file{totalVisible !== 1 ? 's' : ''}</span>
                <button onClick={() => { loadRecordings(); }}
                  title="Refresh custom recordings"
                  className="text-gray-300 hover:text-indigo-500 ml-1">
                  <RefreshCw size={11} className={loadingRec ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => { setOpen(false); setSearch(''); }}
                  className="text-gray-400 hover:text-gray-600 ml-1">
                  <X size={13} />
                </button>
              </div>

              {/* Search box — filters the already-visible list */}
              <div className="px-3 py-2 border-b border-gray-100 shrink-0">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-[7px] text-gray-400 pointer-events-none" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search all sounds…"
                    className="w-full border border-gray-200 rounded-md pl-7 pr-7 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  {search && (
                    <button onClick={() => setSearch('')}
                      className="absolute right-2 top-[7px] text-gray-400 hover:text-gray-600">
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* ── Scrollable grouped file list ──────────────── */}
              <div className="flex-1 overflow-y-auto">
                {visibleCategories.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400">
                    No sounds match "<span className="font-medium">{search}</span>"
                  </div>
                ) : (
                  visibleCategories.map((cat) => (
                    <div key={cat.category}>
                      {/* Sticky category header */}
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-y border-gray-100 sticky top-0 z-10">
                        <FolderOpen size={11} className="text-indigo-400 shrink-0" />
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide flex-1">
                          {cat.category}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {cat.files.length}
                        </span>
                      </div>

                      {/* Files in this category */}
                      {cat.files.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => pick(file)}
                          className={cn(
                            'w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors',
                            value === file.path
                              ? 'bg-indigo-50 border-l-[3px] border-l-indigo-500'
                              : 'border-l-[3px] border-l-transparent border-b border-b-gray-50'
                          )}
                        >
                          <p className="text-xs font-medium text-gray-800 truncate leading-tight">
                            {file.label}
                          </p>
                          <p className="text-[10px] text-gray-400 font-mono truncate leading-tight mt-0.5">
                            {file.path}
                          </p>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>

              {/* Footer — shows currently selected file */}
              {value && (
                <div className="px-3 py-1.5 border-t border-gray-100 bg-indigo-50 shrink-0">
                  <p className="text-[10px] text-indigo-600 font-mono truncate">▶ {value}</p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Manual path input */
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ivr/ivr-welcome.wav"
          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      )}

      {/* Current value pill */}
      {value && (
        <p className="text-[10px] text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded truncate">
          ▶ {value}
        </p>
      )}
    </div>
  );
}

// ── Destination Picker ────────────────────────────────────────────────────────
function DestinationPicker({
  domainUuid,
  value,
  onChange,
  filterType,
  placeholder = '1001 or {{variable}}',
}: {
  domainUuid?: string;
  value: string;
  onChange: (v: string) => void;
  filterType?: string;
  placeholder?: string;
}) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'pick' | 'manual'>('pick');

  const load = useCallback(() => {
    if (!domainUuid) return;
    setLoading(true);
    getDestinations(domainUuid)
      .then((all) => setDestinations(filterType ? all.filter((d) => d.type === filterType) : all))
      .finally(() => setLoading(false));
  }, [domainUuid, filterType]);

  useEffect(() => { load(); }, [load]);

  // Group by type
  const groups = destinations.reduce<Record<string, Destination[]>>((acc, d) => {
    (acc[d.group] = acc[d.group] || []).push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit">
        {(['pick', 'manual'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={cn('text-[11px] px-2.5 py-0.5 rounded-md font-medium transition-colors',
              mode === m ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
            )}>
            {m === 'pick' ? 'From Server' : 'Type Number'}
          </button>
        ))}
      </div>

      {mode === 'pick' ? (
        <div className="relative">
          <Phone size={13} className="absolute left-2.5 top-2 text-gray-400 pointer-events-none" />
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full border border-gray-200 rounded-md pl-7 pr-7 py-1.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">— select destination —</option>
            {Object.entries(groups).map(([grp, items]) => (
              <optgroup key={grp} label={grp}>
                {items.map((d) => (
                  <option key={`${d.type}-${d.destination}`} value={d.destination}>
                    {d.destination} — {d.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-2 text-gray-400 pointer-events-none" />
          <button onClick={load} title="Refresh"
            className="absolute right-7 top-1.5 text-gray-300 hover:text-indigo-500">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          {destinations.length === 0 && !loading && (
            <p className="text-[10px] text-gray-400 mt-1">
              No destinations found.{' '}
              <button onClick={() => setMode('manual')} className="text-indigo-500 underline">Enter manually</button>.
            </p>
          )}
        </div>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      )}

      {value && (
        <p className="text-[10px] text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded truncate">
          ➜ {value}
        </p>
      )}
    </div>
  );
}

// ── API Call Config ───────────────────────────────────────────────────────────
function ApiCallConfig({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const responseMap = (data.response_map as Array<{ json_path: string; variable: string }>) || [];
  const headers = (data.headers as Record<string, string>) || {};

  return <>
    <Field label="Label">
      <input value={String(data.label || '')} onChange={(e) => set('label', e.target.value)}
        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" placeholder="API Call" />
    </Field>
    <Field label="URL">
      <input value={String(data.url || '')} onChange={(e) => set('url', e.target.value)}
        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm font-mono text-xs"
        placeholder="https://api.example.com/endpoint" />
    </Field>
    <Field label="Method">
      <select value={String(data.method || 'GET')} onChange={(e) => set('method', e.target.value)}
        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm">
        {['GET','POST','PUT','DELETE'].map((m) => <option key={m}>{m}</option>)}
      </select>
    </Field>
    <Field label="Timeout (ms)">
      <input type="number" value={Number(data.timeout_ms || 3000)}
        onChange={(e) => set('timeout_ms', Number(e.target.value))}
        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" />
    </Field>
    <Field label="Headers">
      <div className="space-y-1">
        {Object.entries(headers).map(([k, v]) => (
          <div key={k} className="flex gap-1 items-center">
            <input value={k} readOnly className="w-1/3 border rounded px-1 py-1 text-xs bg-gray-50" />
            <input value={v} readOnly className="flex-1 border rounded px-1 py-1 text-xs font-mono" />
            <button onClick={() => { const next = { ...headers }; delete next[k]; set('headers', next); }}
              className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
          </div>
        ))}
        <HeaderAdder onAdd={(k, v) => set('headers', { ...headers, [k]: v })} />
      </div>
    </Field>
    <Field label="Response Map">
      <div className="space-y-1">
        {responseMap.map((m, i) => (
          <div key={i} className="flex gap-1 items-center">
            <input value={m.json_path} placeholder="$.field" onChange={(e) => {
              const next = [...responseMap]; next[i] = { ...m, json_path: e.target.value }; set('response_map', next);
            }} className="w-1/2 border rounded px-1 py-1 text-xs font-mono" />
            <span className="text-gray-400 text-xs">→</span>
            <input value={m.variable} placeholder="var_name" onChange={(e) => {
              const next = [...responseMap]; next[i] = { ...m, variable: e.target.value }; set('response_map', next);
            }} className="flex-1 border rounded px-1 py-1 text-xs" />
            <button onClick={() => set('response_map', responseMap.filter((_, j) => j !== i))}
              className="text-red-400"><Trash2 size={12} /></button>
          </div>
        ))}
        <button onClick={() => set('response_map', [...responseMap, { json_path: '', variable: '' }])}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
          <Plus size={12} /> Add mapping
        </button>
      </div>
    </Field>
  </>;
}

// ── Small sub-components ─────────────────────────────────────────────────────
function HeaderAdder({ onAdd }: { onAdd: (k: string, v: string) => void }) {
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  return (
    <div className="flex gap-1 items-center mt-1">
      <input value={k} onChange={(e) => setK(e.target.value)} placeholder="Header" className="w-1/3 border rounded px-1 py-1 text-xs" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Value" className="flex-1 border rounded px-1 py-1 text-xs font-mono" />
      <button onClick={() => { if (k && v) { onAdd(k, v); setK(''); setV(''); } }}
        className="text-indigo-500 hover:text-indigo-700"><Plus size={12} /></button>
    </div>
  );
}

function ValidDigitsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const all = ['1','2','3','4','5','6','7','8','9','0','*','#'];
  return (
    <div className="flex flex-wrap gap-1">
      {all.map((d) => (
        <button key={d} onClick={() => {
          const next = value.includes(d) ? value.filter((x) => x !== d) : [...value, d];
          onChange(next);
        }}
          className={cn('w-7 h-7 rounded border text-xs font-mono',
            value.includes(d) ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-300'
          )}>
          {d}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
