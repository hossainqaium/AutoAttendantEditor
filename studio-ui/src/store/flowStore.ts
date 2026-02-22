// =============================================================================
// IVR Studio: Zustand Flow Store  (with undo / redo history)
// =============================================================================

import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges, type Connection } from 'reactflow';
import type { Node, Edge, NodeChange, EdgeChange } from 'reactflow';
import type { Domain, Flow, IvrVersion } from '../api/client';

const MAX_HISTORY = 50;

type Snapshot = { nodes: Node[]; edges: Edge[] };

interface FlowStore {
  // Domain selection
  domains: Domain[];
  selectedDomain: Domain | null;
  setDomains: (d: Domain[]) => void;
  setSelectedDomain: (d: Domain | null) => void;

  // Flow list
  flows: Flow[];
  setFlows: (f: Flow[]) => void;

  // Active flow being edited
  activeFlow: Flow | null;
  setActiveFlow: (f: Flow | null) => void;

  // ReactFlow canvas state
  nodes: Node[];
  edges: Edge[];
  setNodes: (n: Node[]) => void;
  setEdges: (e: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Dirty state tracking
  isDirty: boolean;
  setIsDirty: (v: boolean) => void;

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  history: Snapshot[];   // snapshots BEFORE current state  (most recent last)
  future:  Snapshot[];   // snapshots AFTER  current state  (most recent first)
  /** Save current canvas to history and clear the redo stack. */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Versions panel
  versions: IvrVersion[];
  setVersions: (v: IvrVersion[]) => void;

  // Selected node for config panel
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  // Validation errors
  validationErrors: string[];
  setValidationErrors: (e: string[]) => void;

  // UI state
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;

  // Update a single node's data (config panel saves)
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;

  // Load a template graph onto the canvas
  loadTemplate: (nodes: Node[], edges: Edge[]) => void;
}

export const useFlowStore = create<FlowStore>((set, get) => ({
  domains: [],
  selectedDomain: null,
  setDomains: (domains) => set({ domains }),
  setSelectedDomain: (selectedDomain) => set({ selectedDomain }),

  flows: [],
  setFlows: (flows) => set({ flows }),

  activeFlow: null,
  setActiveFlow: (activeFlow) => {
    set({
      activeFlow,
      nodes: [],
      edges: [],
      isDirty: false,
      selectedNodeId: null,
      validationErrors: [],
      // Clear history when switching flows
      history: [],
      future: [],
    });
  },

  nodes: [],
  edges: [],
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) =>
    set((state) => {
      // Push a history snapshot when a drag ends (dragging → false)
      const hasDragEnd = changes.some(
        (c) => c.type === 'position' && (c as { dragging?: boolean }).dragging === false
      );
      const snapshot: Snapshot = { nodes: state.nodes, edges: state.edges };
      return {
        nodes: applyNodeChanges(changes, state.nodes),
        isDirty: true,
        ...(hasDragEnd
          ? { history: [...state.history.slice(-(MAX_HISTORY - 1)), snapshot], future: [] }
          : {}),
      };
    }),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      isDirty: true,
    })),

  onConnect: (connection) =>
    set((state) => {
      const snapshot: Snapshot = { nodes: state.nodes, edges: state.edges };
      return {
        edges: addEdge(
          { ...connection, animated: false, style: { stroke: '#6366f1' } },
          state.edges
        ),
        isDirty: true,
        history: [...state.history.slice(-(MAX_HISTORY - 1)), snapshot],
        future: [],
      };
    }),

  isDirty: false,
  setIsDirty: (isDirty) => set({ isDirty }),

  // ── History ────────────────────────────────────────────────────────────────
  history: [],
  future:  [],

  pushHistory: () => {
    const { nodes, edges, history } = get();
    const snapshot: Snapshot = { nodes: [...nodes], edges: [...edges] };
    set({
      history: [...history.slice(-(MAX_HISTORY - 1)), snapshot],
      future:  [],
    });
  },

  undo: () => {
    const { nodes, edges, history, future } = get();
    if (history.length === 0) return;
    const prev    = history[history.length - 1];
    const current: Snapshot = { nodes: [...nodes], edges: [...edges] };
    set({
      nodes:   prev.nodes,
      edges:   prev.edges,
      history: history.slice(0, -1),
      future:  [current, ...future].slice(0, MAX_HISTORY),
      isDirty: true,
      selectedNodeId: null,
    });
  },

  redo: () => {
    const { nodes, edges, history, future } = get();
    if (future.length === 0) return;
    const next    = future[0];
    const current: Snapshot = { nodes: [...nodes], edges: [...edges] };
    set({
      nodes:   next.nodes,
      edges:   next.edges,
      history: [...history, current].slice(-MAX_HISTORY),
      future:  future.slice(1),
      isDirty: true,
      selectedNodeId: null,
    });
  },

  // ── Misc ───────────────────────────────────────────────────────────────────
  versions: [],
  setVersions: (versions) => set({ versions }),

  selectedNodeId: null,
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),

  validationErrors: [],
  setValidationErrors: (validationErrors) => set({ validationErrors }),

  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  updateNodeData: (nodeId, data) =>
    set((state) => {
      const snapshot: Snapshot = { nodes: state.nodes, edges: state.edges };
      return {
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        ),
        isDirty: true,
        history: [...state.history.slice(-(MAX_HISTORY - 1)), snapshot],
        future:  [],
      };
    }),

  loadTemplate: (nodes, edges) =>
    set({ nodes, edges, isDirty: true, selectedNodeId: null, validationErrors: [], history: [], future: [] }),
}));
