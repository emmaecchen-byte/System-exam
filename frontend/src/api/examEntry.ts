import api from './client';

export type ExamEntryStatus =
  | 'ok'
  | 'invalid'
  | 'expired'
  | 'invalidated'
  | 'login_required'
  | 'unauthorized'
  | 'completed'
  | 'exam_unavailable'
  | 'scan_limit_reached';

export interface ExamEntryInfo {
  status: ExamEntryStatus;
  message?: string;
  examId?: string;
  sessionId?: string;
  examTitle?: string;
  examDescription?: string | null;
  sessionName?: string;
  durationMinutes?: number;
  passScore?: number;
  instructions?: string[];
  sessionStartTime?: string;
  sessionEndTime?: string;
  withinTimeWindow?: boolean;
  canStart?: boolean;
  inProgressAttemptId?: string;
  requiresLogin?: boolean;
}

export function previewExamEntry(token: string) {
  return api.get<ExamEntryInfo>('/public/exam-entry', { params: { token } });
}

export function verifyExamEntry(token: string) {
  return api.post<ExamEntryInfo>('/public/exam-entry/verify', { token });
}
