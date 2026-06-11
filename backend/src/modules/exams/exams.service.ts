import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, ExamStatus, Prisma } from '@prisma/client';
import { toPrismaExamStatus, ExamStatus as ExamStatusConst } from '../../common/constants/exam-status.constants';
import { PrismaService } from '../../prisma/prisma.module';
import { AuditService } from '../../common/services/audit.service';
import { CreateExamDto, QueryExamDto, UpdateExamDto } from './dto/exam.dto';
import { ExamLifecycleService } from './exam-lifecycle.service';
import {
  isSubjectiveQuestionType,
  resolveSessionTimeWindow,
  resolveStatusAfterClose,
} from './exam-lifecycle.util';
import { SessionsService } from './sessions.service';

const examInclude = {
  category: { select: { id: true, name: true } },
  paper: { select: { id: true, title: true, version: true, totalScore: true, status: true } },
  createdBy: { select: { id: true, name: true } },
  resultsPublishedBy: { select: { id: true, name: true } },
  _count: { select: { sessions: true, participants: true, attempts: true } },
} satisfies Prisma.ExamInclude;

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private sessionsService: SessionsService,
    private lifecycleService: ExamLifecycleService,
  ) {}

  /**
   * Advances exam statuses based on scheduled start/end times.
   * PUBLISHED → IN_PROGRESS when start_time <= now
   * IN_PROGRESS → PENDING_GRADING | COMPLETED when end_time <= now
   */
  async updateExamStatuses(): Promise<{ started: number; closed: number }> {
    const now = new Date();
    let started = 0;
    let closed = 0;

    const publishedStatus = toPrismaExamStatus(ExamStatusConst.PUBLISHED);
    const inProgressStatus = toPrismaExamStatus(ExamStatusConst.IN_PROGRESS);

    const publishedExams = await this.prisma.exam.findMany({
      where: { status: publishedStatus },
      include: {
        sessions: { select: { id: true, startTime: true, endTime: true, status: true } },
      },
    });

    for (const exam of publishedExams) {
      const window = resolveSessionTimeWindow(
        exam.sessions,
        exam.startTime,
        exam.endTime,
      );
      if (!window.startTime || now < window.startTime) continue;

      await this.prisma.exam.update({
        where: { id: exam.id },
        data: { status: inProgressStatus },
      });

      const activeSessionIds = exam.sessions
        .filter(
          (s) =>
            now >= s.startTime &&
            now <= s.endTime &&
            s.status === 'PUBLISHED',
        )
        .map((s) => s.id);

      if (activeSessionIds.length) {
        await this.prisma.examSession.updateMany({
          where: { id: { in: activeSessionIds } },
          data: { status: 'IN_PROGRESS' },
        });
      }

      started += 1;
    }

    const inProgressExams = await this.prisma.exam.findMany({
      where: { status: inProgressStatus },
      include: {
        sessions: { select: { startTime: true, endTime: true } },
        paper: {
          include: {
            paperQuestions: {
              include: { question: { select: { type: true } } },
            },
          },
        },
      },
    });

    for (const exam of inProgressExams) {
      const window = resolveSessionTimeWindow(
        exam.sessions,
        exam.startTime,
        exam.endTime,
      );
      if (!window.endTime || now < window.endTime) continue;

      const hasSubjective = exam.paper.paperQuestions.some((pq) =>
        isSubjectiveQuestionType(pq.question.type),
      );
      const nextStatus = resolveStatusAfterClose(hasSubjective);

      await this.prisma.exam.update({
        where: { id: exam.id },
        data: {
          status: nextStatus,
          closedAt: now,
        },
      });

      await this.prisma.examSession.updateMany({
        where: { examId: exam.id, status: { in: ['PUBLISHED', 'IN_PROGRESS'] } },
        data: { status: 'CLOSED' },
      });

      closed += 1;
    }

    if (started > 0 || closed > 0) {
      this.logger.log(`Updated exam statuses: ${started} started, ${closed} closed`);
    }

    return { started, closed };
  }

  async findAll(query: QueryExamDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ExamWhereInput = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status && query.status !== 'ALL') {
      where.status = query.status as ExamStatus;
    } else {
      where.status = { not: ExamStatus.ARCHIVED };
    }
    if (query.search?.trim()) {
      where.OR = [
        { title: { contains: query.search.trim() } },
        { description: { contains: query.search.trim() } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.exam.count({ where }),
      this.prisma.exam.findMany({
        where,
        include: examInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      data: items.map((e) => this.toResponse(e)),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 },
    };
  }

  async findOne(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        ...examInclude,
        sessions: {
          orderBy: { startTime: 'asc' },
          include: { _count: { select: { participants: true } } },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return this.toDetail(exam);
  }

  async create(dto: CreateExamDto, createdById: string) {
    await this.validatePaper(dto.paperId, dto.passScore);

    const exam = await this.prisma.exam.create({
      data: {
        categoryId: dto.categoryId,
        paperId: dto.paperId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        passScore: dto.passScore,
        durationMinutes: dto.durationMinutes,
        allowRetake: dto.allowRetake ?? false,
        maxAttempts: dto.allowRetake ? (dto.maxAttempts ?? 3) : 1,
        randomQuestionOrder: dto.randomQuestionOrder ?? false,
        randomOptionOrder: dto.randomOptionOrder ?? false,
        showResultToCandidate: dto.showResultToCandidate ?? false,
        showAnswersToCandidate: dto.showAnswersToCandidate ?? false,
        status: ExamStatus.DRAFT,
        createdById,
      },
      include: examInclude,
    });

    await this.auditService.log({
      actorId: createdById,
      action: 'CREATE',
      objectType: 'Exam',
      objectId: exam.id,
      afterData: { title: exam.title },
    });

    return this.toResponse(exam);
  }

  async update(id: string, dto: UpdateExamDto, actorId?: string) {
    const exam = await this.getExamOrThrow(id);

    if (exam.status !== ExamStatus.DRAFT && exam.status !== ExamStatus.READY) {
      throw new BadRequestException('Only draft exams can be edited');
    }

    if (dto.paperId && dto.paperId !== exam.paperId) {
      await this.validatePaper(dto.paperId, dto.passScore ?? Number(exam.passScore));
    } else if (dto.passScore !== undefined) {
      await this.validatePaper(exam.paperId, dto.passScore);
    }

    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.paperId !== undefined ? { paperId: dto.paperId } : {}),
        ...(dto.passScore !== undefined ? { passScore: dto.passScore } : {}),
        ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
        ...(dto.allowRetake !== undefined ? { allowRetake: dto.allowRetake } : {}),
        ...(dto.maxAttempts !== undefined ? { maxAttempts: dto.maxAttempts } : {}),
        ...(dto.randomQuestionOrder !== undefined
          ? { randomQuestionOrder: dto.randomQuestionOrder }
          : {}),
        ...(dto.randomOptionOrder !== undefined
          ? { randomOptionOrder: dto.randomOptionOrder }
          : {}),
        ...(dto.showResultToCandidate !== undefined
          ? { showResultToCandidate: dto.showResultToCandidate }
          : {}),
        ...(dto.showAnswersToCandidate !== undefined
          ? { showAnswersToCandidate: dto.showAnswersToCandidate }
          : {}),
      },
      include: examInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'Exam',
      objectId: id,
      afterData: dto,
    });

    return this.toResponse(updated);
  }

  async remove(id: string, actorId?: string) {
    const exam = await this.getExamOrThrow(id);
    if (exam.status !== ExamStatus.DRAFT) {
      throw new BadRequestException('Only draft exams can be deleted');
    }

    await this.prisma.exam.delete({ where: { id } });
    await this.auditService.log({
      actorId,
      action: 'DELETE',
      objectType: 'Exam',
      objectId: id,
    });
    return { message: 'Exam deleted', id };
  }

  async publish(id: string, actorId?: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        paper: { include: { paperQuestions: true } },
        sessions: { include: { _count: { select: { participants: true } } } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    if (exam.status !== ExamStatus.DRAFT && exam.status !== ExamStatus.READY) {
      throw new BadRequestException('Exam is already published or closed');
    }

    await this.validatePaper(exam.paperId, Number(exam.passScore));

    if (exam.sessions.length === 0) {
      throw new BadRequestException('Exam must have at least one session before publishing');
    }

    const sessionsWithoutParticipants = exam.sessions.filter(
      (s) => s._count.participants === 0,
    );
    if (sessionsWithoutParticipants.length > 0) {
      throw new BadRequestException(
        'All sessions must have participants assigned before publishing',
      );
    }

    for (const session of exam.sessions) {
      if (session.startTime >= session.endTime) {
        throw new BadRequestException(`Session "${session.name}" has invalid time window`);
      }
    }

    const now = new Date();
    const published = await this.prisma.exam.update({
      where: { id },
      data: {
        status: ExamStatus.PUBLISHED,
        publishedAt: now,
      },
      include: examInclude,
    });

    await this.prisma.examSession.updateMany({
      where: { examId: id, status: 'DRAFT' },
      data: { status: 'PUBLISHED' },
    });

    await this.auditService.log({
      actorId,
      action: 'PUBLISH',
      objectType: 'Exam',
      objectId: id,
    });

    return this.toResponse(published);
  }

  async close(id: string, actorId?: string) {
    const exam = await this.getExamOrThrow(id);
    if (exam.status !== ExamStatus.PUBLISHED && exam.status !== ExamStatus.IN_PROGRESS) {
      throw new BadRequestException('Only published or in-progress exams can be closed');
    }

    const closeStatus = await this.lifecycleService.resolveCloseStatus(id);
    const now = new Date();
    const closed = await this.prisma.exam.update({
      where: { id },
      data: {
        status: closeStatus,
        closedAt: now,
      },
      include: examInclude,
    });

    await this.prisma.examSession.updateMany({
      where: { examId: id, status: { in: ['PUBLISHED', 'IN_PROGRESS'] } },
      data: { status: 'CLOSED' },
    });

    await this.sessionsService.revokeQrTokensForExam(id);

    await this.auditService.log({
      actorId,
      action: 'CLOSE',
      objectType: 'Exam',
      objectId: id,
    });

    return this.toResponse(closed);
  }

  async archive(id: string, actorId?: string) {
    const exam = await this.getExamOrThrow(id);
    if (
      exam.status !== ExamStatus.COMPLETED &&
      exam.status !== ExamStatus.PENDING_GRADING
    ) {
      throw new BadRequestException(
        'Only completed or pending-grading exams can be archived',
      );
    }

    const now = new Date();
    const archived = await this.prisma.exam.update({
      where: { id },
      data: {
        status: ExamStatus.ARCHIVED,
        archivedAt: now,
      },
      include: examInclude,
    });

    await this.prisma.examSession.updateMany({
      where: { examId: id },
      data: { status: 'ARCHIVED' },
    });

    await this.sessionsService.revokeQrTokensForExam(id);

    await this.auditService.log({
      actorId,
      action: 'ARCHIVE',
      objectType: 'Exam',
      objectId: id,
    });

    return this.toResponse(archived);
  }

  async publishResults(examId: string, actorId: string, reason?: string) {
    const exam = await this.getExamOrThrow(examId);
    if (exam.resultsPublishedAt) {
      throw new BadRequestException('Results are already published for this exam');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.exam.update({
        where: { id: examId },
        data: {
          resultsPublishedAt: now,
          resultsPublishedById: actorId,
        },
      });

      await tx.examAttempt.updateMany({
        where: { examId },
        data: { resultsPublishedAt: now },
      });

      const attemptIds = (
        await tx.examAttempt.findMany({
          where: { examId },
          select: { id: true },
        })
      ).map((a) => a.id);

      if (attemptIds.length) {
        await tx.scoreRecord.updateMany({
          where: {
            attemptId: { in: attemptIds },
            result: { in: ['PASS', 'FAIL'] },
          },
          data: { publishedAt: now, publishedById: actorId },
        });
      }
    });

    await this.auditService.log({
      actorId,
      action: 'PUBLISH',
      objectType: 'Exam',
      objectId: examId,
      objectName: exam.title,
      reason: reason ?? 'Exam results published to candidates',
    });

    return { success: true, publishedAt: now.toISOString() };
  }

  async unpublishResults(examId: string, actorId: string, reason?: string) {
    const exam = await this.getExamOrThrow(examId);
    if (!exam.resultsPublishedAt) {
      throw new BadRequestException('Results are not published for this exam');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.exam.update({
        where: { id: examId },
        data: {
          resultsPublishedAt: null,
          resultsPublishedById: null,
        },
      });

      await tx.examAttempt.updateMany({
        where: { examId },
        data: { resultsPublishedAt: null },
      });

      const attemptIds = (
        await tx.examAttempt.findMany({
          where: { examId },
          select: { id: true },
        })
      ).map((a) => a.id);

      if (attemptIds.length) {
        await tx.scoreRecord.updateMany({
          where: { attemptId: { in: attemptIds } },
          data: { publishedAt: null, publishedById: null },
        });
      }
    });

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'Exam',
      objectId: examId,
      objectName: exam.title,
      reason: reason ?? 'Exam results unpublished — hidden from candidates',
    });

    return { success: true };
  }

  private async validatePaper(paperId: string, passScore: number) {
    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      include: { _count: { select: { paperQuestions: true } } },
    });
    if (!paper || paper.status !== ContentStatus.ACTIVE) {
      throw new BadRequestException('Paper must be a published (active) version');
    }
    if (paper._count.paperQuestions === 0) {
      throw new BadRequestException('Selected paper has no questions');
    }
    if (Number(paper.totalScore) <= 0) {
      throw new BadRequestException('Paper total score must be greater than zero');
    }
    if (passScore < 0) {
      throw new BadRequestException('Passing score must be zero or greater');
    }
    if (passScore > Number(paper.totalScore)) {
      throw new BadRequestException('Passing score cannot exceed paper total score');
    }
    return paper;
  }

  private async getExamOrThrow(id: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }

  private toResponse(exam: Prisma.ExamGetPayload<{ include: typeof examInclude }>) {
    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      categoryId: exam.categoryId,
      category: exam.category,
      paperId: exam.paperId,
      paper: exam.paper
        ? {
            ...exam.paper,
            totalScore: Number(exam.paper.totalScore),
            label: `${exam.paper.title} (v${exam.paper.version})`,
          }
        : null,
      passScore: Number(exam.passScore),
      durationMinutes: exam.durationMinutes,
      allowRetake: exam.allowRetake,
      maxAttempts: exam.maxAttempts,
      randomQuestionOrder: exam.randomQuestionOrder,
      randomOptionOrder: exam.randomOptionOrder,
      showResultToCandidate: exam.showResultToCandidate,
      showAnswersToCandidate: exam.showAnswersToCandidate,
      status: exam.status,
      statusLabel: this.examStatusLabel(exam.status),
      sessionCount: exam._count.sessions,
      participantCount: exam._count.participants,
      attemptCount: exam._count.attempts,
      isEditable: exam.status === ExamStatus.DRAFT || exam.status === ExamStatus.READY,
      resultsPublishedAt: exam.resultsPublishedAt,
      resultsPublishedBy: exam.resultsPublishedBy,
      resultsPublished: Boolean(exam.resultsPublishedAt),
      publishedAt: exam.publishedAt,
      closedAt: exam.closedAt,
      archivedAt: exam.archivedAt,
      createdBy: exam.createdBy,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
    };
  }

  private toDetail(
    exam: Prisma.ExamGetPayload<{
      include: typeof examInclude & {
        sessions: { include: { _count: { select: { participants: true } } } };
      };
    }>,
  ) {
    return {
      ...this.toResponse(exam),
      sessions: exam.sessions.map((s) => ({
        id: s.id,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
        notes: s.notes,
        status: s.status,
        statusLabel: this.sessionStatusLabel(s.status),
        participantCount: s._count.participants,
      })),
    };
  }

  private examStatusLabel(status: ExamStatus) {
    const map: Record<ExamStatus, string> = {
      DRAFT: 'Draft',
      READY: 'Ready',
      PUBLISHED: 'Published',
      IN_PROGRESS: 'In Progress',
      PENDING_GRADING: 'Pending Grading',
      COMPLETED: 'Closed',
      ARCHIVED: 'Archived',
    };
    return map[status];
  }

  private sessionStatusLabel(status: string) {
    const map: Record<string, string> = {
      DRAFT: 'Scheduled',
      PUBLISHED: 'Scheduled',
      IN_PROGRESS: 'In Progress',
      CLOSED: 'Completed',
      ARCHIVED: 'Canceled',
    };
    return map[status] ?? status;
  }
}
