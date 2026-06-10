import api from './client';

export interface CategoryCounts {
  exams: number;
  questions: number;
  papers: number;
  children: number;
}

export interface ExamCategory {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  parent: { id: string; name: string } | null;
  status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED' | 'DRAFT';
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  counts: CategoryCounts;
}

export interface CategoryListResponse {
  data: ExamCategory[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface CategoryQuery {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CategoryFormData {
  name: string;
  description?: string;
  parentId?: string | null;
  status?: 'ACTIVE' | 'DISABLED';
}

export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
}

export function fetchCategories(params: CategoryQuery) {
  return api.get<CategoryListResponse>('/admin/categories', { params });
}

export function fetchCategoryOptions(excludeId?: string) {
  return api.get<CategoryOption[]>('/admin/categories/options', {
    params: excludeId ? { excludeId } : undefined,
  });
}

export function fetchCategory(id: string) {
  return api.get<ExamCategory>(`/admin/categories/${id}`);
}

export function createCategory(data: CategoryFormData) {
  return api.post<ExamCategory>('/admin/categories', data);
}

export function updateCategory(id: string, data: CategoryFormData) {
  return api.put<ExamCategory>(`/admin/categories/${id}`, data);
}

export function updateCategoryStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
  return api.patch<ExamCategory>(`/admin/categories/${id}/status`, { status });
}

export function deleteCategory(id: string) {
  return api.delete<{ message: string; linkedQuestions?: number; linkedPapers?: number }>(
    `/admin/categories/${id}`,
  );
}
