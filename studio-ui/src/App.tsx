// =============================================================================
// IVR Studio: Main Application
// =============================================================================

import React, { useEffect, useState } from 'react';
import { FlowEditor } from './components/FlowEditor';
import { useFlowStore } from './store/flowStore';
import {
  getDomains, getFlows, getFlow, createFlow, saveFlow, publishFlow,
  rollbackFlow, getVersions, getVersionFull, getDids, assignDid, deleteDid,
  getSecrets, upsertSecret, deleteSecret,
  type Flow, type IvrVersion, type DidRoute, type Secret,
} from './api/client';
import { validateAndCompile } from './compiler/graphCompiler';
import {
  Phone, GitBranch, RefreshCw, Check, AlertTriangle,
  Plus, Upload, RotateCcw, Trash2, Key, List, LayoutTemplate, PhoneCall,
} from 'lucide-react';
import { cn } from './lib/utils';
import { TemplatesModal } from './components/TemplatesModal';
import type { IvrTemplate, RouteType } from './api/client';

type Tab = 'editor' | 'dids' | 'secrets' | 'logs';

export default function App() {
  const {
    domains, selectedDomain, setDomains, setSelectedDomain,
    flows, setFlows, activeFlow, setActiveFlow,
    nodes, edges, setNodes, setEdges,
    isDirty, setIsDirty,
    versions, setVersions,
    validationErrors, setValidationErrors,
    loadTemplate,
  } = useFlowStore();

  const [tab, setTab] = useState<Tab>('editor');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingFlow, setLoadingFlow] = useState(false);
  // When true, canvas was populated from the published version (no draft existed)
  const [editingFromPublished, setEditingFromPublished] = useState(false);
  // Set true immediately after a successful publish; cleared as soon as isDirty turns true
  const [justPublished, setJustPublished] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [dids, setDids] = useState<DidRoute[]>([]);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // Quick-assign extension state (shown inline in the flow sidebar)
  const [quickAssignFlowId, setQuickAssignFlowId] = useState<string | null>(null);
  const [quickDest, setQuickDest] = useState('');
  const [quickRouteType, setQuickRouteType] = useState<RouteType>('internal');
  const [quickAssigning, setQuickAssigning] = useState(false);
  // Per-flow DID assignments shown in the sidebar
  const [flowDids, setFlowDids] = useState<DidRoute[]>([]);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load domains on mount
  useEffect(() => {
    getDomains()
      .then(setDomains)
      .catch(() => showToast('Failed to load domains', 'err'));
  }, []);

  // Load flows when domain changes
  useEffect(() => {
    if (!selectedDomain) return;
    getFlows(selectedDomain.domain_uuid)
      .then(setFlows)
      .catch(() => showToast('Failed to load flows', 'err'));
  }, [selectedDomain]);

  // Load active flow into canvas (draft → published fallback → empty)
  useEffect(() => {
    if (!activeFlow || !selectedDomain) return;

    setLoadingFlow(true);
    setEditingFromPublished(false);
    setJustPublished(false);

    const loadGraph = async () => {
      try {
        // 1. Use draft_graph already on the object (populated by list endpoint)
        let graph = activeFlow.draft_graph ?? null;

        // 2. If missing, fetch full flow from the server
        if (!graph) {
          const full = await getFlow(activeFlow.flow_id, selectedDomain.domain_uuid);
          graph = full.draft_graph ?? null;
        }

        // 3. Still no draft? Load published version's raw_graph for editing
        if (!graph && activeFlow.published_version_id) {
          try {
            const ver = await getVersionFull(
              activeFlow.flow_id,
              activeFlow.published_version_id,
              selectedDomain.domain_uuid
            );
            graph = ver.raw_graph ?? null;
            if (graph) setEditingFromPublished(true);
          } catch {
            // version fetch failed — fall through to empty canvas
          }
        }

        if (graph) {
          setNodes(graph.nodes || []);
          setEdges(graph.edges || []);
        } else {
          setNodes([]);
          setEdges([]);
        }
        setIsDirty(false);
      } catch (e: unknown) {
        showToast('Failed to load flow — ' + (e as Error).message, 'err');
        setNodes([]);
        setEdges([]);
      } finally {
        setLoadingFlow(false);
      }
    };

    loadGraph();
  }, [activeFlow?.flow_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveDraft = async () => {
    if (!activeFlow || !selectedDomain) return;
    setSaving(true);
    try {
      await saveFlow(activeFlow.flow_id, {
        domainUuid: selectedDomain.domain_uuid,
        draftGraph: { nodes, edges },
      });
      setIsDirty(false);
      setEditingFromPublished(false);
      showToast('Draft saved');
    } catch (e: unknown) {
      showToast((e as Error).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!activeFlow || !selectedDomain) return;

    // Client-side validation first
    const { ok, errors } = validateAndCompile(nodes, edges);
    setValidationErrors(errors);
    if (!ok) {
      showToast(`Validation failed: ${errors[0]}`, 'err');
      return;
    }

    setPublishing(true);
    try {
      // Save draft first
      await saveFlow(activeFlow.flow_id, {
        domainUuid: selectedDomain.domain_uuid,
        draftGraph: { nodes, edges },
      });
      await publishFlow(activeFlow.flow_id, { domainUuid: selectedDomain.domain_uuid });
      setIsDirty(false);
      setJustPublished(true);
      showToast('Flow published successfully');
      // Refresh flow list to show new published version
      const updated = await getFlows(selectedDomain.domain_uuid);
      setFlows(updated);
    } catch (e: unknown) {
      showToast((e as Error).message, 'err');
    } finally {
      setPublishing(false);
    }
  };

  const handleLoadVersions = async () => {
    if (!activeFlow || !selectedDomain) return;
    const vers = await getVersions(activeFlow.flow_id, selectedDomain.domain_uuid);
    setVersions(vers);
    setShowVersions(true);
  };

  const handleLoadTemplate = (template: IvrTemplate) => {
    // Cast template nodes/edges to ReactFlow types
    setNodes(template.graph.nodes as Parameters<typeof setNodes>[0]);
    setEdges(template.graph.edges as Parameters<typeof setEdges>[0]);
    loadTemplate(
      template.graph.nodes as Parameters<typeof loadTemplate>[0],
      template.graph.edges as Parameters<typeof loadTemplate>[1]
    );
    setShowTemplates(false);
    showToast(`Template "${template.name}" loaded — customise and save`);
  };

  const handleRollback = async (versionId: string) => {
    if (!activeFlow || !selectedDomain) return;
    try {
      await rollbackFlow(activeFlow.flow_id, versionId, { domainUuid: selectedDomain.domain_uuid });
      showToast('Rollback successful');
      setShowVersions(false);
    } catch (e: unknown) {
      showToast((e as Error).message, 'err');
    }
  };

  const handleCreateFlow = async () => {
    if (!selectedDomain || !newFlowName.trim()) return;
    try {
      const flow = await createFlow({ domainUuid: selectedDomain.domain_uuid, name: newFlowName.trim() });
      setFlows([...flows, flow as Flow]);
      setNewFlowName('');
      setShowNewFlow(false);
      setActiveFlow(flow as Flow);
      showToast('Flow created');
    } catch (e: unknown) {
      showToast((e as Error).message, 'err');
    }
  };

  // Once the user makes any edit after publishing, re-enable the Publish button
  // and dismiss the "editing from published" notice
  useEffect(() => {
    if (isDirty) {
      setEditingFromPublished(false);
      setJustPublished(false);
    }
  }, [isDirty]);

  // DID tab
  const loadDids = async () => {
    if (!selectedDomain) return;
    const all = await getDids(selectedDomain.domain_uuid);
    setDids(all);
    return all;
  };
  useEffect(() => { if (tab === 'dids' && selectedDomain) loadDids(); }, [tab, selectedDomain]);

  // Load DIDs for active flow (shown in sidebar)
  useEffect(() => {
    if (!selectedDomain || !activeFlow) { setFlowDids([]); return; }
    getDids(selectedDomain.domain_uuid)
      .then((all) => setFlowDids(all.filter((d) => d.flow_id === activeFlow.flow_id)));
  }, [activeFlow?.flow_id, selectedDomain]);

  const handleQuickAssign = async () => {
    if (!selectedDomain || !quickAssignFlowId || !quickDest.trim()) return;
    setQuickAssigning(true);
    try {
      const route = await assignDid({
        domainUuid: selectedDomain.domain_uuid,
        destination: quickDest.trim(),
        flowId: quickAssignFlowId,
        routeType: quickRouteType,
      });
      setFlowDids((prev) => [...prev.filter((d) => d.destination !== route.destination), route]);
      setQuickDest('');
      setQuickAssignFlowId(null);
      showToast(`Extension ${route.destination} assigned — dial it from any SIP phone!`);
    } catch (e: unknown) {
      showToast((e as Error).message, 'err');
    } finally {
      setQuickAssigning(false);
    }
  };

  // Secrets tab
  const loadSecrets = async () => {
    if (!selectedDomain) return;
    setSecrets(await getSecrets(selectedDomain.domain_uuid));
  };
  useEffect(() => { if (tab === 'secrets' && selectedDomain) loadSecrets(); }, [tab, selectedDomain]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* ── Top Bar ── */}
      <header className="h-12 bg-white border-b border-gray-200 flex items-center gap-3 px-4 shrink-0">
        <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm">
          <Phone size={18} />
          IVR Studio
        </div>
        <div className="w-px h-5 bg-gray-200" />

        {/* Domain selector */}
        <select
          value={selectedDomain?.domain_uuid || ''}
          onChange={(e) => {
            const d = domains.find((x) => x.domain_uuid === e.target.value) || null;
            setSelectedDomain(d);
            setActiveFlow(null);
          }}
          className="border border-gray-200 rounded-md px-2 py-1 text-xs"
        >
          <option value="">Select domain…</option>
          {domains.map((d) => (
            <option key={d.domain_uuid} value={d.domain_uuid}>{d.domain_name}</option>
          ))}
        </select>

        {/* Templates button */}
        <button
          onClick={() => setShowTemplates(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
        >
          <LayoutTemplate size={13} /> Templates
        </button>

        {/* Tab nav */}
        <nav className="flex gap-1 ml-2">
          {([
            { id: 'editor',  label: 'Editor',  icon: <GitBranch size={13}/> },
            { id: 'dids',    label: 'DIDs',    icon: <Phone size={13}/> },
            { id: 'secrets', label: 'Secrets', icon: <Key size={13}/> },
            { id: 'logs',    label: 'Logs',    icon: <List size={13}/> },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors',
                tab === t.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </nav>

        {/* Right actions — only in editor tab */}
        {tab === 'editor' && activeFlow && (
          <div className="ml-auto flex items-center gap-2">
            {validationErrors.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle size={13}/> {validationErrors.length} error(s)
              </span>
            )}
            <button onClick={handleLoadVersions}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200">
              <RotateCcw size={13}/> History
            </button>
            <button onClick={handleSaveDraft} disabled={saving || !isDirty}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              <RefreshCw size={13} className={saving ? 'animate-spin' : ''}/> Save Draft
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || (justPublished && !isDirty)}
              title={justPublished && !isDirty ? 'No changes since last publish' : undefined}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload size={13}/> {publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Flow list sidebar (editor tab only) */}
        {tab === 'editor' && (
          <div className="w-52 bg-white border-r border-gray-200 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Flows</span>
              <button onClick={() => setShowNewFlow(true)}
                className="text-indigo-500 hover:text-indigo-700"><Plus size={14}/></button>
            </div>

            {showNewFlow && (
              <div className="px-2 py-2 border-b border-gray-100 flex gap-1">
                <input value={newFlowName} onChange={(e) => setNewFlowName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFlow()}
                  placeholder="Flow name" autoFocus
                  className="flex-1 border border-gray-200 rounded px-1.5 py-1 text-xs" />
                <button onClick={handleCreateFlow}
                  className="text-indigo-500 hover:text-indigo-700"><Check size={14}/></button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {flows.map((f) => {
                const isActive = activeFlow?.flow_id === f.flow_id;
                const thisDids = flowDids.filter((d) => d.flow_id === f.flow_id);
                const isAssigning = quickAssignFlowId === f.flow_id;
                return (
                  <div key={f.flow_id}
                    className={cn('border-b border-gray-50', isActive && 'bg-indigo-50 border-indigo-100')}>
                    <button
                      onClick={() => setActiveFlow(f)}
                      className="w-full text-left px-3 py-2.5 text-xs hover:bg-gray-50 transition-colors"
                    >
                      <p className={cn('font-medium truncate', isActive && 'text-indigo-700')}>{f.name}</p>
                      {f.published_version_number ? (
                        <p className="text-[10px] text-green-600 mt-0.5">v{f.published_version_number} published</p>
                      ) : (
                        <p className="text-[10px] text-gray-400 mt-0.5">Draft only</p>
                      )}
                    </button>

                    {/* Assigned extensions/DIDs for this flow */}
                    {isActive && (
                      <div className="px-3 pb-2 space-y-1">
                        {thisDids.length > 0 ? (
                          thisDids.map((d) => (
                            <div key={d.route_id}
                              className="flex items-center justify-between bg-white border border-green-200 rounded px-2 py-1 group">
                              <span className="flex items-center gap-1 text-[10px] font-mono text-green-700 font-semibold">
                                <PhoneCall size={10} />
                                {d.destination}
                              </span>
                              <span className="text-[9px] text-gray-400">
                                {d.route_type === 'internal' ? 'SIP ext' : d.route_type === 'public' ? 'DID' : 'SIP+DID'}
                              </span>
                              <button
                                title="Remove this route"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await deleteDid(d.route_id, d.domain_uuid);
                                    setFlowDids((prev) => prev.filter((x) => x.route_id !== d.route_id));
                                    showToast('Route removed');
                                  } catch (err: unknown) {
                                    showToast((err as Error).message || 'Delete failed', 'err');
                                  }
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded text-red-400 hover:bg-red-50 hover:text-red-600 ml-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ))
                        ) : f.published_version_number ? (
                          <p className="text-[10px] text-amber-600 flex items-center gap-1">
                            <PhoneCall size={10} /> No extension assigned yet
                          </p>
                        ) : null}

                        {/* Quick-assign button */}
                        {f.published_version_number && !isAssigning && (
                          <button
                            onClick={() => { setQuickAssignFlowId(f.flow_id); setQuickDest(''); }}
                            className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 mt-0.5">
                            <Plus size={10} /> Assign extension / DID
                          </button>
                        )}

                        {/* Quick-assign form */}
                        {isAssigning && (
                          <div className="space-y-1 pt-1">
                            <input
                              autoFocus
                              value={quickDest}
                              onChange={(e) => setQuickDest(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleQuickAssign()}
                              placeholder="e.g. 8000"
                              className="w-full border border-indigo-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                            <select
                              value={quickRouteType}
                              onChange={(e) => setQuickRouteType(e.target.value as RouteType)}
                              className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-[10px]"
                            >
                              <option value="internal">SIP Extension (internal only)</option>
                              <option value="public">DID (PSTN incoming only)</option>
                              <option value="both">Both (SIP + PSTN)</option>
                            </select>
                            <div className="flex gap-1">
                              <button
                                onClick={handleQuickAssign}
                                disabled={quickAssigning || !quickDest.trim()}
                                className="flex-1 bg-indigo-600 text-white text-[10px] rounded py-1 hover:bg-indigo-700 disabled:opacity-40">
                                {quickAssigning ? '…' : 'Assign'}
                              </button>
                              <button
                                onClick={() => setQuickAssignFlowId(null)}
                                className="px-2 border rounded text-[10px] text-gray-500 hover:bg-gray-100">
                                ✕
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Hint if not published */}
                        {!f.published_version_number && (
                          <p className="text-[10px] text-gray-400 italic">Publish first to assign</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {flows.length === 0 && selectedDomain && (
                <p className="text-xs text-gray-400 px-3 py-4 text-center">No flows yet</p>
              )}
            </div>
          </div>
        )}

        {/* Tab content */}
        {tab === 'editor' ? (
          activeFlow ? (
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {/* Loading overlay */}
              {loadingFlow && (
                <div className="absolute inset-0 bg-white/70 z-30 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-indigo-600 text-sm font-medium">
                    <RefreshCw size={16} className="animate-spin" /> Loading flow…
                  </div>
                </div>
              )}
              {/* "Editing from published version" notice */}
              {editingFromPublished && !loadingFlow && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2 text-xs text-amber-800 shrink-0">
                  <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                  <span>
                    No saved draft found — canvas loaded from the published version.
                    Make changes and click <strong>Save Draft</strong> to create a new draft.
                  </span>
                </div>
              )}
              <FlowEditor />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              {selectedDomain ? 'Select or create a flow to start editing' : 'Select a domain to get started'}
            </div>
          )
        ) : tab === 'dids' ? (
          <DidsTab domainUuid={selectedDomain?.domain_uuid} flows={flows} dids={dids} onRefresh={loadDids} showToast={showToast} />
        ) : tab === 'secrets' ? (
          <SecretsTab domainUuid={selectedDomain?.domain_uuid} secrets={secrets} onRefresh={loadSecrets} showToast={showToast} />
        ) : (
          <div className="flex-1 p-8 text-gray-400 text-sm">Call logs coming soon</div>
        )}
      </div>

      {/* Templates modal */}
      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onLoad={handleLoadTemplate}
        />
      )}

      {/* Version history modal */}
      {showVersions && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-96 p-5">
            <h3 className="font-semibold text-sm mb-3">Version History — {activeFlow?.name}</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {versions.map((v) => (
                <div key={v.version_id} className="flex items-center justify-between border rounded p-2">
                  <div>
                    <p className="text-xs font-medium">v{v.version_number}
                      <span className={cn('ml-2 px-1.5 py-0.5 rounded text-[10px]',
                        v.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      )}>{v.status}</span>
                    </p>
                    <p className="text-[10px] text-gray-400">{new Date(v.published_at).toLocaleString()}</p>
                  </div>
                  {v.status === 'archived' && (
                    <button onClick={() => handleRollback(v.version_id)}
                      className="text-xs text-indigo-600 hover:underline">Restore</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setShowVersions(false)}
              className="mt-4 w-full text-xs text-gray-500 hover:text-gray-700">Close</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-5 right-5 px-4 py-2.5 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 z-50',
          toast.type === 'ok' ? 'bg-green-600' : 'bg-red-600'
        )}>
          {toast.type === 'ok' ? <Check size={14}/> : <AlertTriangle size={14}/>}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Extensions / DID Management Tab ──────────────────────────────────────────
function DidsTab({ domainUuid, flows, dids, onRefresh, showToast }: {
  domainUuid?: string; flows: Flow[]; dids: DidRoute[];
  onRefresh: () => void; showToast: (m: string, t?: 'ok'|'err') => void;
}) {
  const [dest, setDest] = useState('');
  const [flowId, setFlowId] = useState('');
  const [routeType, setRouteType] = useState<RouteType>('internal');

  const handleAssign = async () => {
    if (!domainUuid || !dest || !flowId) return;
    try {
      await assignDid({ domainUuid, destination: dest, flowId, routeType });
      setDest(''); setFlowId('');
      onRefresh();
      showToast(`${dest} assigned — dialplan updated live`);
    } catch (e: unknown) { showToast((e as Error).message, 'err'); }
  };

  const ROUTE_TYPE_LABELS: Record<RouteType, { label: string; badge: string; color: string }> = {
    internal: { label: 'SIP Extension',  badge: 'SIP ext',  color: 'bg-blue-100 text-blue-700' },
    public:   { label: 'External DID',   badge: 'DID',      color: 'bg-purple-100 text-purple-700' },
    both:     { label: 'SIP + PSTN',     badge: 'SIP+DID',  color: 'bg-indigo-100 text-indigo-700' },
  };

  return (
    <div className="flex-1 p-6 overflow-auto max-w-3xl">
      <h2 className="font-semibold text-base mb-1">Extensions &amp; DIDs</h2>
      <p className="text-xs text-gray-400 mb-5">
        Assign a number to an IVR flow. FreeSWITCH dialplan is updated instantly — no reload needed.
      </p>

      {/* How-to callout */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-xs text-blue-800 space-y-1">
        <p className="font-semibold">How to call your IVR from a SIP phone:</p>
        <ol className="list-decimal ml-4 space-y-0.5 text-blue-700">
          <li>Pick any free extension number (e.g. <span className="font-mono bg-blue-100 px-1 rounded">8000</span>)</li>
          <li>Choose <strong>SIP Extension</strong> as the route type</li>
          <li>Select your published IVR flow</li>
          <li>Click <strong>Assign</strong> — then dial that number from any SIP phone</li>
        </ol>
      </div>

      {domainUuid ? <>
        {/* Assignment form */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-gray-700 mb-3">New Assignment</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Extension / DID Number
              </label>
              <input
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAssign()}
                placeholder="8000"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Route Type</label>
              <select
                value={routeType}
                onChange={(e) => setRouteType(e.target.value as RouteType)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="internal">SIP Extension (internal calls only)</option>
                <option value="public">External DID (PSTN incoming only)</option>
                <option value="both">Both (SIP + PSTN)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 block mb-1">IVR Flow (must be published)</label>
              <select
                value={flowId}
                onChange={(e) => setFlowId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Select flow…</option>
                {flows.filter((f) => f.published_version_number).map((f) => (
                  <option key={f.flow_id} value={f.flow_id}>{f.name} (v{f.published_version_number})</option>
                ))}
                {flows.filter((f) => !f.published_version_number).length > 0 && (
                  <optgroup label="── Not yet published (publish first) ──">
                    {flows.filter((f) => !f.published_version_number).map((f) => (
                      <option key={f.flow_id} value={f.flow_id} disabled>{f.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <button
              onClick={handleAssign}
              disabled={!dest || !flowId}
              className="bg-indigo-600 text-white px-5 py-1.5 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap"
            >
              Assign
            </button>
          </div>
        </div>

        {/* Existing routes */}
        {dids.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No routes assigned yet</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-xs text-gray-500 text-left">
                <th className="py-2 pr-4">Number</th>
                <th className="py-2 pr-4">Flow</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dids.map((d) => {
                const meta = ROUTE_TYPE_LABELS[d.route_type] || ROUTE_TYPE_LABELS.internal;
                return (
                  <tr key={d.route_id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 font-mono font-medium">{d.destination}</td>
                    <td className="py-2 pr-4">{d.flow_name}</td>
                    <td className="py-2 pr-4">
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', meta.color)}>
                        {meta.badge}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={cn('px-2 py-0.5 rounded text-xs',
                        d.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      )}>{d.enabled ? 'Active' : 'Disabled'}</span>
                    </td>
                    <td className="py-2">
                      <button
                        title="Remove route"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await deleteDid(d.route_id, d.domain_uuid);
                            onRefresh();
                            showToast('Route removed');
                          } catch (err: unknown) {
                            showToast((err as Error).message || 'Delete failed', 'err');
                          }
                        }}
                        className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 size={14}/>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </> : <p className="text-gray-400 text-sm">Select a domain first</p>}
    </div>
  );
}

// ── Secrets Tab ───────────────────────────────────────────────────────────────
function SecretsTab({ domainUuid, secrets, onRefresh, showToast }: {
  domainUuid?: string; secrets: Secret[];
  onRefresh: () => void; showToast: (m: string, t?: 'ok'|'err') => void;
}) {
  const [key, setKey] = useState('');
  const [val, setVal] = useState('');

  const handleSave = async () => {
    if (!domainUuid || !key || !val) return;
    try {
      await upsertSecret({ domainUuid, keyName: key, value: val });
      setKey(''); setVal('');
      onRefresh(); showToast('Secret saved (encrypted)');
    } catch (e: unknown) { showToast((e as Error).message, 'err'); }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h2 className="font-semibold text-base mb-1">API Secrets</h2>
      <p className="text-xs text-gray-400 mb-4">Referenced in nodes as <code className="bg-gray-100 px-1 rounded">{'{{secret:key_name}}'}</code></p>
      {domainUuid ? <>
        <div className="flex gap-3 mb-6 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Key Name</label>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="crm_api_token"
              className="border border-gray-200 rounded px-2 py-1.5 text-sm w-44 font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Value (encrypted on save)</label>
            <input type="password" value={val} onChange={(e) => setVal(e.target.value)}
              placeholder="sk-…"
              className="border border-gray-200 rounded px-2 py-1.5 text-sm w-64" />
          </div>
          <button onClick={handleSave}
            className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm hover:bg-indigo-700">Save</button>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead><tr className="border-b text-xs text-gray-500 text-left">
            <th className="py-2 pr-4">Key Name</th>
            <th className="py-2 pr-4">Created</th>
            <th className="py-2 pr-4">Updated</th>
            <th className="py-2">Actions</th>
          </tr></thead>
          <tbody>
            {secrets.map((s) => (
              <tr key={s.secret_id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4 font-mono text-indigo-600">{s.key_name}</td>
                <td className="py-2 pr-4 text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString()}</td>
                <td className="py-2 pr-4 text-xs text-gray-400">{new Date(s.updated_at).toLocaleDateString()}</td>
                <td className="py-2">
                  <button onClick={async () => {
                    await deleteSecret(s.secret_id, domainUuid!);
                    onRefresh(); showToast('Secret deleted');
                  }} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </> : <p className="text-gray-400 text-sm">Select a domain first</p>}
    </div>
  );
}
