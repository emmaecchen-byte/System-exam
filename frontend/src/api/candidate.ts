import api from './client';

export interface QuestionOption {
  key: string;
  label: string;
}

export interface ExamQuestion {
  id: string;
  type: string;
  stem: string;
  options?: QuestionOption[];
  score: number;
  sortOrder: number;
  answerContent?: Record<string, unknown> | null;
  markedForReview: boolean;
  answered: boolean;
}

export interface AttemptDetail {
  id: string;
  examId: string;
  examTitle: string;
  candidateName: string;
  status: string;
  startedAt: string;
  durationMinutes: number;
  remainingSeconds: number;
  currentQuestionIndex: number;
  lastAutoSavedAt?: string | null;
  deadlineAt?: string;
  graceSeconds?: number;
  questions: ExamQuestion[];
}

export interface AnswerPayload {
  questionId: string;
  answerContent: Record<string, unknown>;
  markedForReview?: boolean;
}

export function fetchAttempt(attemptId: string) {
  return api.get<AttemptDetail>(`/candidate/attempts/${attemptId}`);
}

export function saveAttemptAnswers(
  attemptId: string,
  data: { answers: AnswerPayload[]; currentQuestionIndex?: number },
) {
  return api.put(`/candidate/attempts/${attemptId}/answers`, data);
}

export function autoSaveAttempt(
  attemptId: string,
  data: { answers: AnswerPayload[]; currentQuestionIndex?: number },
) {
  return api.post(`/candidate/attempts/${attemptId}/auto-save`, data);
}

export function submitAttempt(attemptId: string, submitType: 'MANUAL' | 'TIMEOUT' = 'MANUAL') {
  return api.post(`/candidate/attempts/${attemptId}/submit`, { submitType });
}
