// =============================================================================
// IVR Studio: Zustand Flow Store
// =============================================================================

import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges, type Connection } from 'reactflow';
import type { Node, Edge, NodeChange, EdgeChange } from 'reactflow';
import type { Domain, Flow, IvrVersion } from '../api/client';

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
    });
  },

  nodes: [],
  edges: [],
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
      isDirty: true,
    })),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      isDirty: true,
    })),

  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge(
        { ...connection, animated: false, style: { stroke: '#6366f1' } },
        state.edges
      ),
      isDirty: true,
    })),

  isDirty: false,
  setIsDirty: (isDirty) => set({ isDirty }),

  versions: [],
  setVersions: (versions) => set({ versions }),

  selectedNodeId: null,
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),

  validationErrors: [],
  setValidationErrors: (validationErrors) => set({ validationErrors }),

  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  updateNodeData: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
      isDirty: true,
    })),

  loadTemplate: (nodes, edges) =>
    set({ nodes, edges, isDirty: true, selectedNodeId: null, validationErrors: [] }),
}));
