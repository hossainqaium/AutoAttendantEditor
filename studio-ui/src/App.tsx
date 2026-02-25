// =============================================================================
// IVR Studio: Main Application
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlowEditor } from './components/FlowEditor';
import { useFlowStore } from './store/flowStore';
import {
  getDomains, getFlows, getFlow, createFlow, saveFlow, publishFlow,
  rollbackFlow, getVersions, getVersionFull, getDids, assignDid, deleteDid,
  getSecrets, upsertSecret, deleteSecret,
  getExtensions, createExtension, updateExtension, deleteExtension,
  getCdr,
  type Flow, type IvrVersion, type DidRoute, type Secret, type Extension,
  type CdrRecord,
} from './api/client';
import { validateAndCompile } from './compiler/graphCompiler';
import {
  Phone, GitBranch, RefreshCw, Check, AlertTriangle,
  Plus, Upload, RotateCcw, Trash2, Key, List, LayoutTemplate, PhoneCall, Music, UserPlus, Pencil,
} from 'lucide-react';
import { cn } from './lib/utils';
import { TemplatesModal } from './components/TemplatesModal';
import { AudioManagerModal } from './components/AudioManagerModal';
import type { IvrTemplate, RouteType } from './api/client';

type Tab = 'editor' | 'extensions' | 'dids' | 'secrets' | 'logs';

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
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [showTemplates, setShowTemplates]       = useState(false);
  const [showAudioManager, setShowAudioManager] = useState(false);
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

  const loadExtensions = async () => {
    if (!selectedDomain) return;
    const list = await getExtensions(selectedDomain.domain_uuid);
    setExtensions(list);
    return list;
  };
  useEffect(() => { if ((tab === 'extensions' || tab === 'logs') && selectedDomain) loadExtensions(); }, [tab, selectedDomain]);

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

        {/* Audio Manager button */}
        <button
          onClick={() => setShowAudioManager(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-emerald-600 border border-emerald-200 hover:bg-emerald-50 transition-colors"
        >
          <Music size={13} /> Audio Files
        </button>

        {/* Tab nav */}
        <nav className="flex gap-1 ml-2">
          {([
            { id: 'editor',     label: 'Editor',     icon: <GitBranch size={13}/> },
            { id: 'extensions', label: 'Extensions', icon: <UserPlus size={13}/> },
            { id: 'dids',       label: 'DIDs',       icon: <Phone size={13}/> },
            { id: 'secrets',    label: 'Secrets',    icon: <Key size={13}/> },
            { id: 'logs',       label: 'Logs',       icon: <List size={13}/> },
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
        ) : tab === 'extensions' ? (
          <ExtensionsTab domainUuid={selectedDomain?.domain_uuid} domains={domains} extensions={extensions} onRefresh={loadExtensions} showToast={showToast} />
        ) : tab === 'dids' ? (
          <DidsTab domainUuid={selectedDomain?.domain_uuid} flows={flows} dids={dids} onRefresh={loadDids} showToast={showToast} />
        ) : tab === 'secrets' ? (
          <SecretsTab domainUuid={selectedDomain?.domain_uuid} secrets={secrets} onRefresh={loadSecrets} showToast={showToast} />
        ) : tab === 'logs' ? (
          <LogsTab domainUuid={selectedDomain?.domain_uuid} extensions={extensions} showToast={showToast} />
        ) : (
          null
        )}
      </div>

      {/* Templates modal */}
      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onLoad={handleLoadTemplate}
        />
      )}

      {/* Audio Manager modal */}
      {showAudioManager && selectedDomain && (
        <AudioManagerModal
          domainUuid={selectedDomain.domain_uuid}
          onClose={() => setShowAudioManager(false)}
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

// ── Extensions Tab ──────────────────────────────────────────────────────────
function ExtensionsTab({
  domainUuid,
  domains,
  extensions,
  onRefresh,
  showToast,
}: {
  domainUuid?: string;
  domains: import('./api/client').Domain[];
  extensions: Extension[];
  onRefresh: () => void;
  showToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Extension | null>(null);
  const [formDomainUuid, setFormDomainUuid] = useState(domainUuid || '');
  const [extension, setExtension] = useState('');
  const [password, setPassword] = useState('');
  const [callerIdName, setCallerIdName] = useState('');
  const [callerIdNumber, setCallerIdNumber] = useState('');
  const [context, setContext] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [voicemailEnabled, setVoicemailEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Extension | null>(null);
  const [deleting, setDeleting] = useState(false);

  // When the selected domain changes from the outside, update the form default
  useEffect(() => {
    if (!editing) {
      setFormDomainUuid(domainUuid || '');
      const d = domains.find((x) => x.domain_uuid === domainUuid);
      setContext(d?.domain_name || '');
    }
  }, [domainUuid]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the in-form domain dropdown changes, auto-fill context with that domain's name
  const handleFormDomainChange = (uuid: string) => {
    setFormDomainUuid(uuid);
    const d = domains.find((x) => x.domain_uuid === uuid);
    setContext(d?.domain_name || '');
  };

  const resetForm = () => {
    setEditing(null);
    setFormDomainUuid(domainUuid || '');
    setExtension('');
    setPassword('');
    setCallerIdName('');
    setCallerIdNumber('');
    const d = domains.find((x) => x.domain_uuid === domainUuid);
    setContext(d?.domain_name || '');
    setDescription('');
    setEnabled(true);
    setVoicemailEnabled(true);
    setShowForm(false);
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (ext: Extension) => {
    setEditing(ext);
    setFormDomainUuid(ext.domain_uuid);
    setExtension(ext.extension);
    setPassword('');
    setCallerIdName(ext.effective_caller_id_name || '');
    setCallerIdNumber(ext.effective_caller_id_number || '');
    setContext(ext.context || ext.domain_name || '');
    setDescription(ext.description || '');
    setEnabled(ext.enabled === true || ext.enabled === 'true');
    setVoicemailEnabled(ext.voicemail_enabled !== false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formDomainUuid) {
      showToast('Select a domain', 'err');
      return;
    }
    if (!extension.trim()) {
      showToast('Extension number is required', 'err');
      return;
    }
    if (!editing && !password.trim()) {
      showToast('Password is required for new extension', 'err');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateExtension(editing.extension_uuid, {
          domainUuid: formDomainUuid,
          extension: extension.trim(),
          ...(password.trim() ? { password: password.trim() } : {}),
          effective_caller_id_name: callerIdName.trim() || undefined,
          effective_caller_id_number: callerIdNumber.trim() || undefined,
          description: description.trim() || undefined,
          enabled,
          user_context: context.trim() || undefined,
          voicemail_enabled: voicemailEnabled,
        });
        showToast('Extension updated');
      } else {
        await createExtension({
          domainUuid: formDomainUuid,
          extension: extension.trim(),
          password: password.trim(),
          effective_caller_id_name: callerIdName.trim() || extension.trim(),
          effective_caller_id_number: callerIdNumber.trim() || undefined,
          description: description.trim() || undefined,
          enabled,
          user_context: context.trim() || undefined,
          voicemail_enabled: voicemailEnabled,
        });
        showToast('Extension added');
      }
      resetForm();
      onRefresh();
    } catch (e: unknown) {
      showToast((e as Error).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm || !domainUuid) return;
    setDeleting(true);
    try {
      await deleteExtension(deleteConfirm.extension_uuid, domainUuid);
      setDeleteConfirm(null);
      onRefresh();
      showToast('Extension deleted');
    } catch (e: unknown) {
      showToast((e as Error).message, 'err');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto max-w-4xl">
      <h2 className="font-semibold text-base mb-1">Extensions</h2>
      <p className="text-xs text-gray-400 mb-4">
        Manage FusionPBX SIP extensions. Add, edit, or remove extensions for this domain.
      </p>

      {domainUuid ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {showForm && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
              <p className="text-xs font-semibold text-gray-700 mb-3">
                {editing ? 'Edit Extension' : 'New Extension'}
              </p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Domain</label>
                  <select
                    value={formDomainUuid}
                    onChange={(e) => handleFormDomainChange(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    disabled={!!editing}
                  >
                    <option value="">Select domain…</option>
                    {domains.map((d) => (
                      <option key={d.domain_uuid} value={d.domain_uuid}>{d.domain_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Context
                    <span className="ml-1 text-gray-400 font-normal">(defaults to domain)</span>
                  </label>
                  <input
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="e.g. 192.168.0.113"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Extension number</label>
                  <input
                    value={extension}
                    onChange={(e) => setExtension(e.target.value)}
                    placeholder="e.g. 1001"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full font-mono"
                    disabled={!!editing}
                  />
                </div>
                {!editing && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="SIP password"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full"
                    />
                  </div>
                )}
                {editing && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">New password (leave blank to keep)</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Optional"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full"
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Caller ID name</label>
                  <input
                    value={callerIdName}
                    onChange={(e) => setCallerIdName(e.target.value)}
                    placeholder="Display name"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Caller ID number</label>
                  <input
                    value={callerIdNumber}
                    onChange={(e) => setCallerIdNumber(e.target.value)}
                    placeholder="Optional"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ext-enabled"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="ext-enabled" className="text-xs text-gray-600">Enabled</label>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ext-voicemail"
                    checked={voicemailEnabled}
                    onChange={(e) => setVoicemailEnabled(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="ext-voicemail" className="text-xs text-gray-600">Voicemail enabled</label>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editing ? 'Update' : 'Add'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {extensions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No extensions yet. Click Add to create one.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-xs text-gray-500 text-left">
                  <th className="py-2 pr-4">Extension</th>
                  <th className="py-2 pr-4">Caller ID Name</th>
                  <th className="py-2 pr-4">Domain</th>
                  <th className="py-2 pr-4">Context</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {extensions.map((ext) => (
                  <tr key={ext.extension_uuid} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 font-mono font-semibold text-indigo-700">{ext.extension}</td>
                    <td className="py-2 pr-4">{ext.effective_caller_id_name || '—'}</td>
                    <td className="py-2 pr-4 text-gray-500 text-xs">{ext.domain_name || '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-gray-500">{ext.context || '—'}</td>
                    <td className="py-2 flex gap-1">
                      <button
                        title="Edit"
                        onClick={() => openEdit(ext)}
                        className="p-1.5 rounded text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => setDeleteConfirm(ext)}
                        className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full mx-4">
                <p className="font-medium text-sm text-gray-800 mb-1">Delete extension?</p>
                <p className="text-xs text-gray-500 mb-4">
                  Extension <span className="font-mono font-semibold">{deleteConfirm.extension}</span> will be removed from FusionPBX. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    disabled={deleting}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-gray-400 text-sm">Select a domain first</p>
      )}
    </div>
  );
}

// ── Logs Tab (FusionPBX CDR) ─────────────────────────────────────────────────
function LogsTab({
  domainUuid,
  extensions,
  showToast,
}: {
  domainUuid?: string;
  extensions: Extension[];
  showToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>([]);
  const [cdrRows, setCdrRows] = useState<CdrRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDateForInput = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  };

  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    if (!startDateTime) setStartDateTime(formatDateForInput(start));
    if (!endDateTime) setEndDateTime(formatDateForInput(now));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = async () => {
    if (!domainUuid) {
      showToast('Select a domain first', 'err');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const rows = await getCdr(domainUuid, {
        startDateTime: startDateTime || undefined,
        endDateTime: endDateTime || undefined,
        extensions: selectedExtensions.length > 0 ? selectedExtensions : undefined,
      });
      setCdrRows(rows);
      showToast(rows.length === 0 ? 'No CDR records found' : `${rows.length} call(s) found`);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      const displayMsg = msg;
      setError(displayMsg);
      setCdrRows([]);
      showToast(displayMsg, 'err');
    } finally {
      setLoading(false);
    }
  };

  const [extDropdownOpen, setExtDropdownOpen] = useState(false);
  const [extSearch, setExtSearch] = useState('');
  const extDropdownRef = useRef<HTMLDivElement>(null);

  const toggleExtension = (ext: string) => {
    setSelectedExtensions((prev) =>
      prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext]
    );
  };

  const filteredExtensions = useMemo(() => {
    if (!extSearch.trim()) return extensions;
    const q = extSearch.trim().toLowerCase();
    return extensions.filter(
      (e) =>
        e.extension.toLowerCase().includes(q) ||
        (e.effective_caller_id_name?.toLowerCase().includes(q) ?? false)
    );
  }, [extensions, extSearch]);

  useEffect(() => {
    if (!extDropdownOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      if (extDropdownRef.current && !extDropdownRef.current.contains(ev.target as Node)) {
        setExtDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [extDropdownOpen]);

  const formatStamp = (s: string | null) => {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
    } catch {
      return s;
    }
  };

  if (!domainUuid) {
    return (
      <div className="flex-1 p-8 text-gray-400 text-sm">Select a domain to view call logs (CDR)</div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h2 className="font-semibold text-base mb-1">Call Logs (CDR)</h2>
      <p className="text-xs text-gray-400 mb-5">
        Filter by start/end datetime and extensions, then click Apply to load FusionPBX call detail records.
      </p>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Start date & time</label>
            <input
              type="datetime-local"
              value={startDateTime}
              onChange={(e) => setStartDateTime(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">End date & time</label>
            <input
              type="datetime-local"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>
        <div className="mb-4" ref={extDropdownRef}>
          <label className="text-xs font-medium text-gray-600 block mb-2">Extensions (optional — leave empty for all)</label>
          {/* Selected extensions as chips on top */}
          {selectedExtensions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedExtensions.map((extNum) => {
                const ext = extensions.find((e) => e.extension === extNum);
                return (
                  <span
                    key={extNum}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-xs font-mono"
                  >
                    {extNum}
                    {ext?.effective_caller_id_name && ext.effective_caller_id_name !== extNum && (
                      <span className="text-indigo-600 truncate max-w-[60px]">({ext.effective_caller_id_name})</span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleExtension(extNum)}
                      className="ml-0.5 text-indigo-500 hover:text-indigo-700 focus:outline-none"
                      aria-label={`Remove ${extNum}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {/* Dropdown with search and reset */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExtDropdownOpen((o) => !o)}
              className="w-full sm:max-w-xs flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-left bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <span className="text-gray-600 truncate">
                {extensions.length === 0
                  ? 'No extensions'
                  : selectedExtensions.length === 0
                    ? 'Select extensions…'
                    : `${selectedExtensions.length} selected`}
              </span>
              <span className={cn('text-gray-400 transition-transform', extDropdownOpen && 'rotate-180')}>▾</span>
            </button>
            {extDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 w-full sm:max-w-xs border border-gray-200 rounded-lg bg-white shadow-lg py-1 max-h-64 flex flex-col">
                <div className="p-1.5 border-b border-gray-100">
                  <input
                    type="text"
                    placeholder="Search extensions…"
                    value={extSearch}
                    onChange={(e) => setExtSearch(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                {selectedExtensions.length > 0 && (
                  <div className="px-2 py-1 border-b border-gray-100">
                    <button
                      type="button"
                      onClick={() => setSelectedExtensions([])}
                      className="text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      Reset — unselect all
                    </button>
                  </div>
                )}
                <div className="overflow-y-auto min-h-0 flex-1">
                  {filteredExtensions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">No extensions match</p>
                  ) : (
                    filteredExtensions.map((ext) => {
                      const isSelected = selectedExtensions.includes(ext.extension);
                      return (
                        <button
                          key={ext.extension_uuid}
                          type="button"
                          onClick={() => toggleExtension(ext.extension)}
                          className={cn(
                            'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50',
                            isSelected && 'bg-indigo-50 text-indigo-700'
                          )}
                        >
                          <span className="font-mono">{ext.extension}</span>
                          {ext.effective_caller_id_name && ext.effective_caller_id_name !== ext.extension && (
                            <span className="text-gray-500 truncate">{ext.effective_caller_id_name}</span>
                          )}
                          {isSelected && <span className="ml-auto text-indigo-500">✓</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleApply}
          disabled={loading}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Apply'}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {/* CDR table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {cdrRows.length === 0 && !loading ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Set filters and click Apply to load call records
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="border-b text-xs text-gray-500 text-left">
                  <th className="py-2 px-2 whitespace-nowrap">Start</th>
                  <th className="py-2 px-2 whitespace-nowrap">Extension</th>
                  <th className="py-2 px-2 whitespace-nowrap">Caller ID Name</th>
                  <th className="py-2 px-2 whitespace-nowrap">Caller ID Number</th>
                  <th className="py-2 px-2 whitespace-nowrap">Destination</th>
                  <th className="py-2 px-2 whitespace-nowrap">Direction</th>
                  <th className="py-2 px-2 whitespace-nowrap">Duration</th>
                  <th className="py-2 px-2 whitespace-nowrap">Hangup</th>
                  <th className="py-2 px-2 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {cdrRows.map((r) => (
                  <tr key={r.sip_call_id} className="border-b hover:bg-gray-50">
                    <td className="py-1.5 px-2 whitespace-nowrap text-gray-700">{formatStamp(r.start_stamp)}</td>
                    <td className="py-1.5 px-2 font-mono text-indigo-700">{r.extension ?? '—'}</td>
                    <td className="py-1.5 px-2 truncate max-w-[120px]" title={r.caller_id_name ?? ''}>{r.caller_id_name ?? '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-gray-700">{r.caller_id_number ?? '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-gray-700">{r.destination_number ?? '—'}</td>
                    <td className="py-1.5 px-2 text-gray-600">{r.direction ?? '—'}</td>
                    <td className="py-1.5 px-2">{r.duration != null ? `${r.duration}s` : '—'}</td>
                    <td className="py-1.5 px-2 text-gray-600">{r.hangup_cause ?? '—'}</td>
                    <td className="py-1.5 px-2 text-gray-600">{r.status ?? r.call_disposition ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
