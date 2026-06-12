import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/services/audit.service';
import { RequestAuditContext } from '../../common/utils/request-audit.util';
import { PrismaService } from '../../prisma/prisma.module';
import {
  applyOptionKeyOrder,
  buildAttemptDisplayOrder,
} from '../../common/utils/shuffle.util';
import { toCandidateQuestion } from '../questions/questions.service';
import { ExamLifecycleService } from '../exams/exam-lifecycle.service';
import { TimerService } from '../timer/timer.service';
import { AutoGradeService } from './auto-grade.service';
import { BatchSaveAnswersDto, CandidateAuditEventDto, SaveAnswerDto } from './dto/student.dto';

function isAnswered(type: string, content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const answer = content as Record<string, unknown>;
  if (type === 'MULTIPLE_CHOICE') {
    return Array.isArray(answer.keys) && answer.keys.length > 0;
  }
  if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') {
    return typeof answer.key === 'string' && answer.key.length > 0;
  }
  if (type === 'FILL_BLANK') {
    const answers = answer.answers as string[] | undefined;
    return Array.isArray(answers) && answers.some((a) => typeof a === 'string' && a.trim().length > 0);
  }
  if (type === 'SHORT_ANSWER') {
    return typeof answer.text === 'string' && answer.text.trim().length > 0;
  }
  return false;
}

/** Grace period after exam duration for timeout auto-submit (seconds). */
const EXAM_SUBMIT_GRACE_SECONDS = 30;

const OBJECTIVE_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']);
const SUBJECTIVE_TYPES = new Set(['FILL_BLANK', 'SHORT_ANSWER']);

interface ResultQuestionSnapshot {
  type: string;
  stem: string;
  optionsJson?: Array<{ key: string; text: string }>;
  standardAnswerJson?: {
    key?: string;
    keys?: string[];
    answers?: string[];
    reference?: string;
    text?: string;
  };
  scoringRubric?: string;
}

function formatCandidateAnswerText(type: string, content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const answer = content as Record<string, unknown>;
  if (type === 'FILL_BLANK') {
    const answers = answer.answers as string[] | undefined;
    return Array.isArray(answers) ? answers.filter(Boolean).join(' | ') : '';
  }
  if (type === 'SHORT_ANSWER') {
    return typeof answer.text === 'string' ? answer.text : '';
  }
  if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') {
    return typeof answer.key === 'string' ? answer.key : '';
  }
  if (type === 'MULTIPLE_CHOICE') {
    return Array.isArray(answer.keys) ? answer.keys.join(', ') : '';
  }
  return JSON.stringify(content);
}

function formatStandardAnswerText(snapshot: ResultQuestionSnapshot): string {
  const std = snapshot.standardAnswerJson;
  if (!std) return '';
  if (snapshot.type === 'FILL_BLANK' && Array.isArray(std.answers)) {
    return std.answers.join(' or ');
  }
  if (snapshot.type === 'SHORT_ANSWER') {
    return std.reference ?? std.text ?? '';
  }
  if (snapshot.type === 'MULTIPLE_CHOICE' && Array.isArray(std.keys)) {
    return std.keys.join(', ');
  }
  return std.key ?? '';
}

function resolveOptionLabel(
  snapshot: ResultQuestionSnapshot,
  keyOrKeys: string,
): string {
  const options = snapshot.optionsJson ?? [];
  if (snapshot.type === 'MULTIPLE_CHOICE') {
    return keyOrKeys
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .map((key) => {
        const opt = options.find((o) => o.key === key);
        return opt ? `${key}. ${opt.text}` : key;
      })
      .join('; ');
  }
  const opt = options.find((o) => o.key === keyOrKeys);
  return opt ? `${keyOrKeys}. ${opt.text}` : keyOrKeys;
}

@Injectable()
export class StudentService {
  constructor(
    private prisma: PrismaService,
    private autoGrade: AutoGradeService,
    private auditService: AuditService,
    private lifecycleService: ExamLifecycleService,
    private timerService: TimerService,
  ) {}

