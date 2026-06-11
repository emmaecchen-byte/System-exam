import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttemptStatus, PassResult, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.module';
import { AuditService } from '../../common/services/audit.service';
import { ROLES, SUBJECTIVE_QUESTION_TYPES } from '../../common/constants';
import { RequestUser } from '../../common/decorators/auth.decorator';
import {
  AnswerQuestionSnapshot,
  formatAnswerForDisplay,
  formatCorrectAnswerForDisplay,
} from '../../common/utils/answer-display.util';
import { AutoGradeService } from '../student/auto-grade.service';
import { RegradeAttemptDto, ResultsQueryDto } from './dto/results.dto';

@Injectable()
export class ResultsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private autoGrade: AutoGradeService,
  ) {}

  private submittedStatuses: AttemptStatus[] = ['SUBMITTED', 'GRADING', 'COMPLETED', 'TIMEOUT'];

  private gradingStatusLabel(status: AttemptStatus): string {
    if (status === 'GRADING') return 'In Progress';
    if (status === 'COMPLETED') return 'Completed';
    return 'Not Started';
  }

  private resultLabel(result?: PassResult | null, attemptStatus?: AttemptStatus): string {
    if (result === 'PASS') return 'Pass';
    if (result === 'FAIL') return 'Fail';
    if (attemptStatus === 'GRADING' || result === 'PENDING') return 'Pending';
    return 'Pending';
  }

  private buildWhere(query: ResultsQueryDto): Prisma.ExamAttemptWhereInput {
    const where: Prisma.ExamAttemptWhereInput = {
      status: { in: this.submittedStatuses },
      submittedAt: {
        not: null,
        ...(query.submittedFrom ? { gte: new Date(query.submittedFrom) } : {}),
        ...(query.submittedTo ? { lte: new Date(query.submittedTo) } : {}),
      },
    };

    if (query.examId) where.examId = query.examId;
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.attemptIds?.length) where.id = { in: query.attemptIds };

    if (query.departmentIds?.length || query.search?.trim()) {
      const userWhere: Prisma.UserWhereInput = {};
      if (query.departmentIds?.length) {
        userWhere.departmentId = { in: query.departmentIds };
      }
      if (query.search?.trim()) {
        const term = query.search.trim();
        userWhere.OR = [{ name: { contains: term } }, { employeeNo: { contains: term } }];
      }
      where.user = userWhere;
    }

    if (query.result && query.result !== 'ALL') {
      where.scoreRecord = { result: query.result };
    }

    if (query.gradingStatus && query.gradingStatus !== 'ALL') {
      if (query.gradingStatus === 'NOT_STARTED') {
        where.status = { in: ['SUBMITTED', 'TIMEOUT'] };
      } else if (query.gradingStatus === 'IN_PROGRESS') {
        where.status = 'GRADING';
      } else if (query.gradingStatus === 'COMPLETED') {
        where.status = 'COMPLETED';
      }
    }

    return where;
  }

  private buildOrderBy(query: ResultsQueryDto): Prisma.ExamAttemptOrderByWithRelationInput {
    const dir = query.sortOrder ?? 'desc';
    switch (query.sortBy) {
      case 'totalScore':
        return { scoreRecord: { totalScore: dir } };
      case 'candidateName':
        return { user: { name: dir } };
      case 'timeSpent':
        return { durationSeconds: dir };
      case 'submittedAt':
      default:
        return { submittedAt: dir };
    }
  }

  private mapAttemptRow(
    attempt: Prisma.ExamAttemptGetPayload<{
      include: {
        user: { include: { department: true } };
        exam: { include: { category: true } };
        session: true;
        scoreRecord: true;
        assignedGrader: { select: { name: true } };
        answerRecords: { include: { reviewer: { select: { name: true } } } };
      };
    }>,
  ) {
    const graders = new Set<string>();
    if (attempt.assignedGrader?.name) graders.add(attempt.assignedGrader.name);
    for (const r of attempt.answerRecords) {
      if (r.reviewer?.name) graders.add(r.reviewer.name);
    }

    return {
      attemptId: attempt.id,
      candidateName: attempt.user.name,
      employeeNo: attempt.user.employeeNo,
      department: attempt.user.department?.name ?? '',
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      examCategory: attempt.exam.category.name,
      sessionId: attempt.sessionId,
      sessionName: attempt.session?.name ?? '',
      startTime: attempt.startedAt,
      submissionTime: attempt.submittedAt,
      timeSpentMinutes: attempt.durationSeconds
        ? Math.round(attempt.durationSeconds / 60)
        : null,
      objectiveScore: Number(attempt.scoreRecord?.objectiveScore ?? 0),
      subjectiveScore: Number(attempt.scoreRecord?.subjectiveScore ?? 0),
      totalScore: Number(attempt.scoreRecord?.totalScore ?? 0),
      passingScore: Number(attempt.exam.passScore),
      result: this.resultLabel(attempt.scoreRecord?.result, attempt.status),
      resultCode: attempt.scoreRecord?.result ?? 'PENDING',
      gradingStatus: this.gradingStatusLabel(attempt.status),
      attemptStatus: attempt.status,
      graderNames: [...graders].join(', '),
    };
  }

  private attemptInclude() {
    return {
      user: { include: { department: true } },
      exam: { include: { category: true } },
      session: true,
      scoreRecord: true,
      assignedGrader: { select: { name: true } },
      answerRecords: { include: { reviewer: { select: { name: true } } } },
    } as const;
  }

  async listResults(query: ResultsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where = this.buildWhere(query);

    const [total, attempts] = await Promise.all([
      this.prisma.examAttempt.count({ where }),
      this.prisma.examAttempt.findMany({
        where,
        include: this.attemptInclude(),
        orderBy: this.buildOrderBy(query),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: attempts.map((a) => this.mapAttemptRow(a)),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getExamResults(examId: string, query: ResultsQueryDto) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');
    return this.listResults({ ...query, examId });
  }

  async getSessionResults(sessionId: string, query: ResultsQueryDto) {
    const session = await this.prisma.examSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    return this.listResults({ ...query, sessionId });
  }

  async getFilterOptions() {
    const [exams, departments, sessions] = await Promise.all([
      this.prisma.exam.findMany({
        where: {
          OR: [
            { status: { not: 'ARCHIVED' } },
            { attempts: { some: { submittedAt: { not: null } } } },
          ],
        },
        select: { id: true, title: true },
        orderBy: { title: 'asc' },
      }),
      this.prisma.department.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.examSession.findMany({
        select: { id: true, name: true, examId: true, startTime: true },
        orderBy: { startTime: 'desc' },
        take: 500,
      }),
    ]);

    return {
      exams,
      departments,
      sessions,
      results: ['ALL', 'PASS', 'FAIL', 'PENDING'],
      gradingStatuses: ['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'],
    };
  }

  async getDetailedResults(attemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        user: { include: { department: true } },
        exam: { include: { category: true, paper: { include: { paperQuestions: true } } } },
        session: true,
        scoreRecord: true,
        assignedGrader: { select: { name: true } },
        answerRecords: { include: { reviewer: { select: { id: true, name: true } } } },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const scoreMap = new Map(
      attempt.exam.paper.paperQuestions.map((pq) => [pq.questionId, Number(pq.score)]),
    );

    const questions = attempt.answerRecords.map((record, index) => {
      const snapshot = record.questionSnapshotJson as unknown as AnswerQuestionSnapshot;
      const maxScore = scoreMap.get(record.questionId) ?? 0;
      const isSubjective = (SUBJECTIVE_QUESTION_TYPES as readonly string[]).includes(
        snapshot.type,
      );

      return {
        answerId: record.id,
        questionNumber: index + 1,
        type: snapshot.type,
        stem: snapshot.stem,
        options: snapshot.optionsJson ?? [],
        maxScore,
        candidateAnswer: formatAnswerForDisplay(snapshot, record.answerContentJson),
        correctAnswer: formatCorrectAnswerForDisplay(snapshot),
        scoringRubric: snapshot.scoringRubric ?? '',
        autoScore: record.autoScore !== null ? Number(record.autoScore) : null,
        manualScore: record.manualScore !== null ? Number(record.manualScore) : null,
        finalScore: record.finalScore !== null ? Number(record.finalScore) : null,
        reviewComment: record.reviewComment,
        reviewer: record.reviewer,
        isSubjective,
        graded: record.finalScore !== null,
      };
    });

    return {
      ...this.mapAttemptRow(attempt),
      questions,
    };
  }

  async regradeAttempt(attemptId: string, dto: RegradeAttemptDto, user: RequestUser) {
    const isAdmin =
      user.roles.includes(ROLES.SUPER_ADMIN) ||
      user.roles.includes(ROLES.ADMIN) ||
      user.permissions.includes('result:correct');

    if (!isAdmin) {
      throw new ForbiddenException('Only administrators can regrade attempts');
    }

    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { scoreRecord: true },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (!attempt.submittedAt) {
      throw new BadRequestException('Attempt has not been submitted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.answerRecord.updateMany({
        where: { attemptId },
        data: {
          autoScore: null,
          manualScore: null,
          finalScore: null,
          reviewStatus: 'PENDING',
          reviewComment: null,
          reviewerId: null,
        },
      });

      if (attempt.scoreRecord) {
        await tx.scoreRecord.delete({ where: { attemptId } });
      }

      await tx.examAttempt.update({
        where: { id: attemptId },
        data: { status: 'SUBMITTED' },
      });
    });

    const gradeResult = await this.autoGrade.autoGradeAttempt(attemptId, attempt.examId);

    if (dto.adjustedScore !== undefined) {
      const exam = await this.prisma.exam.findUnique({
        where: { id: attempt.examId },
        select: { passScore: true },
      });
      const passScore = Number(exam?.passScore ?? 0);
      const adjusted = dto.adjustedScore;
      await this.prisma.scoreRecord.update({
        where: { attemptId },
        data: {
          totalScore: adjusted,
          result: adjusted >= passScore ? 'PASS' : 'FAIL',
        },
      });
    }

    const updatedScore = await this.prisma.scoreRecord.findUnique({ where: { attemptId } });

    await this.auditService.log({
      actorId: user.userId,
      actorRole: user.roles.join(','),
      action: 'CORRECT',
      objectType: 'ExamAttempt',
      objectId: attemptId,
      reason: dto.reason,
      afterData: {
        ...gradeResult,
        adjustedScore: dto.adjustedScore,
        finalTotalScore: updatedScore ? Number(updatedScore.totalScore) : undefined,
      },
    });
    return { regraded: true, ...gradeResult, attemptId };
  }

  async exportResults(query: ResultsQueryDto, user?: RequestUser) {
    const exportQuery = { ...query, page: 1, pageSize: 100000 };
    const { data } = await this.listResults(exportQuery);

    const examTitle =
      query.examId
        ? (await this.prisma.exam.findUnique({ where: { id: query.examId } }))?.title ?? 'Exam'
        : 'AllExams';

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .slice(0, 15);
    const safeName = examTitle.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 40);
    const filename = `${safeName}_${timestamp}.xlsx`;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Exam Results');

    sheet.columns = [
      { header: 'Candidate Name', key: 'candidateName', width: 20 },
      { header: 'Employee No', key: 'employeeNo', width: 14 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Exam Title', key: 'examTitle', width: 28 },
      { header: 'Exam Category', key: 'examCategory', width: 18 },
      { header: 'Session', key: 'sessionName', width: 22 },
      { header: 'Start Time', key: 'startTime', width: 20 },
      { header: 'Submission Time', key: 'submissionTime', width: 20 },
      { header: 'Time Spent (min)', key: 'timeSpentMinutes', width: 14 },
      { header: 'Objective Score', key: 'objectiveScore', width: 14 },
      { header: 'Subjective Score', key: 'subjectiveScore', width: 14 },
      { header: 'Total Score', key: 'totalScore', width: 12 },
      { header: 'Passing Score', key: 'passingScore', width: 14 },
      { header: 'Result', key: 'result', width: 10 },
      { header: 'Grading Status', key: 'gradingStatus', width: 14 },
      { header: 'Grader(s)', key: 'graderNames', width: 20 },
      { header: 'Detail Report', key: 'detailLink', width: 36 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };

    for (const row of data) {
      sheet.addRow({
        ...row,
        startTime: row.startTime ? new Date(row.startTime).toLocaleString() : '',
        submissionTime: row.submissionTime ? new Date(row.submissionTime).toLocaleString() : '',
        detailLink: `/admin/results?attemptId=${row.attemptId}`,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    if (user) {
      await this.auditService.log({
        actorId: user.userId,
        actorRole: user.roles.join(','),
        action: 'EXPORT',
        objectType: 'ExamAttempt',
        objectId: query.examId,
        objectName: examTitle,
        afterData: { rowCount: data.length, filters: query },
        reason: 'Results export',
      });
    }

    return { filename, buffer };
  }

  /** @deprecated */
  async getExamScores(examId: string) {
    const { data } = await this.getExamResults(examId, {});
    return data;
  }

  async getExamStats(examId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');

    const [totalParticipants, completedCount, scores] = await Promise.all([
      this.prisma.examParticipant.count({ where: { examId } }),
      this.prisma.examAttempt.count({
        where: {
          examId,
          status: { in: this.submittedStatuses },
          submittedAt: { not: null },
        },
      }),
      this.prisma.scoreRecord.findMany({
        where: { attempt: { examId } },
        select: { totalScore: true, result: true },
      }),
    ]);

    const graded = scores.filter((s) => s.result === 'PASS' || s.result === 'FAIL');
    const passed = graded.filter((s) => s.result === 'PASS').length;
    const failed = graded.filter((s) => s.result === 'FAIL').length;
    const numericScores = graded.map((s) => Number(s.totalScore));
    const gradedTotal = graded.length;

    return {
      totalParticipants,
      completedCount,
      passRate: gradedTotal ? Math.round((passed / gradedTotal) * 100) : 0,
      failRate: gradedTotal ? Math.round((failed / gradedTotal) * 100) : 0,
      avgScore: gradedTotal
        ? Math.round((numericScores.reduce((a, b) => a + b, 0) / gradedTotal) * 10) / 10
        : 0,
      highestScore: numericScores.length ? Math.max(...numericScores) : 0,
      lowestScore: numericScores.length ? Math.min(...numericScores) : 0,
      participants: gradedTotal,
      passed,
      failed,
      pending: scores.filter((s) => s.result === 'PENDING').length,
      averageScore: gradedTotal
        ? numericScores.reduce((a, b) => a + b, 0) / gradedTotal
        : 0,
    };
  }

  /** @deprecated */
  async exportExamResults(examId: string) {
    return this.exportResults({ examId });
  }
}
