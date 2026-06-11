import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Queue } from 'bull';
import { RedisService } from '../../redis/redis.service';
import {
  ExamTimerState,
  TIMER_ACTIVE_SET,
  TIMER_QUEUE,
  expireJobId,
  timerKey,
} from './timer.constants';

export interface StartTimerParams {
  attemptId: string;
  userId: string;
  examId: string;
  startedAt: Date;
  durationMinutes: number;
  sessionEnd?: Date | null;
}

@Injectable()
export class TimerService {
  private readonly logger = new Logger(TimerService.name);

  constructor(
    private readonly redis: RedisService,
    @Optional() @InjectQueue(TIMER_QUEUE) private readonly timerQueue: Queue | null,
  ) {}

  computeDeadlineAt(
    startedAt: Date,
    durationMinutes: number,
    sessionEnd?: Date | null,
  ): Date {
    const durationEnd = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
    if (sessionEnd && sessionEnd < durationEnd) {
      return sessionEnd;
    }
    return durationEnd;
  }

  computeRemainingSeconds(
    startedAt: Date,
    durationMinutes: number,
    sessionEnd?: Date | null,
  ): number {
    const deadline = this.computeDeadlineAt(startedAt, durationMinutes, sessionEnd);
    return Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000));
  }

  async startTimer(params: StartTimerParams): Promise<void> {
    const deadlineAt = this.computeDeadlineAt(
      params.startedAt,
      params.durationMinutes,
      params.sessionEnd,
    );
    const remainingSeconds = Math.max(
      0,
      Math.floor((deadlineAt.getTime() - Date.now()) / 1000),
    );

    const state: ExamTimerState = {
      attemptId: params.attemptId,
      userId: params.userId,
      examId: params.examId,
      deadlineAt: deadlineAt.toISOString(),
      paused: false,
      syncedAt: new Date().toISOString(),
    };

    if (!this.redis.isAvailable()) {
      this.logger.debug(`Timer for attempt ${params.attemptId} using database fallback`);
      return;
    }

    await this.redis.setJson(timerKey(params.attemptId), state, remainingSeconds);
    await this.redis.sadd(TIMER_ACTIVE_SET, params.attemptId);
    await this.scheduleExpiryJob(params.attemptId, remainingSeconds);
  }

  async ensureTimer(params: StartTimerParams): Promise<void> {
    if (!this.redis.isAvailable()) return;
    const existing = await this.redis.getJson<ExamTimerState>(timerKey(params.attemptId));
    if (existing) return;
    await this.startTimer(params);
  }

  async getRemainingTime(
    attemptId: string,
    fallback?: {
      startedAt: Date;
      durationMinutes: number;
      sessionEnd?: Date | null;
    },
  ): Promise<number> {
    if (this.redis.isAvailable()) {
      const state = await this.redis.getJson<ExamTimerState>(timerKey(attemptId));
      if (state) {
        if (state.paused && state.pausedRemainingSeconds != null) {
          return state.pausedRemainingSeconds;
        }
        const remaining = Math.max(
          0,
          Math.floor((new Date(state.deadlineAt).getTime() - Date.now()) / 1000),
        );
        if (remaining === 0) {
          await this.expireTimer(attemptId);
        }
        return remaining;
      }
    }

    if (fallback) {
      const remaining = this.computeRemainingSeconds(
        fallback.startedAt,
        fallback.durationMinutes,
        fallback.sessionEnd,
      );
      if (remaining === 0 && this.redis.isAvailable()) {
        await this.expireTimer(attemptId);
      }
      return remaining;
    }

    return 0;
  }

  async pauseTimer(attemptId: string): Promise<void> {
    if (!this.redis.isAvailable()) return;

    const state = await this.redis.getJson<ExamTimerState>(timerKey(attemptId));
    if (!state || state.paused) return;

    const remaining = Math.max(
      0,
      Math.floor((new Date(state.deadlineAt).getTime() - Date.now()) / 1000),
    );

    const pausedState: ExamTimerState = {
      ...state,
      paused: true,
      pausedRemainingSeconds: remaining,
      syncedAt: new Date().toISOString(),
    };

    await this.redis.setJson(timerKey(attemptId), pausedState, remaining);
    await this.cancelExpiryJob(attemptId);
  }

  async resumeTimer(attemptId: string): Promise<void> {
    if (!this.redis.isAvailable()) return;

    const state = await this.redis.getJson<ExamTimerState>(timerKey(attemptId));
    if (!state || !state.paused || state.pausedRemainingSeconds == null) return;

    const remaining = state.pausedRemainingSeconds;
    const deadlineAt = new Date(Date.now() + remaining * 1000);

    const resumedState: ExamTimerState = {
      ...state,
      paused: false,
      pausedRemainingSeconds: undefined,
      deadlineAt: deadlineAt.toISOString(),
      syncedAt: new Date().toISOString(),
    };

    await this.redis.setJson(timerKey(attemptId), resumedState, remaining);
    await this.scheduleExpiryJob(attemptId, remaining);
  }

  async expireTimer(attemptId: string): Promise<void> {
    await this.clearTimer(attemptId);
    await this.enqueueExpiry(attemptId);
  }

  async clearTimer(attemptId: string): Promise<void> {
    await this.redis.del(timerKey(attemptId));
    await this.redis.srem(TIMER_ACTIVE_SET, attemptId);
    await this.cancelExpiryJob(attemptId);
  }

  @Cron('0 * * * * *')
  async syncTimersToDatabase(): Promise<void> {
    if (!this.redis.isAvailable()) return;

    const attemptIds = await this.redis.smembers(TIMER_ACTIVE_SET);
    if (attemptIds.length === 0) return;

    for (const attemptId of attemptIds) {
      const state = await this.redis.getJson<ExamTimerState>(timerKey(attemptId));
      if (!state) {
        await this.redis.srem(TIMER_ACTIVE_SET, attemptId);
        continue;
      }

      const remaining = state.paused
        ? (state.pausedRemainingSeconds ?? 0)
        : Math.max(
            0,
            Math.floor((new Date(state.deadlineAt).getTime() - Date.now()) / 1000),
          );

      if (remaining <= 0) {
        await this.expireTimer(attemptId);
        continue;
      }

      state.syncedAt = new Date().toISOString();
      await this.redis.setJson(timerKey(attemptId), state, remaining);
    }

    this.logger.debug(`Synced ${attemptIds.length} exam timer(s) in Redis`);
  }

  private async enqueueExpiry(attemptId: string): Promise<void> {
    if (!this.timerQueue) return;
    try {
      await this.timerQueue.add(
        'expire',
        { attemptId },
        {
          jobId: `expire-now-${attemptId}-${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Could not enqueue timer expiry for ${attemptId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async scheduleExpiryJob(attemptId: string, delaySeconds: number): Promise<void> {
    if (!this.redis.isAvailable() || !this.timerQueue) return;

    try {
      await this.cancelExpiryJob(attemptId);
      if (delaySeconds <= 0) {
        await this.enqueueExpiry(attemptId);
        return;
      }
      await this.timerQueue.add(
        'expire',
        { attemptId },
        {
          jobId: expireJobId(attemptId),
          delay: delaySeconds * 1000,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Could not schedule timer expiry for ${attemptId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async cancelExpiryJob(attemptId: string): Promise<void> {
    if (!this.timerQueue) return;
    try {
      const job = await this.timerQueue.getJob(expireJobId(attemptId));
      if (job) await job.remove();
    } catch {
      // Queue may be unavailable in database fallback mode
    }
  }
}
