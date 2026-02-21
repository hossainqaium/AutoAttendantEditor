// =============================================================================
// IVR Studio: Client-side Graph Compiler (mirrors server-side logic)
// Used for real-time validation feedback in the canvas.
// =============================================================================

import type { Node, Edge } from 'reactflow';

const TERMINAL_TYPES = new Set(['hangup', 'transfer', 'voicemail']);

export interface CompileResult {
  ok: boolean;
  errors: string[];
  executionGraph: ExecutionGraph | null;
}

export interface ExecutionGraph {
  version: number;
  entry_node: string;
  nodes: Record<string, ExecutionNode>;
}

export interface ExecutionNode {
  type: string;
  config: Record<string, unknown>;
  outputs: Record<string, string>;
}

export function validateAndCompile(nodes: Node[], edges: Edge[]): CompileResult {
  const errors: string[] = [];

  if (nodes.length === 0) {
    return { ok: false, errors: ['Flow has no nodes'], executionGraph: null };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map(nodes.map((n) => [n.id, 0]));
  const outputMap = new Map<string, Record<string, string>>(
    nodes.map((n) => [n.id, {}])
  );
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    const handle = edge.sourceHandle || 'next';
    outputMap.get(edge.source)![handle] = edge.target;
    adj.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // Validate node types
  const validTypes = new Set([
    'play_audio','get_digits','transfer','voicemail',
    'condition','time_condition','api_call','hangup','set_variable',
  ]);
  for (const node of nodes) {
    if (!validTypes.has(node.type!)) {
      errors.push(`Unknown node type "${node.type}"`);
    }
  }

  // Find entry node
  const entryNodes = nodes.filter(
    (n) => (inDegree.get(n.id) || 0) === 0 && !TERMINAL_TYPES.has(n.type!)
  );
  if (entryNodes.length === 0) errors.push('No entry node (node with no incoming edges)');
  if (entryNodes.length > 1)  errors.push('Multiple entry nodes detected — connect them');

  // Cycle detection (Kahn's)
  const loopEdgeKeys = new Set(
    edges.filter((e) => e.data?.loop).map((e) => `${e.source}->${e.target}`)
  );
  const tempDeg = new Map(inDegree);
  for (const edge of edges) {
    if (loopEdgeKeys.has(`${edge.source}->${edge.target}`)) {
      tempDeg.set(edge.target, (tempDeg.get(edge.target) || 1) - 1);
    }
  }
  const tempAdj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (!loopEdgeKeys.has(`${edge.source}->${edge.target}`)) {
      tempAdj.get(edge.source)!.push(edge.target);
    }
  }
  const topoQ = nodes.filter((n) => (tempDeg.get(n.id) || 0) === 0).map((n) => n.id);
  let processed = 0;
  while (topoQ.length > 0) {
    const id = topoQ.shift()!;
    processed++;
    for (const nb of tempAdj.get(id) || []) {
      const d = (tempDeg.get(nb) || 0) - 1;
      tempDeg.set(nb, d);
      if (d === 0) topoQ.push(nb);
    }
  }
  if (processed < nodes.length) {
    errors.push('Cycle detected. Mark intentional loops with the loop edge property.');
  }

  // Check non-terminal nodes have outgoing edges
  for (const node of nodes) {
    if (TERMINAL_TYPES.has(node.type!) || node.type === 'hangup') continue;
    if (Object.keys(outputMap.get(node.id) || {}).length === 0) {
      errors.push(`Node "${node.data?.label || node.id}" [${node.type}] has no outgoing edges`);
    }
  }

  // API call nodes must have timeout + error edges
  for (const node of nodes) {
    if (node.type !== 'api_call') continue;
    const outs = outputMap.get(node.id) || {};
    if (!outs['timeout']) errors.push(`API Call "${node.data?.label || node.id}" missing "timeout" edge`);
    if (!outs['error'])   errors.push(`API Call "${node.data?.label || node.id}" missing "error" edge`);
  }

  // Reachability check
  if (entryNodes.length === 1) {
    const reachable = new Set<string>();
    const bfsQ = [entryNodes[0].id];
    while (bfsQ.length > 0) {
      const id = bfsQ.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const nb of adj.get(id) || []) bfsQ.push(nb);
    }
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        errors.push(`Orphan node (unreachable): "${node.data?.label || node.id}" [${node.type}]`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors, executionGraph: null };

  // Build execution graph
  const execNodes: Record<string, ExecutionNode> = {};
  for (const node of nodes) {
    execNodes[node.id] = {
      type:    node.type!,
      config:  (node.data || {}) as Record<string, unknown>,
      outputs: outputMap.get(node.id) || {},
    };
  }

  return {
    ok: true,
    errors: [],
    executionGraph: {
      version:    1,
      entry_node: entryNodes[0].id,
      nodes:      execNodes,
    },
  };
}
