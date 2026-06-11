import api from './client';

export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'FILL_BLANK'
  | 'SHORT_ANSWER';

export interface QuestionOption {
  key: string;
  label: string;
}

export interface Question {
  id: string;
  categoryId: string;
  category: { id: string; name: string };
  type: QuestionType;
  typeLabel: string;
  stem: string;
  optionsJson: QuestionOption[] | null;
  standardAnswerJson: Record<string, unknown>;
  score: number;
  explanation: string | null;
  scoringRubric: string | null;
  difficulty: number;
  difficultyLabel: string;
  tagsJson: string[];
  status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionListResponse {
  data: Question[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export interface QuestionQuery {
  search?: string;
  categoryId?: string;
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface QuestionFormData {
  categoryId: string;
  type: QuestionType;
  stem: string;
  optionsJson?: QuestionOption[];
  standardAnswerJson: Record<string, unknown>;
  score: number;
  explanation?: string;
  scoringRubric?: string;
  difficulty: number;
  tagsJson: string[];
  status: 'ACTIVE' | 'DISABLED';
  forceDuplicate?: boolean;
}

export interface ImportValidateResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateWarnings: number;
  detectedFormat?: string;
  defaultCategoryName?: string;
  answerKeyDetected?: boolean;
  answerKeyVoided?: boolean;
  importWarnings?: string[];
  preview: Array<{
    row: number;
    valid: boolean;
    errors: string[];
    warnings?: string[];
    duplicateWarning?: boolean;
    data?: { stem: string; categoryName: string; type: string; score: number };
  }>;
  errors: Array<{ row: number; message: string }>;
}

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'SINGLE_CHOICE', label: 'Single Choice' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
  { value: 'TRUE_FALSE', label: 'True/False' },
  { value: 'FILL_BLANK', label: 'Fill-in-Blank' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
];

export function fetchQuestions(params: QuestionQuery) {
  return api.get<QuestionListResponse>('/admin/questions', { params });
}

export function fetchQuestion(id: string) {
  return api.get<Question>(`/admin/questions/${id}`);
}

export function createQuestion(data: QuestionFormData) {
  return api.post<Question>('/admin/questions', data);
}

export function updateQuestion(id: string, data: Partial<QuestionFormData>) {
  return api.put<Question>(`/admin/questions/${id}`, data);
}

export function deleteQuestion(id: string) {
  return api.delete(`/admin/questions/${id}`);
}

export async function downloadQuestionTemplate() {
  const response = await api.get('/admin/questions/import/template', {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'question-import-template.xlsx';
  link.click();
  window.URL.revokeObjectURL(url);
}

export function validateQuestionImport(file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.post<ImportValidateResult>('/admin/questions/import/validate', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function confirmQuestionImport(file: File, skipInvalidRows = true) {
  const form = new FormData();
  form.append('file', file);
  form.append('skipInvalidRows', String(skipInvalidRows));
  return api.post('/admin/questions/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
