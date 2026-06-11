import { ExamStatus as PrismaExamStatus } from '@prisma/client';

export const ExamStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  IN_PROGRESS: 'in_progress',
  PENDING_GRADING: 'pending_grading',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type ExamStatusValue = (typeof ExamStatus)[keyof typeof ExamStatus];

const PRISMA_TO_API: Record<string, ExamStatusValue> = {
  DRAFT: ExamStatus.DRAFT,
  READY: ExamStatus.DRAFT,
  PUBLISHED: ExamStatus.PUBLISHED,
  IN_PROGRESS: ExamStatus.IN_PROGRESS,
  PENDING_GRADING: ExamStatus.PENDING_GRADING,
  COMPLETED: ExamStatus.COMPLETED,
  ARCHIVED: ExamStatus.ARCHIVED,
};

const API_TO_PRISMA: Record<ExamStatusValue, PrismaExamStatus> = {
  [ExamStatus.DRAFT]: PrismaExamStatus.DRAFT,
  [ExamStatus.PUBLISHED]: PrismaExamStatus.PUBLISHED,
  [ExamStatus.IN_PROGRESS]: PrismaExamStatus.IN_PROGRESS,
  [ExamStatus.PENDING_GRADING]: PrismaExamStatus.PENDING_GRADING,
  [ExamStatus.COMPLETED]: PrismaExamStatus.COMPLETED,
  [ExamStatus.ARCHIVED]: PrismaExamStatus.ARCHIVED,
};

export function toPrismaExamStatus(status: ExamStatusValue): PrismaExamStatus {
  return API_TO_PRISMA[status];
}

export function fromPrismaExamStatus(status: PrismaExamStatus | string): ExamStatusValue {
  return PRISMA_TO_API[status] ?? ExamStatus.DRAFT;
}

export function isExamStatus(value: string, expected: ExamStatusValue): boolean {
  return fromPrismaExamStatus(value) === expected;
}
