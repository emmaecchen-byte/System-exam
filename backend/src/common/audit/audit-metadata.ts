import { AuditAction } from '@prisma/client';

export const AUDIT_ACTION_CATEGORIES: Record<string, string> = {
  authentication: 'Authentication',
  user_management: 'User Management',
  category_management: 'Category Management',
  question_bank: 'Question Bank',
  paper_management: 'Paper Management',
  exam_management: 'Exam Management',
  session_management: 'Session Management',
  grading: 'Grading',
  results: 'Results',
  candidate_exam: 'Candidate Exam',
  system: 'System',
};

const OBJECT_CATEGORY: Record<string, string> = {
  User: 'authentication',
  ExamCategory: 'category_management',
  Question: 'question_bank',
  Paper: 'paper_management',
  Exam: 'exam_management',
  ExamSession: 'session_management',
  AnswerRecord: 'grading',
  ExamAttempt: 'grading',
  AuditLog: 'system',
  QuestionImport: 'question_bank',
  ScoreRecord: 'results',
};

const ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: 'Login',
  LOGIN_FAILED: 'Login Failed',
  LOGOUT: 'Logout',
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
  PUBLISH: 'Publish',
  CLOSE: 'Close',
  ARCHIVE: 'Archive',
  IMPORT: 'Import',
  GRADE: 'Grade',
  SUBMIT: 'Submit',
  EXPORT: 'Export',
  CORRECT: 'Correct / Regrade',
  MODIFY_SCORE: 'Modify Score',
  START_EXAM: 'Start Exam',
  AUTO_SAVE: 'Auto-Save',
  TIMEOUT_SUBMIT: 'Timeout Submit',
  PAGE_LEAVE: 'Page Leave',
  SCREEN_SWITCH: 'Screen Switch',
};

export function resolveActionCategory(objectType: string, action: AuditAction): string {
  if (
    action === 'START_EXAM' ||
    action === 'AUTO_SAVE' ||
    action === 'TIMEOUT_SUBMIT' ||
    action === 'PAGE_LEAVE' ||
    action === 'SCREEN_SWITCH'
  ) {
    return 'candidate_exam';
  }
  if (action === 'EXPORT' && objectType === 'AuditLog') return 'system';
  if (action === 'EXPORT') return 'results';
  if (action === 'CORRECT' || action === 'MODIFY_SCORE') return 'results';
  if (action === 'GRADE' || action === 'SUBMIT') return 'grading';
  if (action === 'LOGIN' || action === 'LOGIN_FAILED' || action === 'LOGOUT') {
    return 'authentication';
  }
  return OBJECT_CATEGORY[objectType] ?? 'system';
}

export function formatActionKey(action: AuditAction, objectType: string): string {
  const object = objectType.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  return `${action.toLowerCase()}_${object}`;
}

export function getActionLabel(action: AuditAction): string {
  return ACTION_LABELS[action] ?? action;
}

export function listAuditActionOptions() {
  return (Object.keys(ACTION_LABELS) as AuditAction[]).map((action) => ({
    value: action,
    label: ACTION_LABELS[action],
    category: resolveActionCategory('System', action),
  }));
}