  async listExams(userId: string) {
    const participantRows = await this.prisma.examParticipant.findMany({
      where: { userId },
      select: { examId: true, exam: { select: { status: true } } },
    });
    const syncIds = [
      ...new Set(
        participantRows
          .filter((p) => p.exam.status === 'PUBLISHED' || p.exam.status === 'IN_PROGRESS')
          .map((p) => p.examId),
      ),
    ];
    await Promise.all(syncIds.map((id) => this.lifecycleService.syncExamStatus(id)));

    const participants = await this.prisma.examParticipant.findMany({
      where: { userId },
      include: {
        exam: {
          include: {
            category: true,
            paper: { select: { id: true, title: true, totalScore: true } },
          },
        },
        session: true,
      },
      orderBy: [{ exam: { updatedAt: 'desc' } }, { createdAt: 'asc' }],
    });

    const examIds = [...new Set(participants.map((p) => p.examId))];
    const attempts = examIds.length
      ? await this.prisma.examAttempt.findMany({
          where: { userId, examId: { in: examIds } },
          include: { scoreRecord: true },
          orderBy: { startedAt: 'desc' },
        })
      : [];

    const now = new Date();
    const activeExamStatuses = new Set(['PUBLISHED', 'IN_PROGRESS']);
    const examsWithAttempts = new Set(attempts.map((a) => a.examId));

    return participants
      .filter(
        (p) =>
          activeExamStatuses.has(p.exam.status) ||
          examsWithAttempts.has(p.examId) ||
          p.exam.closedAt != null ||
          p.exam.status === 'COMPLETED' ||
          p.exam.status === 'PENDING_GRADING',
      )
      .map((p) => {
        const startTime = p.session?.startTime ?? p.exam.startTime;
        const endTime = p.session?.endTime ?? p.exam.endTime;
        const sessionAttempts = attempts.filter(
          (a) =>
            a.examId === p.examId &&
            (p.sessionId ? a.sessionId === p.sessionId : true),
        );
        const attempt = sessionAttempts[0] ?? null;
        const resolved = this.resolveCandidateExamState(
          attempt,
          p.exam.resultsPublishedAt,
          startTime,
          endTime,
          now,
          p.exam.status,
          p.exam.closedAt,
        );

        const score = attempt?.scoreRecord;
        const resultSummary =
          resolved.canViewResult && score
            ? {
                totalScore: Number(score.totalScore),
                passScore: Number(score.passScore),
                result: score.result,
              }
            : null;

        return {
          examId: p.exam.id,
          sessionId: p.sessionId,
          attemptId: attempt?.id ?? null,
          title: p.exam.title,
          category: p.exam.category.name,
          examStatus: p.exam.status,
          closedAt: p.exam.closedAt,
          isClosed: Boolean(p.exam.closedAt) || p.exam.status === 'COMPLETED',
          attemptStatus: attempt?.status ?? null,
          startTime,
          endTime,
          durationMinutes: p.exam.durationMinutes,
          passScore: Number(p.exam.passScore),
          candidateState: resolved.candidateState,
          tab: resolved.tab,
          statusLabel: resolved.statusLabel,
          actionLabel: resolved.actionLabel,
          canEnter: resolved.canEnter,
          canViewResult: resolved.canViewResult,
          submittedAt: attempt?.submittedAt ?? null,
          result: resultSummary,
        };
      });
  }

