import { Process, Processor } from '@nestjs/bull';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.module';
import { StudentService } from '../student/student.service';
import { TIMER_QUEUE } from './timer.constants';
import { TimerService } from './timer.service';

@Processor(TIMER_QUEUE)
export class TimerProcessor {
  private readonly logger = new Logger(TimerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timerService: TimerService,
    @Inject(forwardRef(() => StudentService))
    private readonly studentService: StudentService,
  ) {}

  @Process('expire')
  async handleExpire(job: Job<{ attemptId: string }>) {
    const { attemptId } = job.data;
    await this.timerService.clearTimer(attemptId);

    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, userId: true, status: true },
    });
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;

    try {
      await this.studentService.submitAttempt(attemptId, attempt.userId, 'TIMEOUT');
      this.logger.log(`Auto-submitted attempt ${attemptId} on timer expiry`);
    } catch (err) {
      this.logger.warn(
        `Failed to auto-submit attempt ${attemptId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
