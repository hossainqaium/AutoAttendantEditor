// =============================================================================
// IVR Studio: Main Flow Editor Canvas (ReactFlow)
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  updateEdge,
  type ReactFlowInstance,
  type Edge,
  type Connection,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  Volume2, Hash, PhoneForwarded, Voicemail,
  GitBranch, Clock, Globe, PhoneOff, Variable,
  Trash2, Undo2, Redo2, AlertTriangle,
} from 'lucide-react';

import { useFlowStore } from '../store/flowStore';
import { nodeTypes } from './nodes';
import { NodeConfigPanel } from './panels/NodeConfigPanel';
import { AddableEdge } from './edges/AddableEdge';
import { generateNodeId } from '../lib/utils';
import { cn } from '../lib/utils';

const edgeTypes = { default: AddableEdge };

// ─── Node palette ─────────────────────────────────────────────────────────────
const NODE_PALETTE = [
  { type: 'play_audio',     label: 'Play Audio',     color: 'bg-emerald-500', icon: <Volume2        size={14}/> },
  { type: 'get_digits',     label: 'Get Digits',     color: 'bg-violet-500',  icon: <Hash           size={14}/> },
  { type: 'transfer',       label: 'Transfer',       color: 'bg-sky-500',     icon: <PhoneForwarded size={14}/> },
  { type: 'voicemail',      label: 'Voicemail',      color: 'bg-amber-500',   icon: <Voicemail      size={14}/> },
  { type: 'condition',      label: 'Condition',      color: 'bg-orange-500',  icon: <GitBranch      size={14}/> },
  { type: 'time_condition', label: 'Time Condition', color: 'bg-teal-500',    icon: <Clock          size={14}/> },
  { type: 'api_call',       label: 'API Call',       color: 'bg-indigo-500',  icon: <Globe          size={14}/> },
  { type: 'set_variable',   label: 'Set Variable',   color: 'bg-gray-600',    icon: <Variable       size={14}/> },
  { type: 'hangup',         label: 'Hangup',         color: 'bg-red-500',     icon: <PhoneOff       size={14}/> },
];