  private resolveCandidateExamState(
    attempt: {
      status: string;
      resultsPublishedAt: Date | null;
      scoreRecord?: {
        result: string | null;
        publishedAt: Date | null;
        totalScore: unknown;
        passScore: unknown;
      } | null;
    } | null,
    examResultsPublishedAt: Date | null,
    startTime: Date | null | undefined,
    endTime: Date | null | undefined,
    now: Date,
    examStatus: string,
    closedAt: Date | null = null,
  ) {
    const windowOpen =
      (!startTime || now >= new Date(startTime)) &&
      (!endTime || now <= new Date(endTime));
    const beforeStart = Boolean(startTime && now < new Date(startTime));
    const afterEnd = Boolean(endTime && now > new Date(endTime));
    const examTakeable = examStatus === 'IN_PROGRESS';
    const adminClosed = closedAt != null || examStatus === 'COMPLETED';

    if (attempt?.status === 'IN_PROGRESS') {
      return {
        candidateState: 'IN_PROGRESS' as const,
        tab: 'upcoming' as const,
        statusLabel: 'In progress',
        actionLabel: 'Continue exam',
        canEnter: true,
        canViewResult: false,
      };
    }

    if (
      attempt &&
      ['SUBMITTED', 'GRADING', 'TIMEOUT'].includes(attempt.status)
    ) {
      return {
        candidateState: 'PENDING_GRADING' as const,
        tab: 'finished' as const,
        statusLabel: 'Pending grading',
        actionLabel: 'Awaiting results',
        canEnter: false,
        canViewResult: false,
      };
    }

    if (attempt?.status === 'COMPLETED') {
      const published = this.isResultPublishedForCandidate(attempt, examResultsPublishedAt);
      if (published) {
        return {
          candidateState: 'GRADED_PUBLISHED' as const,
          tab: 'finished' as const,
          statusLabel: 'Graded & published',
          actionLabel: 'View result',
          canEnter: false,
          canViewResult: true,
        };
      }
      const graded = this.isGradingFinalized(attempt, attempt.scoreRecord);
      return {
        candidateState: graded ? ('AWAITING_PUBLISH' as const) : ('PENDING_GRADING' as const),
        tab: 'finished' as const,
        statusLabel: graded ? 'Awaiting result publication' : 'Pending grading',
        actionLabel: graded ? 'Results not published yet' : 'Awaiting results',
        canEnter: false,
        canViewResult: false,
      };
    }

    if (adminClosed) {
      return {
        candidateState: 'ADMIN_CLOSED' as const,
        tab: 'finished' as const,
        statusLabel: 'Closed',
        actionLabel: 'Closed by administrator',
        canEnter: false,
        canViewResult: false,
      };
    }

    if (examStatus === 'PUBLISHED' || beforeStart) {
      return {
        candidateState: 'UPCOMING' as const,
        tab: 'upcoming' as const,
        statusLabel: examStatus === 'PUBLISHED' ? 'Published — not yet open' : 'Upcoming',
        actionLabel: 'Not yet open',
        canEnter: false,
        canViewResult: false,
      };
    }

    if (windowOpen && examTakeable && !afterEnd) {
      return {
        candidateState: 'IN_PROGRESS' as const,
        tab: 'upcoming' as const,
        statusLabel: 'Open now',
        actionLabel: 'Start exam',
        canEnter: true,
        canViewResult: false,
      };
    }

    return {
      candidateState: 'NOT_TAKEN' as const,
      tab: 'finished' as const,
      statusLabel: afterEnd ? 'Session ended' : 'Unavailable',
      actionLabel: '—',
      canEnter: false,
      canViewResult: false,
    };
  }

  private isGradingFinalized(
    attempt: { status: string },
    score?: { result: string | null } | null,
  ): boolean {
    return (
      attempt.status === 'COMPLETED' &&
      Boolean(score?.result && score.result !== 'PENDING')
    );
  }

  private isResultPublishedForCandidate(
    attempt: {
      status: string;
      resultsPublishedAt: Date | null;
      scoreRecord?: {
        result: string | null;
        publishedAt: Date | null;
      } | null;
    },
    _examResultsPublishedAt: Date | null,
  ): boolean {
    return (
      this.isGradingFinalized(attempt, attempt.scoreRecord) &&
      attempt.scoreRecord?.publishedAt != null
    );
  }

