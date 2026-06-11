import api from './client';

export interface PaperAttachmentMeta {
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string | null;
}

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
  hasAttachment: boolean;
  attachment: PaperAttachmentMeta | null;
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

export function createPaper(
  data: { title: string; categoryId: string },
  attachment?: File,
) {
  if (attachment) {
    const form = new FormData();
    form.append('title', data.title);
    form.append('categoryId', data.categoryId);
    form.append('attachment', attachment);
    return api.post<PaperDetail>('/admin/papers', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return api.post<PaperDetail>('/admin/papers', data);
}

export function updatePaper(
  id: string,
  data: { title?: string; categoryId?: string },
  attachment?: File,
) {
  if (attachment) {
    const form = new FormData();
    if (data.title !== undefined) form.append('title', data.title);
    if (data.categoryId !== undefined) form.append('categoryId', data.categoryId);
    form.append('attachment', attachment);
    return api.put<PaperDetail>(`/admin/papers/${id}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return api.put<PaperDetail>(`/admin/papers/${id}`, data);
}

export async function downloadPaperAttachment(paperId: string, fileName?: string) {
  const response = await api.get(`/admin/papers/${paperId}/attachment`, {
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const name = fileName ?? match?.[1] ?? 'paper-attachment';
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = decodeURIComponent(name);
  link.click();
  window.URL.revokeObjectURL(url);
}

export function uploadPaperAttachment(paperId: string, file: File) {
  const form = new FormData();
  form.append('attachment', file);
  return api.put<PaperDetail>(`/admin/papers/${paperId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function deletePaperAttachment(paperId: string) {
  return api.delete<PaperDetail>(`/admin/papers/${paperId}/attachment`);
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
