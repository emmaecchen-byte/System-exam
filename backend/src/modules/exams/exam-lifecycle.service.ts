import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExamStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { SessionsService } from './sessions.service';
import {
  examHasEnded,
  examHasStarted,
  isSubjectiveQuestionType,
  resolveSessionTimeWindow,
} from './exam-lifecycle.util';

@Injectable()
export class ExamLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(ExamLifecycleService.name);

  constructor(
    private prisma: PrismaService,
    private sessionsService: SessionsService,
  ) {}

  async onModuleInit() {
    await this.sessionsService.invalidateExpiredQrTokens();
    await this.syncAllExamStatuses();
  }

  /** Runs every minute to advance exam statuses based on scheduled times. */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledStatusSync() {
    await this.sessionsService.invalidateExpiredQrTokens();
    await this.syncAllExamStatuses();
  }

  async syncAllExamStatuses(): Promise<{ started: number; closed: number }> {
    const now = new Date();
    let started = 0;
    let closed = 0;

    const publishedExams = await this.prisma.exam.findMany({
      where: { status: ExamStatus.PUBLISHED },
      include: { sessions: { select: { id: true, startTime: true, endTime: true, status: true } } },
    });

    for (const exam of publishedExams) {
      const window = resolveSessionTimeWindow(
        exam.sessions,
        exam.startTime,
        exam.endTime,
      );
      if (examHasStarted(now, window)) {
        await this.transitionToInProgress(exam.id, exam.sessions, now);
        started += 1;
      }
    }

    const inProgressExams = await this.prisma.exam.findMany({
      where: { status: ExamStatus.IN_PROGRESS },
      include: { sessions: { select: { id: true, startTime: true, endTime: true, status: true } } },
    });

    for (const exam of inProgressExams) {
      const window = resolveSessionTimeWindow(
        exam.sessions,
        exam.startTime,
        exam.endTime,
      );
      if (examHasEnded(now, window)) {
        await this.transitionToClosed(exam.id);
        closed += 1;
      }
    }

    if (started > 0 || closed > 0) {
      this.logger.log(`Lifecycle sync: ${started} started, ${closed} closed`);
    }

    return { started, closed };
  }

  async syncExamStatus(examId: string): Promise<void> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { sessions: { select: { id: true, startTime: true, endTime: true, status: true } } },
    });
    if (!exam) return;

    const now = new Date();
    const window = resolveSessionTimeWindow(exam.sessions, exam.startTime, exam.endTime);

    if (exam.status === ExamStatus.PUBLISHED && examHasStarted(now, window)) {
      await this.transitionToInProgress(exam.id, exam.sessions, now);
      return;
    }

    if (exam.status === ExamStatus.IN_PROGRESS && examHasEnded(now, window)) {
      await this.transitionToClosed(exam.id);
    }
  }

  async examHasSubjectiveQuestions(examId: string): Promise<boolean> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        paper: {
          include: {
            paperQuestions: {
              include: { question: { select: { type: true } } },
            },
          },
        },
      },
    });
    if (!exam) return false;

    return exam.paper.paperQuestions.some((pq) =>
      isSubjectiveQuestionType(pq.question.type),
    );
  }

  async resolveCloseStatus(examId: string): Promise<ExamStatus> {
    const hasSubjective = await this.examHasSubjectiveQuestions(examId);
    if (!hasSubjective) return ExamStatus.COMPLETED;

    const pendingGrading = await this.prisma.examAttempt.count({
      where: {
        examId,
        status: { in: ['GRADING', 'SUBMITTED'] },
      },
    });
    if (pendingGrading > 0) return ExamStatus.PENDING_GRADING;

    const pendingReviews = await this.prisma.answerRecord.count({
      where: {
        attempt: { examId },
        question: { type: { in: ['FILL_BLANK', 'SHORT_ANSWER'] } },
        OR: [
          { reviewStatus: 'PENDING' },
          { manualScore: null, finalScore: null },
        ],
      },
    });

    return pendingReviews > 0 ? ExamStatus.PENDING_GRADING : ExamStatus.COMPLETED;
  }

  async maybeCompleteExam(examId: string): Promise<void> {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || exam.status !== ExamStatus.PENDING_GRADING) return;

    const nextStatus = await this.resolveCloseStatus(examId);
    if (nextStatus !== ExamStatus.COMPLETED) return;

    await this.prisma.exam.update({
      where: { id: examId },
      data: { status: ExamStatus.COMPLETED },
    });
  }

  private async transitionToInProgress(
    examId: string,
    sessions: Array<{ id: string; startTime: Date; endTime: Date; status: string }>,
    now: Date,
  ) {
    await this.prisma.exam.update({
      where: { id: examId },
      data: { status: ExamStatus.IN_PROGRESS },
    });

    const activeSessionIds = sessions
      .filter((s) => now >= s.startTime && now <= s.endTime && s.status === 'PUBLISHED')
      .map((s) => s.id);

    if (activeSessionIds.length) {
      await this.prisma.examSession.updateMany({
        where: { id: { in: activeSessionIds } },
        data: { status: 'IN_PROGRESS' },
      });
    }
  }

  private async transitionToClosed(examId: string) {
    const status = await this.resolveCloseStatus(examId);
    const now = new Date();

    await this.prisma.exam.update({
      where: { id: examId },
      data: {
        status,
        closedAt: now,
      },
    });

    await this.prisma.examSession.updateMany({
      where: { examId, status: { in: ['PUBLISHED', 'IN_PROGRESS'] } },
      data: { status: 'CLOSED' },
    });
  }
}
