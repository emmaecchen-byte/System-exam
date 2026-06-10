import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttemptStatus, PassResult, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { AuditService } from '../../common/services/audit.service';
import { ROLES, SUBJECTIVE_QUESTION_TYPES } from '../../common/constants';
import { RequestUser } from '../../common/decorators/auth.decorator';
import {
  AssignGraderDto,
  GradeAnswerDto,
  GradingQueueQueryDto,
  SubmitGradingDto,
} from './dto/grading.dto';

interface QuestionSnapshot {
  type: string;
  stem: string;
  standardAnswerJson?: {
    key?: string;
    keys?: string[];
    answers?: string[];
    reference?: string;
    text?: string;
  };
  scoringRubric?: string;
}

@Injectable()
export class GradingService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  private isAdmin(user: RequestUser): boolean {
    return user.roles.includes(ROLES.SUPER_ADMIN) || user.roles.includes(ROLES.ADMIN);
  }

  private canGradeAttempt(attempt: { assignedGraderId: string | null }, user: RequestUser): boolean {
    if (this.isAdmin(user)) return true;
    if (!attempt.assignedGraderId) return true;
    return attempt.assignedGraderId === user.userId;
  }

  private formatCandidateAnswer(type: string, content: unknown): string {
    if (!content || typeof content !== 'object') return '';
    const answer = content as Record<string, unknown>;
    if (type === 'FILL_BLANK') {
      const answers = answer.answers as string[] | undefined;
      return Array.isArray(answers) ? answers.filter(Boolean).join(' | ') : '';
    }
    if (type === 'SHORT_ANSWER') {
      return typeof answer.text === 'string' ? answer.text : '';
    }
    return JSON.stringify(content);
  }

  private formatReferenceAnswer(snapshot: QuestionSnapshot): string {
    const std = snapshot.standardAnswerJson;
    if (!std) return '';
    if (snapshot.type === 'FILL_BLANK' && Array.isArray(std.answers)) {
      return std.answers.join(' or ');
    }
    if (snapshot.type === 'SHORT_ANSWER') {
      return std.reference ?? std.text ?? '';
    }
    return '';
  }

  private isSubjectiveType(type: string): boolean {
    return (SUBJECTIVE_QUESTION_TYPES as readonly string[]).includes(type);
  }

  private async getAttemptContext(attemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        user: { select: { id: true, name: true, employeeNo: true } },
        exam: {
          include: {
            paper: { include: { paperQuestions: true } },
          },
        },
        session: { select: { id: true, name: true } },
        scoreRecord: true,
        assignedGrader: { select: { id: true, name: true } },
        answerRecords: { include: { reviewer: { select: { id: true, name: true } } } },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }

  private scoreMapFromAttempt(
    attempt: Prisma.ExamAttemptGetPayload<{
      include: { exam: { include: { paper: { include: { paperQuestions: true } } } } };
    }>,
  ) {
    return new Map(
      attempt.exam.paper.paperQuestions.map((pq) => [pq.questionId, Number(pq.score)]),
    );
  }

  private subjectiveRecords(
    attempt: Prisma.ExamAttemptGetPayload<{ include: { answerRecords: true } }>,
  ) {
    return attempt.answerRecords.filter((r) =>
      this.isSubjectiveType((r.questionSnapshotJson as unknown as QuestionSnapshot).type),
    );
  }

  private queueStatus(
    attempt: { status: AttemptStatus },
    subjective: Array<{ manualScore: unknown }>,
  ): 'pending' | 'in_progress' | 'completed' {
    if (attempt.status === 'COMPLETED') return 'completed';
    const gradedCount = subjective.filter((r) => r.manualScore !== null).length;
    if (gradedCount === 0) return 'pending';
    return 'in_progress';
  }

  async getQueue(query: GradingQueueQueryDto, user: RequestUser) {
    const where: Prisma.ExamAttemptWhereInput = {
      answerRecords: {
        some: { question: { type: { in: [...SUBJECTIVE_QUESTION_TYPES] } } },
      },
      status: { in: ['GRADING', 'COMPLETED'] },
    };

    if (query.examId) where.examId = query.examId;
    if (query.sessionId) where.sessionId = query.sessionId;

    if (!this.isAdmin(user)) {
      where.OR = [{ assignedGraderId: null }, { assignedGraderId: user.userId }];
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.user = {
        OR: [
          { name: { contains: term } },
          { employeeNo: { contains: term } },
        ],
      };
    }

    const attempts = await this.prisma.examAttempt.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, employeeNo: true } },
        exam: { select: { id: true, title: true, passScore: true } },
        session: { select: { id: true, name: true } },
        scoreRecord: true,
        assignedGrader: { select: { id: true, name: true } },
        answerRecords: {
          include: { question: { select: { type: true } } },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const items = attempts
      .map((attempt) => {
        const subjective = this.subjectiveRecords(attempt);
        const pendingCount = subjective.filter((r) => r.reviewStatus === 'PENDING').length;
        const status = this.queueStatus(attempt, subjective);

        const objectiveScore = Number(attempt.scoreRecord?.objectiveScore ?? 0);
        const subjectiveScore = Number(attempt.scoreRecord?.subjectiveScore ?? 0);
        const totalScore = Number(attempt.scoreRecord?.totalScore ?? objectiveScore + subjectiveScore);
        const passScore = Number(attempt.exam.passScore);

        return {
          attemptId: attempt.id,
          examId: attempt.examId,
          examTitle: attempt.exam.title,
          sessionId: attempt.sessionId,
          sessionName: attempt.session?.name,
          candidateName: attempt.user.name,
          candidateEmployeeNo: attempt.user.employeeNo,
          submittedAt: attempt.submittedAt,
          gradedAt: attempt.scoreRecord?.reviewedAt ?? null,
          objectiveScore,
          subjectiveScore,
          totalScore,
          passScore,
          result: attempt.scoreRecord?.result ?? null,
          pendingQuestionCount: pendingCount,
          totalSubjectiveCount: subjective.length,
          gradingStatus: status,
          attemptStatus: attempt.status,
          assignedGrader: attempt.assignedGrader,
          needsQualityReview: attempt.needsQualityReview,
        };
      })
      .filter((item) => {
        if (!query.status || query.status === 'all') return true;
        return item.gradingStatus === query.status;
      });

    return { data: items, total: items.length };
  }

  async getAttemptForGrading(attemptId: string, user: RequestUser) {
    const attempt = await this.getAttemptContext(attemptId);
    if (!['GRADING', 'COMPLETED'].includes(attempt.status)) {
      throw new BadRequestException('Attempt is not pending manual grading');
    }
    if (!this.canGradeAttempt(attempt, user)) {
      throw new ForbiddenException('This attempt is assigned to another grader');
    }

    const scoreMap = this.scoreMapFromAttempt(attempt);
    const subjective = this.subjectiveRecords(attempt);

    const questions = subjective.map((record, index) => {
      const snapshot = record.questionSnapshotJson as unknown as QuestionSnapshot;
      const maxScore = scoreMap.get(record.questionId) ?? 0;
      const graded = record.manualScore !== null;

      return {
        answerId: record.id,
        questionId: record.questionId,
        questionNumber: index + 1,
        type: snapshot.type,
        stem: snapshot.stem,
        maxScore,
        candidateAnswer: this.formatCandidateAnswer(snapshot.type, record.answerContentJson),
        referenceAnswer: this.formatReferenceAnswer(snapshot),
        scoringRubric: snapshot.scoringRubric ?? '',
        manualScore: record.manualScore !== null ? Number(record.manualScore) : null,
        reviewComment: record.reviewComment,
        reviewStatus: record.reviewStatus,
        graded,
        reviewer: attempt.answerRecords.find((r) => r.id === record.id)?.reviewer ?? null,
        markedForReview: record.markedForReview,
      };
    });

    const objectiveScore = Number(attempt.scoreRecord?.objectiveScore ?? 0);
    const subjectiveScore = subjective.reduce(
      (sum, r) => sum + (r.manualScore !== null ? Number(r.manualScore) : 0),
      0,
    );
    const passScore = Number(attempt.exam.passScore);
    const totalScore = objectiveScore + subjectiveScore;

    return {
      attemptId: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      sessionName: attempt.session?.name,
      candidate: attempt.user,
      submittedAt: attempt.submittedAt,
      attemptStatus: attempt.status,
      needsQualityReview: attempt.needsQualityReview,
      assignedGrader: attempt.assignedGrader,
      objectiveScore,
      subjectiveScore,
      totalScore,
      passScore,
      result: totalScore >= passScore ? 'pass' : 'fail',
      questions,
    };
  }

  async updateAnswer(
    attemptId: string,
    answerId: string,
    user: RequestUser,
    dto: GradeAnswerDto,
  ) {
    const attempt = await this.getAttemptContext(attemptId);
    if (attempt.status !== 'GRADING') {
      throw new BadRequestException('Attempt grading is already finalized');
    }
    if (!this.canGradeAttempt(attempt, user)) {
      throw new ForbiddenException('This attempt is assigned to another grader');
    }

    const record = attempt.answerRecords.find((r) => r.id === answerId);
    if (!record) throw new NotFoundException('Answer not found for this attempt');

    const snapshot = record.questionSnapshotJson as unknown as QuestionSnapshot;
    if (!this.isSubjectiveType(snapshot.type)) {
      throw new BadRequestException('Only subjective answers can be manually graded');
    }

    const scoreMap = this.scoreMapFromAttempt(attempt);
    const maxScore = scoreMap.get(record.questionId) ?? 0;
    if (dto.manualScore > maxScore) {
      throw new BadRequestException(`Score cannot exceed ${maxScore} points`);
    }

    const before = {
      manualScore: record.manualScore,
      reviewComment: record.reviewComment,
    };

    const updated = await this.prisma.answerRecord.update({
      where: { id: answerId },
      data: {
        manualScore: dto.manualScore,
        finalScore: dto.manualScore,
        reviewComment: dto.reviewComment,
        reviewerId: user.userId,
        reviewStatus: 'IN_REVIEW',
        markedForReview: dto.markedForReview ?? record.markedForReview,
      },
    });

    await this.recalculateDraftScores(attemptId);

    await this.auditService.log({
      actorId: user.userId,
      actorRole: user.roles.join(','),
      action: 'GRADE',
      objectType: 'AnswerRecord',
      objectId: answerId,
      objectName: attempt.exam.title,
      beforeData: before,
      afterData: { manualScore: dto.manualScore, reviewComment: dto.reviewComment },
      reason: 'Manual grading score update',
    });

    return {
      answerId: updated.id,
      manualScore: Number(updated.manualScore),
      reviewStatus: updated.reviewStatus,
    };
  }

  private async recalculateDraftScores(attemptId: string) {
    const attempt = await this.getAttemptContext(attemptId);
    const subjective = this.subjectiveRecords(attempt);
    const subjectiveScore = subjective.reduce(
      (sum, r) => sum + (r.manualScore !== null ? Number(r.manualScore) : 0),
      0,
    );
    const objectiveScore = Number(attempt.scoreRecord?.objectiveScore ?? 0);
    const totalScore = objectiveScore + subjectiveScore;
    const passScore = Number(attempt.exam.passScore);

    if (attempt.scoreRecord) {
      await this.prisma.scoreRecord.update({
        where: { attemptId },
        data: {
          subjectiveScore,
          totalScore,
          result: totalScore >= passScore ? 'PASS' : 'FAIL',
        },
      });
    }
  }

  async saveDraft(attemptId: string, user: RequestUser) {
    const attempt = await this.getAttemptContext(attemptId);
    if (attempt.status !== 'GRADING') {
      throw new BadRequestException('Attempt grading is already finalized');
    }
    if (!this.canGradeAttempt(attempt, user)) {
      throw new ForbiddenException('This attempt is assigned to another grader');
    }

    await this.recalculateDraftScores(attemptId);

    await this.auditService.log({
      actorId: user.userId,
      actorRole: user.roles.join(','),
      action: 'GRADE',
      objectType: 'ExamAttempt',
      objectId: attemptId,
      objectName: attempt.exam.title,
      reason: 'Grading draft saved',
    });

    return this.getAttemptForGrading(attemptId, user);
  }

  async submitGrading(attemptId: string, user: RequestUser, dto: SubmitGradingDto = {}) {
    const attempt = await this.getAttemptContext(attemptId);
    if (attempt.status !== 'GRADING') {
      throw new BadRequestException('Attempt grading is already finalized');
    }
    if (!this.canGradeAttempt(attempt, user)) {
      throw new ForbiddenException('This attempt is assigned to another grader');
    }

    const subjective = this.subjectiveRecords(attempt);
    const ungraded = subjective.filter((r) => r.manualScore === null);
    if (ungraded.length > 0) {
      throw new BadRequestException(
        `All subjective questions must be graded before submission (${ungraded.length} remaining)`,
      );
    }

    const scoreMap = this.scoreMapFromAttempt(attempt);
    for (const record of subjective) {
      const maxScore = scoreMap.get(record.questionId) ?? 0;
      if (Number(record.manualScore) > maxScore) {
        throw new BadRequestException('One or more scores exceed the maximum allowed');
      }
    }

    const subjectiveScore = subjective.reduce((sum, r) => sum + Number(r.manualScore), 0);
    const objectiveScore = Number(attempt.scoreRecord?.objectiveScore ?? 0);
    const totalScore = objectiveScore + subjectiveScore;
    const passScore = Number(attempt.exam.passScore);
    const result: PassResult = totalScore >= passScore ? 'PASS' : 'FAIL';

    await this.prisma.$transaction(async (tx) => {
      for (const record of subjective) {
        await tx.answerRecord.update({
          where: { id: record.id },
          data: {
            finalScore: record.manualScore,
            reviewStatus: 'APPROVED',
            reviewerId: user.userId,
          },
        });
      }

      const now = new Date();
      await tx.scoreRecord.upsert({
        where: { attemptId },
        create: {
          attemptId,
          userId: attempt.userId,
          objectiveScore,
          subjectiveScore,
          totalScore,
          passScore,
          result,
          reviewedAt: now,
          publishedAt: now,
        },
        update: {
          subjectiveScore,
          totalScore,
          result,
          reviewedAt: now,
          publishedAt: now,
        },
      });

      await tx.examAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'COMPLETED',
          needsQualityReview: dto.needsQualityReview ?? attempt.needsQualityReview,
          assignedGraderId: attempt.assignedGraderId ?? user.userId,
        },
      });
    });

    await this.auditService.log({
      actorId: user.userId,
      actorRole: user.roles.join(','),
      action: 'SUBMIT',
      objectType: 'ExamAttempt',
      objectId: attemptId,
      objectName: attempt.exam.title,
      afterData: { subjectiveScore, totalScore, result, status: 'COMPLETED' },
      reason: 'Grading submitted',
    });

    return {
      attemptId,
      objectiveScore,
      subjectiveScore,
      totalScore,
      passScore,
      result: result.toLowerCase(),
      status: 'COMPLETED',
    };
  }

  async assignGrader(attemptId: string, dto: AssignGraderDto, user: RequestUser) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Only administrators can assign graders');
    }

    const grader = await this.prisma.user.findUnique({
      where: { id: dto.graderId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!grader) throw new NotFoundException('Grader not found');

    const isGrader = grader.userRoles.some(
      (ur) => ur.role.code === ROLES.GRADER || ur.role.code === ROLES.ADMIN || ur.role.code === ROLES.SUPER_ADMIN,
    );
    if (!isGrader) {
      throw new BadRequestException('Selected user is not a grader');
    }

    const attempt = await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: { assignedGraderId: dto.graderId },
      include: { assignedGrader: { select: { id: true, name: true } } },
    });

    await this.auditService.log({
      actorId: user.userId,
      action: 'UPDATE',
      objectType: 'ExamAttempt',
      objectId: attemptId,
      afterData: { assignedGraderId: dto.graderId },
      reason: 'Grader assigned',
    });

    return {
      attemptId: attempt.id,
      assignedGrader: attempt.assignedGrader,
    };
  }

  async getStats(user: RequestUser) {
    const baseWhere: Prisma.ExamAttemptWhereInput = {
      status: { in: ['GRADING', 'COMPLETED'] },
      answerRecords: {
        some: { question: { type: { in: [...SUBJECTIVE_QUESTION_TYPES] } } },
      },
    };

    if (!this.isAdmin(user)) {
      baseWhere.OR = [{ assignedGraderId: null }, { assignedGraderId: user.userId }];
    }

    const attempts = await this.prisma.examAttempt.findMany({
      where: baseWhere,
      include: { answerRecords: { include: { question: { select: { type: true } } } } },
    });

    let pending = 0;
    let inProgress = 0;
    let completed = 0;

    for (const attempt of attempts) {
      const subjective = this.subjectiveRecords(attempt);
      const status = this.queueStatus(attempt, subjective);
      if (status === 'pending') pending += 1;
      else if (status === 'in_progress') inProgress += 1;
      if (attempt.status === 'COMPLETED') completed += 1;
    }

    return { pending, inProgress, completed, total: attempts.length };
  }

  /** @deprecated Use getQueue */
  findPending() {
    return this.prisma.answerRecord.findMany({
      where: {
        reviewStatus: 'PENDING',
        question: { type: { in: [...SUBJECTIVE_QUESTION_TYPES] } },
      },
      include: {
        attempt: { include: { user: true, exam: true } },
        question: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** @deprecated Use updateAnswer */
  async gradeAnswer(answerId: string, reviewerId: string, dto: GradeAnswerDto) {
    const record = await this.prisma.answerRecord.findUnique({
      where: { id: answerId },
      include: { attempt: true },
    });
    if (!record) throw new NotFoundException('Answer record not found');
    return this.updateAnswer(
      record.attemptId,
      answerId,
      { userId: reviewerId, roles: [ROLES.GRADER], permissions: [], sub: reviewerId, employeeNo: '', name: '' },
      dto,
    );
  }
}
