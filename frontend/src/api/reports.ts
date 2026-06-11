import api from './client';

export interface DepartmentStatsResponse {
  departments: Array<{
    name: string;
    participantCount: number;
    passRate: number;
    avgScore: number;
  }>;
  overall: { passRate: number; avgScore: number };
}

export interface QuestionAnalysisItem {
  id: number;
  questionId: string;
  stem: string;
  type: string;
  correctCount: number;
  totalAttempts: number;
  correctRate: number;
  averageScore: number;
  maxScore: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface QuestionAnalysisResponse {
  questions: QuestionAnalysisItem[];
  summary: {
    easiestQuestion: { id: number; stem: string; correctRate: number } | null;
    hardestQuestion: { id: number; stem: string; correctRate: number } | null;
    averageDifficulty: 'easy' | 'medium' | 'hard';
  };
}

export interface CategoryTrendResponse {
  points: Array<{
    period: string;
    passRate: number;
    avgScore: number;
    total: number;
  }>;
  interval: 'day' | 'week' | 'month';
}

export function fetchDepartmentStats(examId: string, startDate?: string, endDate?: string) {
  return api.get<DepartmentStatsResponse>('/admin/reports/department-stats', {
    params: { examId, startDate, endDate },
  });
}

export function fetchQuestionAnalysis(examId: string) {
  return api.get<QuestionAnalysisResponse>('/admin/reports/question-analysis', {
    params: { examId },
  });
}

export function fetchCategoryTrend(
  categoryId: string,
  params: { startDate?: string; endDate?: string; interval?: 'day' | 'week' | 'month' },
) {
  return api.get<CategoryTrendResponse>('/admin/reports/category-trend', {
    params: { categoryId, ...params },
  });
}
