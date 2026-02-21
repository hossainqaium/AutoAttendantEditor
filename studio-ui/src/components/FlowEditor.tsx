// =============================================================================
// IVR Studio: Main Flow Editor Canvas (ReactFlow)
// =============================================================================

import React, { useCallback, useRef } from 'react';
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
  GitBranch, Clock, Globe, PhoneOff, Variable, Trash2,
} from 'lucide-react';

import { useFlowStore } from '../store/flowStore';
import { nodeTypes } from './nodes';
import { NodeConfigPanel } from './panels/NodeConfigPanel';
import { generateNodeId } from '../lib/utils';

// ─── Node palette definition (type, label, colour, icon) ────────────────────
const NODE_PALETTE = [
  { type: 'play_audio',     label: 'Play Audio',     color: 'bg-emerald-500', icon: <Volume2     size={14}/> },
  { type: 'get_digits',     label: 'Get Digits',     color: 'bg-violet-500',  icon: <Hash        size={14}/> },
  { type: 'transfer',       label: 'Transfer',       color: 'bg-sky-500',     icon: <PhoneForwarded size={14}/> },
  { type: 'voicemail',      label: 'Voicemail',      color: 'bg-amber-500',   icon: <Voicemail   size={14}/> },
  { type: 'condition',      label: 'Condition',      color: 'bg-orange-500',  icon: <GitBranch   size={14}/> },
  { type: 'time_condition', label: 'Time Condition', color: 'bg-teal-500',    icon: <Clock       size={14}/> },
  { type: 'api_call',       label: 'API Call',       color: 'bg-indigo-500',  icon: <Globe       size={14}/> },
  { type: 'set_variable',   label: 'Set Variable',   color: 'bg-gray-600',    icon: <Variable    size={14}/> },
  { type: 'hangup',         label: 'Hangup',         color: 'bg-red-500',     icon: <PhoneOff    size={14}/> },
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

// Edge colours
const EDGE_DEFAULT  = { stroke: '#6366f1', strokeWidth: 2 };
const EDGE_SELECTED = { stroke: '#f59e0b', strokeWidth: 3 };

export function FlowEditor() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    setSelectedNodeId, selectedNodeId,
    setNodes, setEdges, setIsDirty,
    isDirty,
  } = useFlowStore();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  // Hold ref to edge being reconnected so we can fall back if drop misses a handle
  const edgeUpdateSuccessful = useRef(true);

  // ── Node click / pane click ──────────────────────────────────────────────
  const onNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  // ── Drag-and-drop from palette ───────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow-type');
    if (!type || !rfInstance.current || !reactFlowWrapper.current) return;

    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = rfInstance.current.screenToFlowPosition({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    });

    addNodeOfType(type, position);
  }, [nodes, setNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Double-click palette item → add to viewport centre ──────────────────
  const onDoubleClickPaletteItem = useCallback((type: string) => {
    if (!rfInstance.current || !reactFlowWrapper.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = rfInstance.current.screenToFlowPosition({
      x: bounds.left + bounds.width  / 2,
      y: bounds.top  + bounds.height / 2,
    });
    // Small random offset so stacked double-clicks don't overlap exactly
    addNodeOfType(type, {
      x: position.x + Math.round(Math.random() * 40 - 20),
      y: position.y + Math.round(Math.random() * 40 - 20),
    });
  }, [nodes, setNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNodeOfType = useCallback((type: string, position: { x: number; y: number }) => {
    const newNode = {
      id:   generateNodeId(),
      type,
      position,
      data: { ...(DEFAULT_NODE_DATA[type] || { label: type }) },
    };
    setNodes([...nodes, newNode]);
    setIsDirty(true);
  }, [nodes, setNodes, setIsDirty]);

  // ── Delete selected node(s) + their connected edges ─────────────────────
  const handleDeleteSelected = useCallback(() => {
    const selectedNodeIds = nodes.filter(n => n.selected || n.id === selectedNodeId).map(n => n.id);
    const hasSelectedEdge  = edges.some(e => e.selected);

    if (selectedNodeIds.length > 0) {
      setNodes(nodes.filter(n => !selectedNodeIds.includes(n.id)));
      setEdges(edges.filter(e => !selectedNodeIds.includes(e.source) && !selectedNodeIds.includes(e.target)));
      setSelectedNodeId(null);
      setIsDirty(true);
    } else if (hasSelectedEdge) {
      setEdges(edges.filter(e => !e.selected));
      setIsDirty(true);
    }
  }, [nodes, edges, selectedNodeId, setNodes, setEdges, setSelectedNodeId, setIsDirty]);

  // Whether anything is selected (node or edge)
  const hasSelection = (selectedNodeId != null) ||
    nodes.some(n => n.selected) ||
    edges.some(e => e.selected);

  // ── Edge reconnecting (drag either end to a different handle) ───────────
  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const onEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    edgeUpdateSuccessful.current = true;
    setEdges(updateEdge(oldEdge, newConnection, edges));
    setIsDirty(true);
  }, [edges, setEdges, setIsDirty]);

  const onEdgeUpdateEnd = useCallback((_: unknown, edge: Edge) => {
    if (!edgeUpdateSuccessful.current) {
      // Drop landed in empty space — remove the dangling edge
      setEdges(edges.filter(e => e.id !== edge.id));
      setIsDirty(true);
    }
    edgeUpdateSuccessful.current = true;
  }, [edges, setEdges, setIsDirty]);

  // ── Apply selected-edge colouring ────────────────────────────────────────
  const styledEdges = edges.map(edge => ({
    ...edge,
    style: edge.selected ? EDGE_SELECTED : EDGE_DEFAULT,
  }));

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left palette ───────────────────────────────────────────────── */}
      <div className="w-44 bg-white border-r border-gray-200 p-3 space-y-1.5 overflow-y-auto">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Nodes
        </p>
        <p className="text-[10px] text-gray-400 -mt-1 mb-2">
          Drag or double-click to add
        </p>
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

      {/* ── Canvas ─────────────────────────────────────────────────────── */}
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
          /* Reconnect edges by dragging either endpoint */
          edgesUpdatable
          onEdgeUpdateStart={onEdgeUpdateStart}
          onEdgeUpdate={onEdgeUpdate}
          onEdgeUpdateEnd={onEdgeUpdateEnd}
          /* Delete key removes selected nodes/edges; ReactFlow also removes orphaned edges */
          deleteKeyCode="Delete"
          fitView
          attributionPosition="bottom-left"
          defaultEdgeOptions={{ style: EDGE_DEFAULT, animated: false }}
        >
          <Background gap={16} color="#f1f5f9" />
          <Controls />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />

          {/* Unsaved-changes badge */}
          {isDirty && (
            <Panel position="top-center">
              <span className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-1 rounded-full">
                Unsaved changes
              </span>
            </Panel>
          )}

          {/* Delete selected button — appears whenever a node or edge is selected */}
          {hasSelection && (
            <Panel position="top-right">
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium shadow-md transition-colors"
                title="Delete selected (or press Delete key)"
              >
                <Trash2 size={13} /> Delete selected
              </button>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* ── Right config panel ─────────────────────────────────────────── */}
      <NodeConfigPanel />
    </div>
  );
}
