import { useI18n } from 'vue-i18n';
import type { QuestionType } from '@/api/questions';

/** Translate enum / API codes and English fallback labels for the active UI locale. */
export function useLocalizedLabels() {
  const { t } = useI18n();

  function examStatus(status: string) {
    const map: Record<string, string> = {
      DRAFT: 'status.draft',
      READY: 'status.ready',
      PUBLISHED: 'status.published',
      IN_PROGRESS: 'status.inProgress',
      PENDING_GRADING: 'status.pendingGrading',
      COMPLETED: 'status.closed',
      ARCHIVED: 'status.archived',
    };
    return map[status] ? t(map[status]) : status;
  }

  function sessionStatus(status: string) {
    const map: Record<string, string> = {
      DRAFT: 'status.scheduled',
      PUBLISHED: 'status.scheduled',
      IN_PROGRESS: 'status.inProgress',
      CLOSED: 'status.completed',
      ARCHIVED: 'status.canceled',
    };
    return map[status] ? t(map[status]) : status;
  }

  function contentStatus(status: string) {
    const map: Record<string, string> = {
      DRAFT: 'status.draft',
      ACTIVE: 'status.published',
      ARCHIVED: 'status.archived',
      DISABLED: 'status.inactive',
    };
    return map[status] ? t(map[status]) : status;
  }

  function questionType(type: string) {
    const map: Record<string, string> = {
      SINGLE_CHOICE: 'questions.types.SINGLE_CHOICE',
      MULTIPLE_CHOICE: 'questions.types.MULTIPLE_CHOICE',
      TRUE_FALSE: 'questions.types.TRUE_FALSE',
      FILL_BLANK: 'questions.types.FILL_BLANK',
      SHORT_ANSWER: 'questions.types.SHORT_ANSWER',
    };
    return map[type] ? t(map[type]) : type;
  }

  function difficulty(value: string | number) {
    if (typeof value === 'number') {
      if (value <= 1) return t('labels.difficulty.easy');
      if (value >= 3) return t('labels.difficulty.hard');
      return t('labels.difficulty.medium');
    }
    const map: Record<string, string> = {
      Easy: 'labels.difficulty.easy',
      Medium: 'labels.difficulty.medium',
      Hard: 'labels.difficulty.hard',
    };
    return map[value] ? t(map[value]) : value;
  }

  function passResult(code: string) {
    const map: Record<string, string> = {
      PASS: 'common.pass',
      FAIL: 'common.fail',
      PENDING: 'common.pending',
    };
    return map[code] ? t(map[code]) : code;
  }

  function gradingStatusFromAttempt(attemptStatus: string) {
    const map: Record<string, string> = {
      SUBMITTED: 'results.gradingNotStarted',
      TIMEOUT: 'results.gradingNotStarted',
      GRADING: 'results.gradingInProgress',
      COMPLETED: 'results.gradingCompleted',
    };
    return map[attemptStatus] ? t(map[attemptStatus]) : attemptStatus;
  }

  function candidateStatusLabel(candidateState: string, fallback?: string) {
    const fallbackMap: Record<string, string> = {
      'In progress': 'labels.candidate.inProgress',
      'Open now': 'labels.candidate.openNow',
      'Pending grading': 'labels.candidate.pendingGrading',
      'Awaiting result publication': 'labels.candidate.awaitingPublication',
      'Graded & published': 'labels.candidate.gradedPublished',
      Upcoming: 'labels.candidate.upcoming',
      'Session ended': 'labels.candidate.sessionEnded',
      Unavailable: 'labels.candidate.unavailable',
    };
    if (fallback && fallbackMap[fallback]) return t(fallbackMap[fallback]);

    const map: Record<string, string> = {
      UPCOMING: 'labels.candidate.upcoming',
      IN_PROGRESS: 'labels.candidate.inProgress',
      PENDING_GRADING: 'labels.candidate.pendingGrading',
      AWAITING_PUBLISH: 'labels.candidate.awaitingPublication',
      GRADED_PUBLISHED: 'labels.candidate.gradedPublished',
      NOT_TAKEN: 'labels.candidate.notTaken',
    };
    if (map[candidateState]) return t(map[candidateState]);
    return fallback ?? candidateState;
  }

  function candidateActionLabel(actionLabel: string) {
    const map: Record<string, string> = {
      'Continue exam': 'student.continueExam',
      'Start exam': 'student.startExam',
      'Awaiting results': 'labels.candidate.awaitingResults',
      'Results not published yet': 'labels.candidate.resultsNotPublishedYet',
      'Awaiting result publication': 'labels.candidate.awaitingPublication',
      'View result': 'student.viewResult',
      'Not yet open': 'labels.candidate.notYetOpen',
    };
    if (actionLabel === '—') return '—';
    return map[actionLabel] ? t(map[actionLabel]) : actionLabel;
  }

  function trueFalseLabel(key: string) {
    if (key === 'T' || key.toUpperCase() === 'TRUE') return t('questionForm.true');
    if (key === 'F' || key.toUpperCase() === 'FALSE') return t('questionForm.false');
    return key;
  }

  function questionTypeOptions() {
    const types: QuestionType[] = [
      'SINGLE_CHOICE',
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
      'FILL_BLANK',
      'SHORT_ANSWER',
    ];
    return types.map((value) => ({ value, label: questionType(value) }));
  }

  return {
    examStatus,
    sessionStatus,
    contentStatus,
    questionType,
    difficulty,
    passResult,
    gradingStatusFromAttempt,
    candidateStatusLabel,
    candidateActionLabel,
    trueFalseLabel,
    questionTypeOptions,
  };
}
