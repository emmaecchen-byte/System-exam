import api from './client';

export interface AuditLogRow {
  id: string;
  timestamp: string;
  actorId: string | null;
  actorName: string;
  actorEmployeeNo: string | null;
  actorRole: string | null;
  action: string;
  actionKey: string;
  actionLabel: string;
  actionCategory: string;
  objectType: string;
  objectId: string | null;
  objectName: string | null;
  beforeData: unknown;
  afterData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: { browser?: string; os?: string } | null;
  reason: string | null;
}

export interface AuditLogsQuery {
  page?: number;
  pageSize?: number;
  actorId?: string;
  actions?: string[];
  actionCategory?: string;
  objectType?: string;
  search?: string;
  from?: string;
  to?: string;
}

function serializeQuery(params: AuditLogsQuery): Record<string, string | number | undefined> {
  const { actions, ...rest } = params;
  const out: Record<string, string | number | undefined> = { ...rest };
  if (actions?.length) out.actions = actions.join(',');
  return out;
}

export function fetchAuditLogs(params: AuditLogsQuery) {
  return api.get<{ data: AuditLogRow[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
    '/admin/audit-logs',
    { params: serializeQuery(params) },
  );
}

export function fetchAuditActions() {
  return api.get<{
    actions: Array<{ value: string; label: string; category: string }>;
    categories: Array<{ value: string; label: string }>;
    objectTypes: string[];
  }>('/admin/audit-logs/actions');
}

export function fetchAuditActors() {
  return api.get<Array<{ id: string; name: string; employeeNo: string }>>('/admin/audit-logs/actors');
}

export async function exportAuditLogs(params: AuditLogsQuery, format: 'xlsx' | 'json' = 'xlsx') {
  const response = await api.get('/admin/audit-logs/export', {
    params: { ...serializeQuery(params), format },
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? `audit_logs.${format}`;
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = decodeURIComponent(filename);
  link.click();
  window.URL.revokeObjectURL(url);
}

export function logCandidateAuditEvent(attemptId: string, eventType: 'PAGE_LEAVE' | 'SCREEN_SWITCH') {
  return api.post(`/candidate/attempts/${attemptId}/audit-event`, { eventType });
}
