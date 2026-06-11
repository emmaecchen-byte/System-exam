import api from './client';
import type { AnswerPayload, AttemptDetail } from './candidate';

export type { AnswerPayload, AttemptDetail, ExamQuestion } from './candidate';

export function fetchStudentAttempt(attemptId: string) {
  return api.get<AttemptDetail>(`/student/attempts/${attemptId}`);
}

export function autoSaveStudentAttempt(
  attemptId: string,
  data: { answers: AnswerPayload[]; currentQuestionIndex?: number },
) {
  return api.post(`/student/attempts/${attemptId}/auto-save`, data);
}

export function saveStudentAttemptAnswers(
  attemptId: string,
  data: { answers: AnswerPayload[]; currentQuestionIndex?: number },
) {
  return api.put(`/student/attempts/${attemptId}/answers`, data);
}

export function submitStudentAttempt(attemptId: string, submitType: 'MANUAL' | 'TIMEOUT' = 'MANUAL') {
  return api.post(`/student/attempts/${attemptId}/submit`, { submitType });
}

export interface StudentAuditEventPayload {
  eventType: string;
  timestamp?: string;
  action?: string;
  duration_seconds?: number;
  metadata?: Record<string, unknown>;
}

export function postStudentAttemptAuditEvent(attemptId: string, payload: StudentAuditEventPayload) {
  return api.post(`/student/attempts/${attemptId}/audit-event`, payload);
}