  private isGradedForCandidate(
    attempt: {
      status: string;
      resultsPublishedAt: Date | null;
      scoreRecord?: {
        result: string | null;
        publishedAt: Date | null;
      } | null;
    },
    examResultsPublishedAt: Date | null,
  ): boolean {
    return this.isResultPublishedForCandidate(attempt, examResultsPublishedAt);
  }

  private async getParticipantWindow(examId: string, userId: string) {
    const participant = await this.prisma.examParticipant.findFirst({
      where: { examId, userId },
      include: { session: true },
    });
    return {
      startTime: participant?.session?.startTime,
      endTime: participant?.session?.endTime,
      sessionId: participant?.sessionId ?? undefined,
    };
  }

  async getExam(examId: string, userId: string) {
    await this.ensureParticipant(examId, userId);
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        paper: {
          include: {
            paperQuestions: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const window = await this.getParticipantWindow(examId, userId);

    return {
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      passScore: exam.passScore,
      startTime: window.startTime ?? exam.startTime,
      endTime: window.endTime ?? exam.endTime,
      questions: exam.paper.paperQuestions.map((pq) =>
        toCandidateQuestion({
          id: pq.questionId,
          type: (pq.questionSnapshotJson as { type: string }).type,
          stem: (pq.questionSnapshotJson as { stem: string }).stem,
          optionsJson: (pq.questionSnapshotJson as { optionsJson: unknown }).optionsJson,
          score: pq.score,
        }),
      ),
    };
  }

  async startExam(
    examId: string,
    userId: string,
    sessionId?: string,
    ctx: RequestAuditContext = {},
    actorRole?: string,
    _actorName?: string,
  ) {
    await this.ensureParticipant(examId, userId);
    await this.lifecycleService.syncExamStatus(examId);

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        sessions: true,
        paper: { include: { paperQuestions: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    if (exam.closedAt || exam.status === 'COMPLETED') {
      throw new BadRequestException({
        code: 'EXAM_CLOSED',
        message: 'This exam has been closed by the administrator',
      });
    }

    const window = await this.getParticipantWindow(examId, userId);
    const startTime = window.startTime ?? exam.startTime;
    const endTime = window.endTime ?? exam.endTime;
    const now = new Date();

    if (!startTime || !endTime) {
      throw new BadRequestException({
        code: 'EXAM_NOT_AVAILABLE',
        message: 'Exam time window is not configured',
      });
    }

    if (now > endTime) {
      throw new BadRequestException({
        code: 'EXAM_ENDED',
        message: 'This exam has already ended. You cannot start it.',
      });
    }

    if (now < startTime) {
      throw new BadRequestException({
        code: 'EXAM_NOT_STARTED',
        message: 'This exam has not started yet.',
      });
    }

    const startableStatuses = new Set(['IN_PROGRESS', 'PUBLISHED']);
    if (!startableStatuses.has(exam.status)) {
      throw new BadRequestException({
        code: 'EXAM_NOT_AVAILABLE',
        message: `Exam status is ${exam.status}. Cannot start.`,
      });
    }

    const existing = await this.prisma.examAttempt.findFirst({
      where: { examId, userId, status: 'IN_PROGRESS' },
    });
    if (existing) {
      await this.timerService.ensureTimer({
        attemptId: existing.id,
        userId,
        examId,
        startedAt: existing.startedAt,
        durationMinutes: exam.durationMinutes,
        sessionEnd: endTime,
      });
      return this.getAttempt(existing.id, userId);
    }

    const { questionOrderJson, optionOrdersJson } = buildAttemptDisplayOrder(
      exam.paper.paperQuestions,
      exam.randomQuestionOrder,
      exam.randomOptionOrder,
    );

    const attempt = await this.prisma.examAttempt.create({
      data: {
        examId,
        sessionId: sessionId ?? window.sessionId,
        userId,
        startedAt: now,
        status: 'IN_PROGRESS',
        ip: ctx.ip,
        questionOrderJson: questionOrderJson as Prisma.InputJsonValue,
        optionOrdersJson: optionOrdersJson as Prisma.InputJsonValue,
      },
    });

    for (const pq of exam.paper.paperQuestions) {
      await this.prisma.answerRecord.create({
        data: {
          attemptId: attempt.id,
          questionId: pq.questionId,
          questionSnapshotJson: pq.questionSnapshotJson as Prisma.InputJsonValue,
        },
      });
    }

    await this.auditService.log({
      actorId: userId,
      actorRole,
      action: 'START_EXAM',
      objectType: 'ExamAttempt',
      objectId: attempt.id,
      objectName: exam.title,
      afterData: { examId, sessionId: attempt.sessionId },
      ...ctx,
    });

    await this.timerService.startTimer({
      attemptId: attempt.id,
      userId,
      examId,
      startedAt: now,
      durationMinutes: exam.durationMinutes,
      sessionEnd: endTime,
    });

    return this.getAttempt(attempt.id, userId);
  }

  async getAttempt(attemptId: string, userId: string) {
    const attempt = await this.getOwnedAttempt(attemptId, userId);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt is not in progress');
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: attempt.examId },
      include: {
        paper: {
          include: {
            paperQuestions: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, employeeNo: true },
    });

    const records = await this.prisma.answerRecord.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'asc' },
    });
    const recordMap = new Map(records.map((r) => [r.questionId, r]));

    const questions = this.buildShuffledCandidateQuestions(
      exam.paper.paperQuestions,
      recordMap,
      attempt.questionOrderJson,
      attempt.optionOrdersJson,
    );

    const window = await this.getParticipantWindow(attempt.examId, userId);
    let remainingSeconds = await this.timerService.getRemainingTime(attempt.id, {
      startedAt: attempt.startedAt,
      durationMinutes: exam.durationMinutes,
      sessionEnd: window.endTime,
    });
    if (window.endTime) {
      const sessionRemaining = Math.floor((window.endTime.getTime() - Date.now()) / 1000);
      remainingSeconds = Math.min(remainingSeconds, Math.max(0, sessionRemaining));
    }

    const deadlineAt = this.timerService.computeDeadlineAt(
      attempt.startedAt,
      exam.durationMinutes,
      window.endTime,
    );

    return {
      id: attempt.id,
      examId: exam.id,
      examTitle: exam.title,
      candidateName: user?.name ?? 'Candidate',
      status: attempt.status,
      startedAt: attempt.startedAt,
      durationMinutes: exam.durationMinutes,
      remainingSeconds,
      deadlineAt: deadlineAt.toISOString(),
      graceSeconds: EXAM_SUBMIT_GRACE_SECONDS,
      currentQuestionIndex: attempt.currentQuestionIndex,
      lastAutoSavedAt: attempt.lastAutoSavedAt,
      questions,
    };
  }

