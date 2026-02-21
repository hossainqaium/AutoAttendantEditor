// =============================================================================
// IVR Studio API Client
// =============================================================================

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  // Only send Content-Type: application/json when there is actually a body
  const hasBody = init?.body !== undefined && init.body !== null;
  const headers: Record<string, string> = hasBody
    ? { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> || {}) }
    : { ...(init?.headers as Record<string, string> || {}) };

  const res = await fetch(`${BASE}${path}`, { ...init, method, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Domains ──────────────────────────────────────────────────────
export const getDomains = () => request<Domain[]>('/domains');

// ── Flows ─────────────────────────────────────────────────────────
export const getFlows = (domainUuid: string) =>
  request<Flow[]>(`/flows?domainUuid=${domainUuid}`);

export const getFlow = (flowId: string, domainUuid: string) =>
  request<Flow>(`/flows/${flowId}?domainUuid=${domainUuid}`);

export const createFlow = (body: { domainUuid: string; name: string; description?: string }) =>
  request<Flow>('/flows', { method: 'POST', body: JSON.stringify(body) });

export const saveFlow = (flowId: string, body: { domainUuid: string; name?: string; draftGraph?: ReactFlowGraph }) =>
  request<Flow>(`/flows/${flowId}`, { method: 'PUT', body: JSON.stringify(body) });

export const deleteFlow = (flowId: string, domainUuid: string) =>
  request<void>(`/flows/${flowId}?domainUuid=${domainUuid}`, { method: 'DELETE' });

export const publishFlow = (flowId: string, body: { domainUuid: string; publishedBy?: string }) =>
  request<{ version: IvrVersion; executionGraph: unknown }>(`/flows/${flowId}/publish`, {
    method: 'POST', body: JSON.stringify(body),
  });

export const rollbackFlow = (flowId: string, versionId: string, body: { domainUuid: string }) =>
  request<{ message: string }>(`/flows/${flowId}/rollback/${versionId}`, {
    method: 'POST', body: JSON.stringify(body),
  });

export const validateFlow = (flowId: string, body: { domainUuid: string; graph?: ReactFlowGraph }) =>
  request<{ ok: boolean; errors: string[] }>(`/flows/${flowId}/validate`, {
    method: 'POST', body: JSON.stringify(body),
  });

// ── Versions ──────────────────────────────────────────────────────
export const getVersions = (flowId: string, domainUuid: string) =>
  request<IvrVersion[]>(`/flows/${flowId}/versions?domainUuid=${domainUuid}`);

export const getVersionFull = (flowId: string, versionId: string, domainUuid: string) =>
  request<IvrVersionFull>(`/flows/${flowId}/versions/${versionId}?domainUuid=${domainUuid}`);

// ── DIDs ─────────────────────────────────────────────────────────
export const getDids = (domainUuid: string) =>
  request<DidRoute[]>(`/dids?domainUuid=${domainUuid}`);

export const assignDid = (body: { domainUuid: string; destination: string; flowId: string; routeType?: RouteType }) =>
  request<DidRoute>('/dids', { method: 'POST', body: JSON.stringify(body) });

export const deleteDid = (routeId: string, domainUuid: string) =>
  request<void>(`/dids/${routeId}?domainUuid=${domainUuid}`, { method: 'DELETE' });

// ── Secrets ───────────────────────────────────────────────────────
export const getSecrets = (domainUuid: string) =>
  request<Secret[]>(`/secrets?domainUuid=${domainUuid}`);

export const upsertSecret = (body: { domainUuid: string; keyName: string; value: string }) =>
  request<Secret>('/secrets', { method: 'PUT', body: JSON.stringify(body) });

export const deleteSecret = (secretId: string, domainUuid: string) =>
  request<void>(`/secrets/${secretId}?domainUuid=${domainUuid}`, { method: 'DELETE' });

// ── Call Logs ─────────────────────────────────────────────────────
export const getCallLogs = (domainUuid: string, flowId?: string, limit = 50, offset = 0) => {
  const qs = new URLSearchParams({ domainUuid, limit: String(limit), offset: String(offset) });
  if (flowId) qs.set('flowId', flowId);
  return request<CallLog[]>(`/call-logs?${qs}`);
};

// ── Assets (FusionPBX recordings & destinations) ──────────────────
export const getRecordings = (domainUuid: string) =>
  request<Recording[]>(`/assets/recordings?domainUuid=${domainUuid}`);

export const getDestinations = (domainUuid: string) =>
  request<Destination[]>(`/assets/destinations?domainUuid=${domainUuid}`);

export const getSounds = (domainUuid: string) =>
  request<SoundCategory[]>(`/assets/sounds?domainUuid=${domainUuid}`);

// ── Templates ─────────────────────────────────────────────────────
export const getTemplates = () => request<IvrTemplate[]>('/templates');

// ── Types ─────────────────────────────────────────────────────────
export interface Domain {
  domain_uuid: string;
  domain_name: string;
  domain_description: string | null;
  domain_enabled: string;
}

export interface Flow {
  flow_id: string;
  domain_uuid: string;
  // draft_graph is now included in the list response
  name: string;
  description: string | null;
  draft_graph: ReactFlowGraph | null;
  draft_updated_at: string | null;
  created_at: string;
  updated_at: string;
  published_version_id?: string | null;
  published_version_number?: number | null;
  published_at?: string | null;
}

export interface IvrVersion {
  version_id: string;
  flow_id: string;
  version_number: number;
  status: 'published' | 'archived';
  published_at: string;
  checksum: string;
}

export interface IvrVersionFull extends IvrVersion {
  raw_graph: ReactFlowGraph | null;
  execution_graph: unknown;
  published_by: string | null;
}

export interface DidRoute {
  route_id: string;
  domain_uuid: string;
  destination: string;
  flow_id: string;
  flow_name: string;
  route_type: 'both' | 'public' | 'internal';
  enabled: boolean;
  created_at: string;
}

export type RouteType = 'both' | 'public' | 'internal';

export interface Secret {
  secret_id: string;
  key_name: string;
  created_at: string;
  updated_at: string;
}

export interface Recording {
  recording_uuid: string;
  recording_filename: string;
  recording_name: string;
  recording_description: string | null;
}

export interface SoundFile {
  path: string;
  label: string;
}

export interface SoundCategory {
  category: string;
  folder: string;
  files: SoundFile[];
}

export interface Destination {
  destination: string;
  label: string;
  type: 'extension' | 'ring_group' | 'queue' | 'voicemail';
  group: string;
}

export interface IvrTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  graph: ReactFlowGraph;
}

export interface CallLog {
  log_id: string;
  call_uuid: string;
  ani: string;
  dnis: string;
  started_at: string;
  ended_at: string | null;
  disposition: string | null;
  duration_secs: number | null;
}

export interface ReactFlowGraph {
  nodes: RFNode[];
  edges: RFEdge[];
}

export interface RFNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface RFEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  data?: { loop?: boolean };
}
