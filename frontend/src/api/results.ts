import api from './client';

export interface ResultRow {
  attemptId: string;
  candidateName: string;
  employeeNo: string;
  department: string;
  examId: string;
  examTitle: string;
  examCategory: string;
  sessionId?: string | null;
  sessionName: string;
  startTime?: string | null;
  submissionTime?: string | null;
  timeSpentMinutes?: number | null;
  objectiveScore: number;
  subjectiveScore: number;
  totalScore: number;
  passingScore: number;
  result: string;
  resultCode: string;
  gradingStatus: string;
  attemptStatus: string;
  graderNames: string;
}

export interface ResultQuestionDetail {
  answerId: string;
  questionNumber: number;
  type: string;
  stem: string;
  options?: Array<{ key: string; label?: string; text?: string }>;
  maxScore: number;
  candidateAnswer: string;
  correctAnswer: string;
  scoringRubric: string;
  autoScore: number | null;
  manualScore: number | null;
  finalScore: number | null;
  reviewComment?: string | null;
  reviewer?: { id: string; name: string } | null;
  isSubjective: boolean;
  graded: boolean;
}

export interface ResultDetail extends ResultRow {
  questions: ResultQuestionDetail[];
}

export interface ResultsQuery {
  examId?: string;
  sessionId?: string;
  departmentIds?: string[];
  result?: string;
  gradingStatus?: string;
  submittedFrom?: string;
  submittedTo?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  attemptIds?: string[];
}

export function fetchResultsFilters() {
  return api.get<{
    exams: Array<{ id: string; title: string }>;
    departments: Array<{ id: string; name: string }>;
    sessions: Array<{ id: string; name: string; examId: string; startTime: string }>;
    results: string[];
    gradingStatuses: string[];
  }>('/admin/results/filters');
}

export function fetchResults(params: ResultsQuery) {
  return api.get<{ data: ResultRow[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
    '/admin/results',
    { params: serializeQuery(params) },
  );
}

export function fetchResultDetail(attemptId: string) {
  return api.get<ResultDetail>(`/admin/attempts/${attemptId}/detailed-results`);
}

export function regradeAttempt(attemptId: string, reason: string) {
  return api.post(`/admin/attempts/${attemptId}/regrade`, { reason });
}

export async function exportResults(params: ResultsQuery) {
  const response = await api.get('/admin/results/export', {
    params: serializeQuery(params),
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? 'exam-results.xlsx';
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = decodeURIComponent(filename);
  link.click();
  window.URL.revokeObjectURL(url);
}

function serializeQuery(params: ResultsQuery): Record<string, string | number | undefined> {
  const { departmentIds, attemptIds, ...rest } = params;
  const out: Record<string, string | number | undefined> = { ...rest };
  if (departmentIds?.length) {
    out.departmentIds = departmentIds.join(',');
  }
  if (attemptIds?.length) {
    out.attemptIds = attemptIds.join(',');
  }
  return out;
}
