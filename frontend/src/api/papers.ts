import api from './client';

export interface PaperListItem {
  id: string;
  title: string;
  categoryId: string;
  category: { id: string; name: string };
  version: number;
  versionLabel: string;
  totalScore: number;
  status: string;
  statusLabel: string;
  questionCount: number;
  examCount: number;
  paperFamilyId: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface PaperQuestionItem {
  id: string;
  questionId: string;
  sortOrder: number;
  score: number;
  snapshot: {
    stem?: string;
    type?: string;
    optionsJson?: unknown;
    difficulty?: number;
    tagsJson?: string[];
  };
}

export interface PaperDetail extends PaperListItem {
  isEditable: boolean;
  questions: PaperQuestionItem[];
}

export interface PaperListResponse {
  data: PaperListItem[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export function fetchPublishedPapers() {
  return api.get<Array<{ id: string; title: string; version: number; totalScore: number; label: string }>>(
    '/admin/papers/options/published',
  );
}

export function fetchPapers(params: Record<string, unknown>) {
  return api.get<PaperListResponse>('/admin/papers', { params });
}

export function fetchPaper(id: string) {
  return api.get<PaperDetail>(`/admin/papers/${id}`);
}

export function fetchPaperPreview(id: string) {
  return api.get(`/admin/papers/${id}/preview`);
}

export function fetchPaperVersions(id: string) {
  return api.get<PaperListItem[]>(`/admin/papers/${id}/versions`);
}

export function createPaper(data: { title: string; categoryId: string }) {
  return api.post<PaperDetail>('/admin/papers', data);
}

export function updatePaper(id: string, data: { title?: string; categoryId?: string }) {
  return api.put<PaperDetail>(`/admin/papers/${id}`, data);
}

export function deletePaper(id: string) {
  return api.delete(`/admin/papers/${id}`);
}

export function publishPaper(id: string) {
  return api.post<PaperDetail>(`/admin/papers/${id}/publish`);
}

export function createPaperNewVersion(id: string) {
  return api.post<PaperDetail>(`/admin/papers/${id}/new-version`);
}

export function archivePaper(id: string) {
  return api.post(`/admin/papers/${id}/archive`);
}

export function unarchivePaper(id: string) {
  return api.post<PaperListItem>(`/admin/papers/${id}/unarchive`);
}

export function addPaperQuestions(id: string, questionIds: string[], scores?: Record<string, number>) {
  return api.post<PaperDetail>(`/admin/papers/${id}/questions`, { questionIds, scores });
}

export function removePaperQuestion(paperId: string, questionId: string) {
  return api.delete(`/admin/papers/${paperId}/questions/${questionId}`);
}

export function updatePaperQuestionScore(paperId: string, questionId: string, score: number) {
  return api.put(`/admin/papers/${paperId}/questions/${questionId}/score`, { score });
}

export function reorderPaperQuestions(
  paperId: string,
  orders: Array<{ questionId: string; sortOrder: number }>,
) {
  return api.put(`/admin/papers/${paperId}/questions/reorder`, { orders });
}
