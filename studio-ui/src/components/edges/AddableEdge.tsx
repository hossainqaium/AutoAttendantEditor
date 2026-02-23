// =============================================================================
// AddableEdge — ReactFlow custom edge that shows a "+" button at its midpoint.
// Clicking "+" opens a node-type picker; selecting a type splits the edge and
// inserts a new node in-between the source and target.
// =============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from 'reactflow';
import {
  Volume2, Hash, PhoneForwarded, Voicemail,
  GitBranch, Clock, Globe, PhoneOff, Variable, Plus,
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { generateNodeId } from '../../lib/utils';

// ── Node types that can be inserted mid-edge ─────────────────────────────────
const INSERTABLE = [
  { type: 'play_audio',     label: 'Play Audio',    icon: <Volume2 size={12}/>,        color: 'bg-emerald-500 text-white' },
  { type: 'get_digits',     label: 'Get Digits',    icon: <Hash size={12}/>,           color: 'bg-violet-500 text-white'  },
  { type: 'condition',      label: 'Condition',     icon: <GitBranch size={12}/>,      color: 'bg-orange-500 text-white'  },
  { type: 'api_call',       label: 'API Call',      icon: <Globe size={12}/>,          color: 'bg-indigo-500 text-white'  },
  { type: 'set_variable',   label: 'Set Variable',  icon: <Variable size={12}/>,       color: 'bg-gray-600 text-white'    },
  { type: 'time_condition', label: 'Time Check',    icon: <Clock size={12}/>,          color: 'bg-teal-500 text-white'    },
  { type: 'transfer',       label: 'Transfer',      icon: <PhoneForwarded size={12}/>, color: 'bg-sky-500 text-white'     },
  { type: 'voicemail',      label: 'Voicemail',     icon: <Voicemail size={12}/>,      color: 'bg-amber-500 text-white'   },
  { type: 'hangup',         label: 'Hangup',        icon: <PhoneOff size={12}/>,       color: 'bg-red-500 text-white'     },
];

// Default data for freshly-inserted nodes
const NODE_DEFAULTS: Record<string, Record<string, unknown>> = {
  play_audio:     { label: 'Play Audio',     file: '' },
  get_digits:     { label: 'Get Digits',     max_digits: 1, timeout_ms: 5000, retries: 3, valid_digits: ['1','2'] },
  transfer:       { label: 'Transfer',       destination: '', transfer_type: 'blind' },
  voicemail:      { label: 'Voicemail',      mailbox_id: '{{dnis}}' },
  condition:      { label: 'Condition',      variable: '', operator: 'eq', value: '' },
  time_condition: { label: 'Time Condition', schedule: { open: '09:00', close: '17:00' } },
  api_call:       { label: 'API Call',       url: '', method: 'GET', timeout_ms: 3000, headers: {}, response_map: [] },
  set_variable:   { label: 'Set Variable',   key: '', value: '' },
  hangup:         { label: 'Hangup',         cause: 'NORMAL_CLEARING' },
};

// Which source-handle the inserted node will use for its outgoing edge
const DEFAULT_OUT_HANDLE: Record<string, string> = {
  condition:      'true',
  time_condition: 'open',
  api_call:       'success',
};

// ── Component ─────────────────────────────────────────────────────────────────
export function AddableEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  markerEnd, style,
  selected,
  source, target,
  sourceHandleId,
}: EdgeProps) {
  const sourceHandle = sourceHandleId ?? undefined;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const [hovered, setHovered]       = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const { nodes, edges, setNodes, setEdges, pushHistory, setIsDirty } = useFlowStore();

  // Close picker on outside-click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const handleInsert = useCallback((nodeType: string) => {
    setShowPicker(false);
    pushHistory();

    const newId  = generateNodeId();
    const newPos = { x: Math.round(labelX - 90), y: Math.round(labelY - 40) };
    const outHandle = DEFAULT_OUT_HANDLE[nodeType];

    setNodes([...nodes, {
      id:       newId,
      type:     nodeType,
      position: newPos,
      data:     { ...(NODE_DEFAULTS[nodeType] || { label: nodeType }) },
    }]);

    setEdges([
      ...edges.filter((e) => e.id !== id),
      // Original source → new node
      {
        id:           `e_${newId}_in`,
        source,
        target:       newId,
        sourceHandle: sourceHandle ?? undefined,
        style:        { stroke: '#6366f1', strokeWidth: 2 },
      },
      // New node → original target
      {
        id:           `e_${newId}_out`,
        source:       newId,
        target,
        sourceHandle: outHandle,
        style:        { stroke: '#6366f1', strokeWidth: 2 },
      },
    ]);

    setIsDirty(true);
  }, [id, source, target, sourceHandle, labelX, labelY, nodes, edges,
      setNodes, setEdges, pushHistory, setIsDirty]);

  const visible = selected || hovered || showPicker;

  return (
    <>
      {/* Actual edge line */}
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />

      {/* Wide invisible path for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
      />

      {/* Label area: "+" button + picker */}
      <EdgeLabelRenderer>
        <div
          style={{
            position:  'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 200,
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => !showPicker && setHovered(false)}
        >
          {/* "+" trigger button */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v); }}
            title="Insert a node here"
            className={[
              'w-5 h-5 rounded-full border-2 flex items-center justify-center shadow-md transition-all duration-150',
              visible
                ? 'opacity-100 bg-indigo-500 border-indigo-500 text-white scale-110'
                : 'opacity-0 bg-white border-indigo-300 text-indigo-500',
              'hover:opacity-100 hover:bg-indigo-500 hover:border-indigo-500 hover:text-white hover:scale-110',
            ].join(' ')}
          >
            <Plus size={10} strokeWidth={3} />
          </button>

          {/* Picker dropdown */}
          {showPicker && (
            <div
              ref={pickerRef}
              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-44 bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden"
              style={{ zIndex: 9999 }}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Insert node
                </span>
                <button
                  onClick={() => setShowPicker(false)}
                  className="text-gray-400 hover:text-gray-600 text-base leading-none"
                >
                  ×
                </button>
              </div>
              <div className="py-1 max-h-64 overflow-y-auto">
                {INSERTABLE.map((n) => (
                  <button
                    key={n.type}
                    onClick={() => handleInsert(n.type)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 flex items-center gap-2.5 transition-colors group"
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${n.color}`}>
                      {n.icon}
                    </span>
                    <span className="text-gray-700 group-hover:text-indigo-700 font-medium">
                      {n.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