const DEFAULT_NODE_DATA: Record<string, Record<string, unknown>> = {
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

const EDGE_DEFAULT  = { stroke: '#6366f1', strokeWidth: 2 };
const EDGE_SELECTED = { stroke: '#f59e0b', strokeWidth: 3 };
const EDGE_HOVERED  = { stroke: '#f97316', strokeWidth: 3 };   // orange-500 — handle hover

// ─── Confirmation dialog ──────────────────────────────────────────────────────
interface ConfirmState {
  title:   string;
  message: string;
  onConfirm: () => void;
}

function ConfirmDialog({
  state,
  onCancel,
}: {
  state:    ConfirmState;
  onCancel: () => void;
}) {
  return (
    /* backdrop */
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-red-100 shrink-0">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800">{state.title}</h3>
        </div>
        {/* Body */}
        <p className="px-5 py-4 text-sm text-gray-600 leading-relaxed">{state.message}</p>
        {/* Actions */}
        <div className="flex gap-2 px-5 pb-4 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { state.onConfirm(); onCancel(); }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────
export function FlowEditor() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    setSelectedNodeId, selectedNodeId,
    setNodes, setEdges, setIsDirty,
    isDirty,
    pushHistory, undo, redo,
    history, future,
    hoveredHandle,
  } = useFlowStore();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const rfInstance       = useRef<ReactFlowInstance | null>(null);
  const edgeUpdateOk     = useRef(true);

  // ── Confirmation dialog ─────────────────────────────────────────────────
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const clearConfirm = useCallback(() => setConfirm(null), []);

  // ── Node / pane click ───────────────────────────────────────────────────
  const onNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  // ── Drag-and-drop from palette ──────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow-type');
    if (!type || !rfInstance.current || !reactFlowWrapper.current) return;
    const bounds   = reactFlowWrapper.current.getBoundingClientRect();
    const position = rfInstance.current.screenToFlowPosition({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    });
    addNodeOfType(type, position);
  }, [nodes, setNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Double-click palette → add at viewport centre ───────────────────────
  const onDoubleClickPaletteItem = useCallback((type: string) => {
    if (!rfInstance.current || !reactFlowWrapper.current) return;
    const bounds   = reactFlowWrapper.current.getBoundingClientRect();
    const position = rfInstance.current.screenToFlowPosition({
      x: bounds.left + bounds.width  / 2,
      y: bounds.top  + bounds.height / 2,
    });
    addNodeOfType(type, {
      x: position.x + Math.round(Math.random() * 40 - 20),
      y: position.y + Math.round(Math.random() * 40 - 20),
    });
  }, [nodes, setNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNodeOfType = useCallback((type: string, position: { x: number; y: number }) => {
    pushHistory();
    const newNode = {
      id:   generateNodeId(),
      type,
      position,
      data: { ...(DEFAULT_NODE_DATA[type] || { label: type }) },
    };
    setNodes([...nodes, newNode]);
    setIsDirty(true);
  }, [nodes, setNodes, setIsDirty, pushHistory]);

  // ── Build delete description ────────────────────────────────────────────
  const buildDeleteDescription = useCallback(() => {
    const selNodes = nodes.filter(n => n.selected || n.id === selectedNodeId);
    const selEdges = edges.filter(e => e.selected);

    if (selNodes.length > 0) {
      const names = selNodes
        .map(n => String(n.data?.label || n.type || 'Node'))
        .join(', ');
      const connectedEdges = edges.filter(
        e => selNodes.some(n => e.source === n.id || e.target === n.id)
      );
      const edgeNote = connectedEdges.length > 0
        ? ` and ${connectedEdges.length} connected connection${connectedEdges.length > 1 ? 's' : ''}`
        : '';
      return {
        title:   selNodes.length === 1 ? 'Delete Node?' : `Delete ${selNodes.length} Nodes?`,
        message: `Remove "${names}"${edgeNote}? This cannot be undone without using Undo.`,
        nodeIds: selNodes.map(n => n.id),
        edgeIds: [] as string[],
      };
    }
    if (selEdges.length > 0) {
      return {
        title:   selEdges.length === 1 ? 'Delete Connection?' : `Delete ${selEdges.length} Connections?`,
        message: `Remove the selected connection${selEdges.length > 1 ? 's' : ''}? This cannot be undone without using Undo.`,
        nodeIds: [] as string[],
        edgeIds: selEdges.map(e => e.id),
      };
    }
    return null;
  }, [nodes, edges, selectedNodeId]);

  // ── Actual deletion (called after confirmation) ─────────────────────────
  const performDelete = useCallback((nodeIds: string[], edgeIds: string[]) => {
    pushHistory();
    if (nodeIds.length > 0) {
      setNodes(nodes.filter(n => !nodeIds.includes(n.id)));
      setEdges(edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target)));
      setSelectedNodeId(null);
    } else if (edgeIds.length > 0) {
      setEdges(edges.filter(e => !edgeIds.includes(e.id)));
    }
    setIsDirty(true);
  }, [nodes, edges, pushHistory, setNodes, setEdges, setSelectedNodeId, setIsDirty]);

  // ── Request deletion with confirmation ──────────────────────────────────
  const requestDelete = useCallback(() => {
    const desc = buildDeleteDescription();
    if (!desc) return;
    setConfirm({
      title:   desc.title,
      message: desc.message,
      onConfirm: () => performDelete(desc.nodeIds, desc.edgeIds),
    });
  }, [buildDeleteDescription, performDelete]);

  const hasSelection = (selectedNodeId != null) ||
    nodes.some(n => n.selected) ||
    edges.some(e => e.selected);

  // ── Edge reconnect ──────────────────────────────────────────────────────
  const onEdgeUpdateStart = useCallback(() => { edgeUpdateOk.current = false; }, []);

  const onEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    edgeUpdateOk.current = true;
    pushHistory();
    setEdges(updateEdge(oldEdge, newConnection, edges));
    setIsDirty(true);
  }, [edges, setEdges, setIsDirty, pushHistory]);

  const onEdgeUpdateEnd = useCallback((_: unknown, edge: Edge) => {
    if (!edgeUpdateOk.current) {
      // dropped in empty space — silently remove dangling edge (no confirm needed)
      pushHistory();
      setEdges(edges.filter(e => e.id !== edge.id));
      setIsDirty(true);
    }
    edgeUpdateOk.current = true;
  }, [edges, setEdges, setIsDirty, pushHistory]);

  // ── Keyboard shortcuts (Ctrl+Z undo, Ctrl+Y/Shift+Z redo, Delete confirm) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
                      target.isContentEditable;

      if (isInput) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
        e.preventDefault();
        const selNodes = nodes.filter(n => n.selected || n.id === selectedNodeId);
        const selEdges = edges.filter(ex => ex.selected);
        if (selNodes.length > 0 || selEdges.length > 0) {
          requestDelete();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, selectedNodeId, undo, redo, requestDelete]);

  // ── Styled edges ────────────────────────────────────────────────────────
  // Priority: selected > handle-hovered > default
  const styledEdges = edges.map((edge) => {
    let style   = EDGE_DEFAULT;
    let animated = false;

    if (edge.selected) {
      style = EDGE_SELECTED;
    } else if (hoveredHandle) {
      // Is this edge connected to the currently-hovered handle?
      //
      // For SOURCE handles we match when:
      //   • edge.source is the hovered node, AND
      //   • edge.sourceHandle exactly equals the hovered handle id
      //     — OR edge.sourceHandle is null/undefined/'' (legacy/template edges
      //       that were saved without an explicit sourceHandle; treat them as
      //       belonging to the default/only output of that node)
      const connected =
        hoveredHandle.handleType === 'source'
          ? edge.source === hoveredHandle.nodeId &&
            (edge.sourceHandle === hoveredHandle.handleId ||
             edge.sourceHandle == null ||
             edge.sourceHandle === '')
          : edge.target === hoveredHandle.nodeId;

      if (connected) {
        style    = EDGE_HOVERED;
        animated = true;
      }
    }

    return { ...edge, style, animated };
  });

  const canUndo = history.length > 0;
  const canRedo = future.length  > 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left palette ────────────────────────────────────────────────── */}
      <div className="w-44 bg-white border-r border-gray-200 p-3 space-y-1.5 overflow-y-auto flex flex-col">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nodes</p>
        <p className="text-[10px] text-gray-400 mb-2">Drag or double-click to add</p>
        {NODE_PALETTE.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/reactflow-type', item.type)}
            onDoubleClick={() => onDoubleClickPaletteItem(item.type)}
            title={`Double-click to add ${item.label}`}
            className={`
              flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-grab
              text-white text-xs font-medium select-none
              active:cursor-grabbing hover:opacity-90 transition-opacity
              ${item.color}
            `}
          >
            <span className="shrink-0">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </div>
        ))}
      </div>

      {/* ── Centre column (toolbar + canvas) ────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-b border-gray-200 shrink-0">
          {/* Undo */}
          <button
            onClick={undo}
            disabled={!canUndo}
            title={canUndo ? `Undo (${history.length} step${history.length !== 1 ? 's' : ''}) — Ctrl+Z` : 'Nothing to undo'}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              canUndo
                ? 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                : 'text-gray-300 bg-gray-50 cursor-not-allowed'
            )}
          >
            <Undo2 size={13} /> Undo
          </button>

          {/* Redo */}
          <button
            onClick={redo}
            disabled={!canRedo}
            title={canRedo ? `Redo (${future.length} step${future.length !== 1 ? 's' : ''}) — Ctrl+Y` : 'Nothing to redo'}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              canRedo
                ? 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                : 'text-gray-300 bg-gray-50 cursor-not-allowed'
            )}
          >
            <Redo2 size={13} /> Redo
          </button>

          <div className="w-px h-4 bg-gray-200" />

          {/* Delete selected */}
          {hasSelection && (
            <button
              onClick={requestDelete}
              title="Delete selected — or press Delete key"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
            >
              <Trash2 size={13} /> Delete selected
            </button>
          )}

          {/* Keyboard hint */}
          <span className="ml-auto text-[10px] text-gray-300 hidden sm:block">
            Ctrl+Z undo · Ctrl+Y redo · Del to delete
          </span>
        </div>

        {/* ── ReactFlow canvas ──────────────────────────────────────────── */}
        <div ref={reactFlowWrapper} className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onInit={(instance) => { rfInstance.current = instance; }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            edgesUpdatable
            onEdgeUpdateStart={onEdgeUpdateStart}
            onEdgeUpdate={onEdgeUpdate}
            onEdgeUpdateEnd={onEdgeUpdateEnd}
            /* Disable built-in delete key — we intercept it manually for confirmation */
            deleteKeyCode={null}
            fitView
            attributionPosition="bottom-left"
            defaultEdgeOptions={{ style: EDGE_DEFAULT, animated: false }}
          >
            <Background gap={16} color="#f1f5f9" />
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />

            {isDirty && (
              <Panel position="top-center">
                <span className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-1 rounded-full">
                  Unsaved changes
                </span>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </div>

      {/* ── Right config panel ────────────────────────────────────────────── */}
      <NodeConfigPanel />

      {/* ── Confirmation dialog (portal-style fixed overlay) ──────────────── */}
      {confirm && (
        <ConfirmDialog state={confirm} onCancel={clearConfirm} />
      )}
    </div>
  );
}