  async saveAnswer(attemptId: string, userId: string, dto: SaveAnswerDto) {
    const attempt = await this.getOwnedAttempt(attemptId, userId);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt is locked');
    }
    await this.assertWithinExamTime(attempt, userId);

    return this.prisma.answerRecord.updateMany({
      where: { attemptId, questionId: dto.questionId },
      data: {
        answerContentJson: dto.answerContent as Prisma.InputJsonValue,
        ...(dto.markedForReview !== undefined ? { markedForReview: dto.markedForReview } : {}),
      },
    });
  }

  async saveAnswers(attemptId: string, userId: string, dto: BatchSaveAnswersDto) {
    const attempt = await this.getOwnedAttempt(attemptId, userId);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt is locked');
    }
    await this.assertWithinExamTime(attempt, userId);

    await this.prisma.$transaction(
      dto.answers.map((item) =>
        this.prisma.answerRecord.updateMany({
          where: { attemptId, questionId: item.questionId },
          data: {
            answerContentJson: item.answerContent as Prisma.InputJsonValue,
            ...(item.markedForReview !== undefined
              ? { markedForReview: item.markedForReview }
              : {}),
          },
        }),
      ),
    );

    if (dto.currentQuestionIndex !== undefined) {
      await this.prisma.examAttempt.update({
        where: { id: attemptId },
        data: { currentQuestionIndex: dto.currentQuestionIndex },
      });
    }

    return { saved: dto.answers.length, currentQuestionIndex: dto.currentQuestionIndex };
  }

  async autoSave(
    attemptId: string,
    userId: string,
    dto: BatchSaveAnswersDto,
    ctx: RequestAuditContext = {},
    actorRole?: string,
  ) {
    const result = await this.saveAnswers(attemptId, userId, dto);
    await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: { lastAutoSavedAt: new Date() },
    });
    await this.maybeLogAutoSave(attemptId, userId, dto.answers.length, ctx, actorRole);
    return { ...result, autoSavedAt: new Date().toISOString() };
  }

  private async maybeLogAutoSave(
    attemptId: string,
    userId: string,
    answerCount: number,
    ctx: RequestAuditContext,
    actorRole?: string,
  ) {
    const since = new Date(Date.now() - 5 * 60 * 1000);
    const recent = await this.prisma.auditLog.count({
      where: {
        objectId: attemptId,
        action: 'AUTO_SAVE',
        createdAt: { gte: since },
      },
    });
    if (recent > 0) return;

    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: { select: { title: true } } },
    });

    await this.auditService.log({
      actorId: userId,
      actorRole,
      action: 'AUTO_SAVE',
      objectType: 'ExamAttempt',
      objectId: attemptId,
      objectName: attempt?.exam.title,
      afterData: { savedAnswers: answerCount },
      ...ctx,
    });
  }

  async logCandidateEvent(
    attemptId: string,
    userId: string,
    dto: CandidateAuditEventDto,
    ctx: RequestAuditContext = {},
    actorRole?: string,
  ) {
    const attempt = await this.getOwnedAttempt(attemptId, userId);
    if (attempt.status !== 'IN_PROGRESS') return { logged: false };

    const action = this.mapCandidateAuditAction(dto.eventType);
    const exam = await this.prisma.exam.findUnique({
      where: { id: attempt.examId },
      select: { title: true },
    });

    const afterData: Record<string, unknown> = {
      eventType: dto.eventType,
      ...(dto.metadata ?? {}),
      ...(dto.timestamp ? { timestamp: dto.timestamp } : {}),
      ...(dto.action ? { action: dto.action } : {}),
      ...(dto.duration_seconds !== undefined ? { duration_seconds: dto.duration_seconds } : {}),
    };

    await this.auditService.log({
      actorId: userId,
      actorRole,
      action,
      objectType: 'ExamAttempt',
      objectId: attemptId,
      objectName: exam?.title,
      afterData,
      ...ctx,
    });

    return { logged: true };
  }

  private mapCandidateAuditAction(eventType: string): 'PAGE_LEAVE' | 'SCREEN_SWITCH' {
    const normalized = eventType.toUpperCase().replace(/-/g, '_');
    if (normalized === 'PAGE_LEAVE') return 'PAGE_LEAVE';
    return 'SCREEN_SWITCH';
  }

  private async assertWithinExamTime(
    attempt: { id: string; examId: string; startedAt: Date; status: string },
    userId: string,
    options: {
      allowGrace?: boolean;
      isSubmit?: boolean;
      submitType?: 'MANUAL' | 'TIMEOUT';
    } = {},
  ) {
    const exam = await this.prisma.exam.findUnique({ where: { id: attempt.examId } });
    if (!exam) throw new NotFoundException('Exam not found');

    const window = await this.getParticipantWindow(attempt.examId, userId);
    const deadline = this.timerService.computeDeadlineAt(
      attempt.startedAt,
      exam.durationMinutes,
      window.endTime,
    );
    const now = Date.now();
    const graceMs = EXAM_SUBMIT_GRACE_SECONDS * 1000;
    const hardLimit = deadline.getTime() + graceMs;

    if (now > hardLimit) {
      throw new BadRequestException('Exam submission window has closed');
    }

    if (options.isSubmit && options.submitType === 'MANUAL' && now > deadline.getTime()) {
      throw new BadRequestException('Exam time has expired');
    }

    if (!options.allowGrace && now > deadline.getTime()) {
      throw new BadRequestException('Exam time has expired');
    }
  }

  async submitAttempt(
    attemptId: string,
    userId: string,
    submitType: 'MANUAL' | 'TIMEOUT' = 'MANUAL',
    ctx: RequestAuditContext = {},
    actorRole?: string,
  ) {
    const attempt = await this.getOwnedAttempt(attemptId, userId);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt already submitted');
    }

    await this.assertWithinExamTime(attempt, userId, {
      allowGrace: submitType === 'TIMEOUT',
      isSubmit: true,
      submitType,
    });

    await this.timerService.clearTimer(attemptId);

    const submittedAt = new Date();
    const durationSeconds = Math.floor((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000);

    await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        submittedAt,
        durationSeconds,
        submitType,
      },
    });

    const exam = await this.prisma.exam.findUnique({
      where: { id: attempt.examId },
      select: { title: true },
    });

    await this.auditService.log({
      actorId: userId,
      actorRole,
      action: submitType === 'TIMEOUT' ? 'TIMEOUT_SUBMIT' : 'SUBMIT',
      objectType: 'ExamAttempt',
      objectId: attemptId,
      objectName: exam?.title,
      afterData: { submitType, durationSeconds },
      ...ctx,
    });

    return this.autoGrade.autoGradeAttempt(attemptId, attempt.examId);
  }

  async getResult(attemptId: string, userId: string) {
    const attempt = await this.getOwnedAttempt(attemptId, userId);
    const exam = await this.prisma.exam.findUnique({
      where: { id: attempt.examId },
      include: {
        paper: { include: { paperQuestions: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
    const score = await this.prisma.scoreRecord.findUnique({ where: { attemptId } });

    if (attempt.status === 'IN_PROGRESS') {
      return {
        attemptId,
        examTitle: exam?.title,
        status: attempt.status,
        graded: false,
        message: 'This exam is still in progress.',
      };
    }

    if (
      ['SUBMITTED', 'GRADING', 'TIMEOUT'].includes(attempt.status) ||
      (attempt.status === 'COMPLETED' &&
        !this.isGradingFinalized(attempt, score))
    ) {
      return {
        attemptId,
        examTitle: exam?.title,
        status: attempt.status,
        graded: false,
        submittedAt: attempt.submittedAt,
        message:
          'Your exam has been submitted. Results will appear here after grading is complete.',
      };
    }

    if (!score) {
      return {
        attemptId,
        examTitle: exam?.title,
        status: attempt.status,
        graded: false,
        message: 'Results are not available yet.',
      };
    }

    if (!score.publishedAt) {
      return {
        attemptId,
        examTitle: exam?.title,
        status: 'pending',
        graded: false,
        submittedAt: attempt.submittedAt,
        message: 'Results not yet published by administrator',
      };
    }

    const answerRecords = await this.prisma.answerRecord.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'asc' },
    });
    const scoreMap = new Map(
      (exam?.paper.paperQuestions ?? []).map((pq) => [pq.questionId, Number(pq.score)]),
    );
    const showStandardAnswers = Boolean(exam?.showAnswersToCandidate);

    const questions = answerRecords.map((record, index) => {
      const snapshot = record.questionSnapshotJson as unknown as ResultQuestionSnapshot;
      const maxScore = scoreMap.get(record.questionId) ?? 0;
      const earnedScore =
        record.finalScore !== null
          ? Number(record.finalScore)
          : record.manualScore !== null
            ? Number(record.manualScore)
            : record.autoScore !== null
              ? Number(record.autoScore)
              : 0;
      const rawCandidate = formatCandidateAnswerText(snapshot.type, record.answerContentJson);
      const rawCorrect = formatStandardAnswerText(snapshot);
      const candidateAnswer =
        snapshot.type === 'SINGLE_CHOICE' ||
        snapshot.type === 'TRUE_FALSE' ||
        snapshot.type === 'MULTIPLE_CHOICE'
          ? resolveOptionLabel(snapshot, rawCandidate)
          : rawCandidate;
      const correctAnswer =
        showStandardAnswers &&
        (snapshot.type === 'SINGLE_CHOICE' ||
          snapshot.type === 'TRUE_FALSE' ||
          snapshot.type === 'MULTIPLE_CHOICE')
          ? resolveOptionLabel(snapshot, rawCorrect)
          : showStandardAnswers
            ? rawCorrect
            : null;

      return {
        questionNumber: index + 1,
        type: snapshot.type,
        stem: snapshot.stem,
        maxScore,
        earnedScore,
        candidateAnswer: candidateAnswer || '(No answer)',
        correctAnswer,
        reviewComment: record.reviewComment,
        isObjective: OBJECTIVE_TYPES.has(snapshot.type),
        isSubjective: SUBJECTIVE_TYPES.has(snapshot.type),
      };
    });

    return {
      attemptId,
      examTitle: exam?.title,
      status: attempt.status,
      graded: true,
      submittedAt: attempt.submittedAt,
      objectiveScore: Number(score!.objectiveScore),
      subjectiveScore: Number(score!.subjectiveScore),
      totalScore: Number(score!.totalScore),
      passScore: Number(score!.passScore),
      result: score!.result,
      showAnswers: showStandardAnswers,
      questions,
    };
  }

  private async ensureParticipant(examId: string, userId: string) {
    const participant = await this.prisma.examParticipant.findFirst({
      where: { examId, userId },
    });
    if (!participant) throw new ForbiddenException('Not assigned to this exam');
  }

  private buildShuffledCandidateQuestions(
    paperQuestions: Array<{
      questionId: string;
      sortOrder: number;
      score: unknown;
      questionSnapshotJson: unknown;
    }>,
    recordMap: Map<
      string,
      {
        answerContentJson: unknown;
        markedForReview: boolean;
      }
    >,
    questionOrderJson: unknown,
    optionOrdersJson: unknown,
  ) {
    const pqById = new Map(paperQuestions.map((pq) => [pq.questionId, pq]));
    const defaultOrder = [...paperQuestions]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((pq) => pq.questionId);

    let questionIds: string[];
    if (Array.isArray(questionOrderJson) && questionOrderJson.length > 0) {
      const stored = questionOrderJson as string[];
      const storedSet = new Set(stored);
      const missing = defaultOrder.filter((id) => !storedSet.has(id));
      questionIds = [...stored.filter((id) => pqById.has(id)), ...missing];
    } else {
      questionIds = defaultOrder;
    }

    const optionOrders =
      optionOrdersJson &&
      typeof optionOrdersJson === 'object' &&
      !Array.isArray(optionOrdersJson)
        ? (optionOrdersJson as Record<string, string[]>)
        : {};

    return questionIds
      .map((questionId, index) => {
        const pq = pqById.get(questionId);
        if (!pq) return null;
        const snapshot = pq.questionSnapshotJson as {
          type: string;
          stem: string;
          optionsJson: unknown;
        };
        const orderedOptions = applyOptionKeyOrder(
          snapshot.optionsJson,
          optionOrders[questionId],
        );
        const record = recordMap.get(questionId);
        const base = toCandidateQuestion({
          id: questionId,
          type: snapshot.type,
          stem: snapshot.stem,
          optionsJson: orderedOptions,
          score: pq.score,
        });
        const answerContent = record?.answerContentJson ?? null;
        return {
          ...base,
          sortOrder: index,
          answerContent,
          markedForReview: record?.markedForReview ?? false,
          answered: isAnswered(snapshot.type, answerContent),
        };
      })
      .filter((q): q is NonNullable<typeof q> => q != null);
  }

  private async getOwnedAttempt(attemptId: string, userId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== userId) {
      throw new NotFoundException('Attempt not found');
    }
    return attempt;
  }
}
