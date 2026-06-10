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
import { toCandidateQuestion } from '../questions/questions.service';
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
  ) {}

  async listExams(userId: string) {
    const participants = await this.prisma.examParticipant.findMany({
      where: { userId },
      include: {
        exam: {
          include: { category: true, paper: { select: { id: true, title: true, totalScore: true } } },
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

    const finalizedWithoutPublish = attempts.filter(
      (a) =>
        a.status === 'COMPLETED' &&
        a.scoreRecord?.result &&
        a.scoreRecord.result !== 'PENDING' &&
        !a.scoreRecord.publishedAt,
    );
    if (finalizedWithoutPublish.length) {
      await this.ensureResultsPublished(finalizedWithoutPublish.map((a) => a.id));
      for (const attempt of finalizedWithoutPublish) {
        if (attempt.scoreRecord) {
          attempt.scoreRecord.publishedAt = new Date();
        }
      }
    }

    const now = new Date();
    const visibleExamStatuses = new Set([
      'PUBLISHED',
      'IN_PROGRESS',
      'PENDING_GRADING',
      'COMPLETED',
    ]);

    return participants
      .filter((p) => visibleExamStatuses.has(p.exam.status))
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
          startTime,
          endTime,
          now,
          p.exam.status,
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
      scoreRecord?: {
        result: string | null;
        publishedAt: Date | null;
        totalScore: unknown;
        passScore: unknown;
      } | null;
    } | null,
    startTime: Date | null | undefined,
    endTime: Date | null | undefined,
    now: Date,
    examStatus: string,
  ) {
    const windowOpen =
      (!startTime || now >= new Date(startTime)) &&
      (!endTime || now <= new Date(endTime));
    const beforeStart = Boolean(startTime && now < new Date(startTime));
    const afterEnd = Boolean(endTime && now > new Date(endTime));
    const examTakeable = examStatus === 'PUBLISHED' || examStatus === 'IN_PROGRESS';

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
      const published = this.isResultPublishedForCandidate(attempt);
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
      return {
        candidateState: 'PENDING_GRADING' as const,
        tab: 'finished' as const,
        statusLabel: 'Pending grading',
        actionLabel: 'Awaiting results',
        canEnter: false,
        canViewResult: false,
      };
    }

    if (beforeStart) {
      return {
        candidateState: 'UPCOMING' as const,
        tab: 'upcoming' as const,
        statusLabel: 'Upcoming',
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

  private isResultPublishedForCandidate(attempt: {
    status: string;
    scoreRecord?: {
      result: string | null;
      publishedAt: Date | null;
    } | null;
  }): boolean {
    return this.isGradingFinalized(attempt, attempt.scoreRecord);
  }

  private isGradedForCandidate(attempt: {
    status: string;
    scoreRecord?: {
      result: string | null;
      publishedAt: Date | null;
    } | null;
  }): boolean {
    return this.isResultPublishedForCandidate(attempt);
  }

  /** Backfill publication timestamp for attempts graded before publish logic was added. */
  private async ensureResultsPublished(attemptIds: string[]) {
    if (!attemptIds.length) return;
    await this.prisma.scoreRecord.updateMany({
      where: {
        attemptId: { in: attemptIds },
        publishedAt: null,
        result: { in: ['PASS', 'FAIL'] },
      },
      data: { publishedAt: new Date() },
    });
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
    actorName?: string,
  ) {
    await this.ensureParticipant(examId, userId);
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { paper: { include: { paperQuestions: true } } },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    if (exam.status !== 'PUBLISHED' && exam.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Exam is not available');
    }

    const window = await this.getParticipantWindow(examId, userId);
    const startTime = window.startTime ?? exam.startTime;
    const endTime = window.endTime ?? exam.endTime;
    const now = new Date();
    if (startTime && endTime && (now < startTime || now > endTime)) {
      throw new BadRequestException('Outside exam time window');
    }

    const existing = await this.prisma.examAttempt.findFirst({
      where: { examId, userId, status: 'IN_PROGRESS' },
    });
    if (existing) return existing;

    const attempt = await this.prisma.examAttempt.create({
      data: {
        examId,
        sessionId: sessionId ?? window.sessionId,
        userId,
        startedAt: now,
        status: 'IN_PROGRESS',
        ip: ctx.ip,
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

    await this.prisma.exam.update({
      where: { id: examId },
      data: { status: 'IN_PROGRESS' },
    });

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

    return attempt;
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

    const questions = exam.paper.paperQuestions.map((pq, index) => {
      const snapshot = pq.questionSnapshotJson as {
        type: string;
        stem: string;
        optionsJson: unknown;
      };
      const record = recordMap.get(pq.questionId);
      const base = toCandidateQuestion({
        id: pq.questionId,
        type: snapshot.type,
        stem: snapshot.stem,
        optionsJson: snapshot.optionsJson,
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
    });

    const window = await this.getParticipantWindow(attempt.examId, userId);
    let remainingSeconds = this.computeRemainingSeconds(attempt.startedAt, exam.durationMinutes);
    if (window.endTime) {
      const sessionRemaining = Math.floor((window.endTime.getTime() - Date.now()) / 1000);
      remainingSeconds = Math.min(remainingSeconds, Math.max(0, sessionRemaining));
    }

    const deadlineAt = this.computeDeadlineAt(attempt.startedAt, exam.durationMinutes, window.endTime);

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

    const action = dto.eventType === 'PAGE_LEAVE' ? 'PAGE_LEAVE' : 'SCREEN_SWITCH';
    const exam = await this.prisma.exam.findUnique({
      where: { id: attempt.examId },
      select: { title: true },
    });

    await this.auditService.log({
      actorId: userId,
      actorRole,
      action,
      objectType: 'ExamAttempt',
      objectId: attemptId,
      objectName: exam?.title,
      ...ctx,
    });

    return { logged: true };
  }

  private computeRemainingSeconds(startedAt: Date, durationMinutes: number): number {
    const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    const total = durationMinutes * 60;
    return Math.max(0, total - elapsed);
  }

  private computeDeadlineAt(
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
    const deadline = this.computeDeadlineAt(
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
    let score = await this.prisma.scoreRecord.findUnique({ where: { attemptId } });

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
        !this.isGradedForCandidate({ status: attempt.status, scoreRecord: score }))
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

    if (!score.publishedAt && score.result && score.result !== 'PENDING') {
      await this.ensureResultsPublished([attemptId]);
      score = await this.prisma.scoreRecord.findUnique({ where: { attemptId } });
    }

    const answerRecords = await this.prisma.answerRecord.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'asc' },
    });
    const scoreMap = new Map(
      (exam?.paper.paperQuestions ?? []).map((pq) => [pq.questionId, Number(pq.score)]),
    );
    const showAnswerDetails = true;

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
        showAnswerDetails &&
        (snapshot.type === 'SINGLE_CHOICE' ||
          snapshot.type === 'TRUE_FALSE' ||
          snapshot.type === 'MULTIPLE_CHOICE')
          ? resolveOptionLabel(snapshot, rawCorrect)
          : showAnswerDetails
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
      showAnswers: showAnswerDetails,
      questions,
    };
  }

  private async ensureParticipant(examId: string, userId: string) {
    const participant = await this.prisma.examParticipant.findFirst({
      where: { examId, userId },
    });
    if (!participant) throw new ForbiddenException('Not assigned to this exam');
  }

  private async getOwnedAttempt(attemptId: string, userId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== userId) {
      throw new NotFoundException('Attempt not found');
    }
    return attempt;
  }
}
