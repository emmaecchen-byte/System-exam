import { ExamStatus } from '@prisma/client';
import { SUBJECTIVE_QUESTION_TYPES } from '../../common/constants';

export interface ExamTimeWindow {
  startTime: Date | null;
  endTime: Date | null;
}

export function resolveSessionTimeWindow(
  sessions: Array<{ startTime: Date; endTime: Date }>,
  examStartTime: Date | null,
  examEndTime: Date | null,
): ExamTimeWindow {
  if (sessions.length === 0) {
    return { startTime: examStartTime, endTime: examEndTime };
  }

  const startTime = sessions.reduce(
    (min, s) => (s.startTime < min ? s.startTime : min),
    sessions[0].startTime,
  );
  const endTime = sessions.reduce(
    (max, s) => (s.endTime > max ? s.endTime : max),
    sessions[0].endTime,
  );

  return { startTime, endTime };
}

export function examHasStarted(now: Date, window: ExamTimeWindow): boolean {
  return Boolean(window.startTime && now >= window.startTime);
}

export function examHasEnded(now: Date, window: ExamTimeWindow): boolean {
  return Boolean(window.endTime && now >= window.endTime);
}

export function isWithinExamWindow(now: Date, window: ExamTimeWindow): boolean {
  if (!window.startTime || !window.endTime) return false;
  return now >= window.startTime && now <= window.endTime;
}

export function resolveStatusAfterClose(hasSubjectiveQuestions: boolean): ExamStatus {
  return hasSubjectiveQuestions ? ExamStatus.PENDING_GRADING : ExamStatus.COMPLETED;
}

export function isSubjectiveQuestionType(type: string): boolean {
  return (SUBJECTIVE_QUESTION_TYPES as readonly string[]).includes(type);
}
