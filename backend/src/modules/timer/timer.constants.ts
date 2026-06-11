export const TIMER_QUEUE = 'exam-timer';
export const TIMER_ACTIVE_SET = 'exam:timers:active';
export const timerKey = (attemptId: string) => `exam:timer:${attemptId}`;
export const expireJobId = (attemptId: string) => `expire-${attemptId}`;

export interface ExamTimerState {
  attemptId: string;
  userId: string;
  examId: string;
  deadlineAt: string;
  paused: boolean;
  pausedRemainingSeconds?: number;
  syncedAt?: string;
}
