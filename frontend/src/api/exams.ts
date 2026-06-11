import api from './client';

export interface ExamListItem {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  category: { id: string; name: string };
  paperId: string;
  paper: { id: string; title: string; version: number; totalScore: number; label: string } | null;
  passScore: number;
  durationMinutes: number;
  allowRetake: boolean;
  maxAttempts: number;
  randomQuestionOrder: boolean;
  randomOptionOrder: boolean;
  status: string;
  statusLabel: string;
  sessionCount: number;
  participantCount: number;
  isEditable: boolean;
  updatedAt: string;
}

export type QrCodeStatus = 'none' | 'active' | 'expired' | 'invalidated';

export interface ExamSession {
  id: string;
  examId: string;
  name: string;
  startTime: string;
  endTime: string;
  location: string | null;
  notes: string | null;
  status: string;
  statusLabel: string;
  participantCount: number;
  qrExpiresAt?: string | null;
  qrCreatedAt?: string | null;
  qrIsValid?: boolean;
  qrInvalidatedAt?: string | null;
  qrInvalidatedById?: string | null;
  hasQrToken?: boolean;
  qrStatus?: QrCodeStatus;
}

export interface ExamDetail extends ExamListItem {
  sessions: ExamSession[];
  showResultToCandidate: boolean;
  showAnswersToCandidate: boolean;
  resultsPublishedAt: string | null;
  resultsPublishedBy: { id: string; name: string } | null;
  resultsPublished: boolean;
  publishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
}

export interface ExamFormData {
  title: string;
  description?: string;
  categoryId: string;
  paperId: string;
  passScore: number;
  durationMinutes: number;
  allowRetake: boolean;
  maxAttempts: number;
  randomQuestionOrder: boolean;
  randomOptionOrder: boolean;
  showResultToCandidate?: boolean;
  showAnswersToCandidate?: boolean;
}

export interface SessionFormData {
  name: string;
  startTime: string;
  endTime: string;
  location?: string;
  notes?: string;
}

export function fetchExams(params: Record<string, unknown>) {
  return api.get<{ data: ExamListItem[]; meta: { total: number } }>('/admin/exams', { params });
}

export function fetchExam(id: string) {
  return api.get<ExamDetail>(`/admin/exams/${id}`);
}

export function createExam(data: ExamFormData) {
  return api.post<ExamListItem>('/admin/exams', data);
}

export function updateExam(id: string, data: Partial<ExamFormData>) {
  return api.put<ExamListItem>(`/admin/exams/${id}`, data);
}

export function deleteExam(id: string) {
  return api.delete(`/admin/exams/${id}`);
}

export function publishExam(id: string) {
  return api.post(`/admin/exams/${id}/publish`);
}

export function closeExam(id: string) {
  return api.post(`/admin/exams/${id}/close`);
}

export function archiveExam(id: string) {
  return api.post(`/admin/exams/${id}/archive`);
}

export function publishExamResults(id: string) {
  return api.post<{ success: boolean; publishedAt: string }>(`/admin/exams/${id}/publish-results`);
}

export function unpublishExamResults(id: string) {
  return api.post<{ success: boolean }>(`/admin/exams/${id}/unpublish-results`);
}

export function fetchExamSessions(examId: string) {
  return api.get<ExamSession[]>(`/admin/exams/${examId}/sessions`);
}

export function createSession(examId: string, data: SessionFormData) {
  return api.post<ExamSession>(`/admin/exams/${examId}/sessions`, data);
}

export function updateSession(sessionId: string, data: Partial<SessionFormData>) {
  return api.put<ExamSession>(`/admin/sessions/${sessionId}`, data);
}

export function deleteSession(sessionId: string) {
  return api.delete(`/admin/sessions/${sessionId}`);
}

export function addSessionParticipants(
  sessionId: string,
  data: {
    targetType: 'ALL' | 'DEPARTMENTS' | 'USERS';
    departmentIds?: string[];
    userIds?: string[];
  },
) {
  return api.post(`/admin/sessions/${sessionId}/add-participants`, data);
}

export function fetchSession(sessionId: string) {
  return api.get<ExamSession>(`/admin/sessions/${sessionId}`);
}

export function fetchSessionParticipants(sessionId: string) {
  return api.get(`/admin/sessions/${sessionId}/participants`);
}

export interface QrCodeResponse {
  entryUrl: string;
  entryPath: string;
  token?: string;
  expiresAt: string;
  createdAt?: string | null;
  maxScans?: number | null;
  qrStatus?: QrCodeStatus;
  qrDataUrl: string;
  qrPngDataUrl: string;
  qrImageUrl?: string;
}

export interface GenerateQrPayload {
  candidateId?: string;
  expiresAt?: string;
  validityDays?: number;
  expiresInHours?: number;
  maxScans?: number;
}

export function generateSessionQr(sessionId: string, data?: GenerateQrPayload) {
  return api.post<QrCodeResponse>(`/admin/sessions/${sessionId}/generate-qr`, data ?? {});
}

export function fetchSessionQr(sessionId: string) {
  return api.get<QrCodeResponse>(`/admin/sessions/${sessionId}/qr-code`);
}

export function revokeSessionQr(sessionId: string) {
  return api.delete(`/admin/sessions/${sessionId}/qr-token`);
}

export function fetchDepartments() {
  return api.get<Array<{ id: string; name: string }>>('/admin/users/departments');
}

export function searchCandidates(q: string) {
  return api.get<Array<{ id: string; name: string; employeeNo: string; department: { name: string } | null }>>(
    '/admin/users/candidates/search',
    { params: { q } },
  );
}
