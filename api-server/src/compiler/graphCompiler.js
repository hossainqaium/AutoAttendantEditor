// =============================================================================
// IVR Studio: Graph Validator + Execution JSON Compiler
// Runs server-side on publish. Also exported for client-side preview.
// =============================================================================

'use strict';

const TERMINAL_NODE_TYPES = new Set(['hangup', 'transfer', 'voicemail']);
const ALL_NODE_TYPES = new Set([
  'play_audio', 'get_digits', 'transfer', 'voicemail',
  'condition', 'time_condition', 'api_call', 'hangup', 'set_variable',
]);

// Expected output handles per node type
const NODE_OUTPUTS = {
  play_audio:      ['next'],
  get_digits:      ['1','2','3','4','5','6','7','8','9','0','*','#','timeout','invalid'],
  transfer:        ['failed'],
  voicemail:       [],
  condition:       ['true', 'false'],
  time_condition:  ['open', 'closed'],
  api_call:        ['success', 'timeout', 'error'],
  hangup:          [],
  set_variable:    ['next'],
};

// ---------------------------------------------------------------------------
// validateAndCompile(reactFlowGraph) → { ok, errors, executionGraph }
//
// reactFlowGraph = { nodes: [{id, type, data}], edges: [{id, source, target, sourceHandle}] }
// executionGraph = { version, entry_node, nodes: { [id]: {type, config, outputs} } }
// ---------------------------------------------------------------------------
function validateAndCompile(reactFlowGraph) {
  const errors = [];
  const { nodes = [], edges = [] } = reactFlowGraph;

  if (nodes.length === 0) {
    return { ok: false, errors: ['Flow has no nodes'], executionGraph: null };
  }

  // --- Build maps ---
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map(nodes.map(n => [n.id, []]));  // adjacency list
  const inDegree = new Map(nodes.map(n => [n.id, 0]));

  // Edge map: [source_id][handle] → target_id
  const outputMap = new Map(nodes.map(n => [n.id, {}]));

  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      errors.push(`Edge references non-existent source node: ${edge.source}`);
      continue;
    }
    if (!nodeMap.has(edge.target)) {
      errors.push(`Edge references non-existent target node: ${edge.target}`);
      continue;
    }
    const handle = edge.sourceHandle || 'next';
    outputMap.get(edge.source)[handle] = edge.target;
    adj.get(edge.source).push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // --- Validate node types ---
  for (const node of nodes) {
    if (!ALL_NODE_TYPES.has(node.type)) {
      errors.push(`Unknown node type "${node.type}" on node ${node.id}`);
    }
  }

  // --- Find entry node (zero in-degree, non-terminal) ---
  const entryNodes = nodes.filter(n =>
    inDegree.get(n.id) === 0 && !TERMINAL_NODE_TYPES.has(n.type)
  );
  if (entryNodes.length === 0) {
    errors.push('No entry node found (a node with no incoming edges)');
  }
  if (entryNodes.length > 1) {
    errors.push(`Multiple potential entry nodes: ${entryNodes.map(n => n.id).join(', ')}. Connect them or designate one.`);
  }

  // --- Detect unreachable (orphan) nodes via BFS from entry ---
  if (entryNodes.length === 1) {
    const reachable = new Set();
    const queue = [entryNodes[0].id];
    while (queue.length > 0) {
      const id = queue.shift();
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const neighbor of (adj.get(id) || [])) {
        queue.push(neighbor);
      }
    }
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        errors.push(`Orphan node (unreachable from entry): ${node.id} [${node.type}]`);
      }
    }
  }

  // --- Cycle detection (Kahn's algorithm) ---
  // Allow whitelisted loops (get_digits retry, menu loopback) tagged with edge.data.loop=true
  const loopEdges = new Set(
    edges.filter(e => e.data && e.data.loop).map(e => `${e.source}->${e.target}`)
  );

  const tempInDegree = new Map(inDegree);
  // Remove loop edges from cycle detection
  for (const edge of edges) {
    const key = `${edge.source}->${edge.target}`;
    if (loopEdges.has(key)) {
      tempInDegree.set(edge.target, (tempInDegree.get(edge.target) || 1) - 1);
    }
  }

  const topoQueue = [...nodes.filter(n => (tempInDegree.get(n.id) || 0) === 0).map(n => n.id)];
  let processed = 0;
  const tempAdj = new Map(nodes.map(n => [n.id, []]));
  for (const edge of edges) {
    if (!loopEdges.has(`${edge.source}->${edge.target}`)) {
      tempAdj.get(edge.source).push(edge.target);
    }
  }

  while (topoQueue.length > 0) {
    const id = topoQueue.shift();
    processed++;
    for (const neighbor of (tempAdj.get(id) || [])) {
      const deg = (tempInDegree.get(neighbor) || 0) - 1;
      tempInDegree.set(neighbor, deg);
      if (deg === 0) topoQueue.push(neighbor);
    }
  }

  if (processed < nodes.length) {
    errors.push('Cycle detected in flow graph. Mark intentional loops with the "loop" edge property.');
  }

  // --- Validate non-terminal nodes have at least one output ---
  for (const node of nodes) {
    if (TERMINAL_NODE_TYPES.has(node.type)) continue;
    if (node.type === 'hangup') continue;
    const outputs = outputMap.get(node.id) || {};
    if (Object.keys(outputs).length === 0) {
      errors.push(`Node ${node.id} [${node.type}] has no outgoing edges`);
    }
  }

  // --- Validate API call nodes have error/timeout outputs ---
  for (const node of nodes) {
    if (node.type !== 'api_call') continue;
    const outputs = outputMap.get(node.id) || {};
    if (!outputs['timeout']) {
      errors.push(`API Call node ${node.id} is missing a "timeout" output edge`);
    }
    if (!outputs['error']) {
      errors.push(`API Call node ${node.id} is missing an "error" output edge`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, executionGraph: null };
  }

  // --- Compile execution graph ---
  const executionNodes = {};
  for (const node of nodes) {
    executionNodes[node.id] = {
      type:    node.type,
      config:  node.data || {},
      outputs: outputMap.get(node.id) || {},
    };
  }

  const executionGraph = {
    version:    1,
    entry_node: entryNodes[0].id,
    nodes:      executionNodes,
  };

  return { ok: true, errors: [], executionGraph };
}

// ---------------------------------------------------------------------------
// computeChecksum(executionGraph) → SHA256 hex string
// ---------------------------------------------------------------------------
const crypto = require('crypto');
function computeChecksum(executionGraph) {
  const str = JSON.stringify(executionGraph, Object.keys(executionGraph).sort());
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = { validateAndCompile, computeChecksum };
