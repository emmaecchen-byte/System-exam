import api from './client';

export interface GradingQueueItem {
  attemptId: string;
  examId: string;
  examTitle: string;
  sessionId?: string | null;
  sessionName?: string | null;
  candidateName: string;
  candidateEmployeeNo: string;
  submittedAt?: string | null;
  gradedAt?: string | null;
  objectiveScore: number;
  subjectiveScore: number;
  totalScore: number;
  passScore: number;
  result?: 'PASS' | 'FAIL' | null;
  pendingQuestionCount: number;
  totalSubjectiveCount: number;
  gradingStatus: 'pending' | 'in_progress' | 'completed';
  attemptStatus: string;
  assignedGrader?: { id: string; name: string } | null;
  needsQualityReview: boolean;
}

export interface GradingQuestion {
  answerId: string;
  questionId: string;
  questionNumber: number;
  type: string;
  stem: string;
  maxScore: number;
  candidateAnswer: string;
  referenceAnswer: string;
  scoringRubric: string;
  manualScore: number | null;
  reviewComment?: string | null;
  reviewStatus: string;
  graded: boolean;
  markedForReview: boolean;
}

export interface GradingAttemptDetail {
  attemptId: string;
  examId: string;
  examTitle: string;
  sessionName?: string | null;
  candidate: { id: string; name: string; employeeNo: string };
  submittedAt?: string | null;
  attemptStatus: string;
  needsQualityReview: boolean;
  objectiveScore: number;
  subjectiveScore: number;
  totalScore: number;
  passScore: number;
  result: 'pass' | 'fail';
  questions: GradingQuestion[];
}

export function fetchGradingQueue(params?: {
  examId?: string;
  sessionId?: string;
  status?: string;
  search?: string;
}) {
  return api.get<{ data: GradingQueueItem[]; total: number }>('/admin/grading/queue', { params });
}

export function fetchGradingStats() {
  return api.get<{ pending: number; inProgress: number; completed: number; total: number }>(
    '/admin/grading/stats',
  );
}

export function fetchGradingAttempt(attemptId: string) {
  return api.get<GradingAttemptDetail>(`/admin/grading/attempts/${attemptId}`);
}

export function gradeAnswer(
  attemptId: string,
  answerId: string,
  data: { manualScore: number; reviewComment?: string; markedForReview?: boolean },
) {
  return api.put(`/admin/grading/attempts/${attemptId}/answers/${answerId}`, data);
}

export function saveGradingDraft(attemptId: string) {
  return api.post<GradingAttemptDetail>(`/admin/grading/attempts/${attemptId}/draft`);
}

export function submitGrading(attemptId: string, data?: { needsQualityReview?: boolean }) {
  return api.post(`/admin/grading/attempts/${attemptId}/submit`, data ?? {});
}

export function assignGrader(attemptId: string, graderId: string) {
  return api.post(`/admin/grading/attempts/${attemptId}/assign`, { graderId });
}
