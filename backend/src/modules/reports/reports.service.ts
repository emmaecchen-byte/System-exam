import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';

type Difficulty = 'easy' | 'medium' | 'hard';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private resolveRange(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = startDate ? new Date(startDate) : new Date(end);
    if (!startDate) start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  private round1(value: number) {
    return Math.round(value * 10) / 10;
  }

  private mapQuestionType(type: string) {
    return type.toLowerCase();
  }

  private difficultyFromRate(rate: number): Difficulty {
    if (rate >= 80) return 'easy';
    if (rate < 60) return 'hard';
    return 'medium';
  }

  private averageDifficulty(rates: number[]): Difficulty {
    if (!rates.length) return 'medium';
    const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    return this.difficultyFromRate(avg);
  }

  private submittedAtFilter(start?: Date, end?: Date): Prisma.DateTimeNullableFilter | undefined {
    if (!start && !end) return undefined;
    return {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    };
  }

  async getDepartmentStats(examId: string, startDate?: string, endDate?: string) {
    await this.assertExam(examId);
    const { start, end } = this.resolveRange(startDate, endDate);
    const submittedFilter = this.submittedAtFilter(start, end);

    const scores = await this.prisma.scoreRecord.findMany({
      where: {
        result: { in: ['PASS', 'FAIL'] },
        attempt: {
          examId,
          ...(submittedFilter ? { submittedAt: submittedFilter } : {}),
        },
      },
      include: {
        attempt: { include: { user: { include: { department: true } } } },
      },
    });

    const deptMap = new Map<
      string,
      { name: string; pass: number; total: number; scoreSum: number }
    >();

    for (const score of scores) {
      const dept = score.attempt.user.department;
      const key = dept?.id ?? 'none';
      const name = dept?.name ?? 'Unassigned';
      const bucket = deptMap.get(key) ?? { name, pass: 0, total: 0, scoreSum: 0 };
      bucket.total += 1;
      bucket.scoreSum += Number(score.totalScore);
      if (score.result === 'PASS') bucket.pass += 1;
      deptMap.set(key, bucket);
    }

    const departments = [...deptMap.values()]
      .map((d) => ({
        name: d.name,
        participantCount: d.total,
        passRate: d.total ? this.round1((d.pass / d.total) * 100) : 0,
        avgScore: d.total ? this.round1(d.scoreSum / d.total) : 0,
      }))
      .sort((a, b) => b.participantCount - a.participantCount);

    const overallTotal = scores.length;
    const overallPass = scores.filter((s) => s.result === 'PASS').length;
    const overallScoreSum = scores.reduce((sum, s) => sum + Number(s.totalScore), 0);

    return {
      departments,
      overall: {
        passRate: overallTotal ? this.round1((overallPass / overallTotal) * 100) : 0,
        avgScore: overallTotal ? this.round1(overallScoreSum / overallTotal) : 0,
      },
    };
  }

  async getQuestionAnalysis(examId: string) {
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

    const paperQuestions = exam.paper.paperQuestions;
    const questionIds = paperQuestions.map((pq) => pq.questionId);

    const answerRecords = await this.prisma.answerRecord.findMany({
      where: {
        questionId: { in: questionIds },
        attempt: {
          examId,
          status: { in: ['SUBMITTED', 'GRADING', 'COMPLETED', 'TIMEOUT'] },
        },
      },
      select: {
        questionId: true,
        autoScore: true,
        finalScore: true,
        manualScore: true,
      },
    });

    const statsMap = new Map<
      string,
      { correct: number; total: number; scoreSum: number }
    >();
    for (const record of answerRecords) {
      const bucket = statsMap.get(record.questionId) ?? { correct: 0, total: 0, scoreSum: 0 };
      bucket.total += 1;
      const final = Number(record.finalScore ?? record.manualScore ?? record.autoScore ?? 0);
      bucket.scoreSum += final;
      const max = Number(record.autoScore ?? 0);
      const pq = paperQuestions.find((q) => q.questionId === record.questionId);
      const maxScore = pq ? Number(pq.score) : max;
      if (maxScore > 0 && final >= maxScore * 0.99) bucket.correct += 1;
      else if (maxScore === 0 && final > 0) bucket.correct += 1;
      statsMap.set(record.questionId, bucket);
    }

    const questions = paperQuestions.map((pq, index) => {
      const snapshot = pq.questionSnapshotJson as { stem?: string; type?: string };
      const stats = statsMap.get(pq.questionId) ?? { correct: 0, total: 0, scoreSum: 0 };
      const maxScore = Number(pq.score);
      const correctRate = stats.total ? this.round1((stats.correct / stats.total) * 100) : 0;
      const averageScore = stats.total ? this.round1(stats.scoreSum / stats.total) : 0;
      return {
        id: index + 1,
        questionId: pq.questionId,
        stem: (snapshot.stem ?? '').slice(0, 200),
        type: this.mapQuestionType(snapshot.type ?? 'UNKNOWN'),
        correctCount: stats.correct,
        totalAttempts: stats.total,
        correctRate,
        averageScore,
        maxScore,
        difficulty: this.difficultyFromRate(correctRate),
      };
    });

    const withAttempts = questions.filter((q) => q.totalAttempts > 0);
    const sortedByRate = [...withAttempts].sort((a, b) => a.correctRate - b.correctRate);
    const easiest = sortedByRate.length
      ? sortedByRate[sortedByRate.length - 1]
      : null;
    const hardest = sortedByRate[0] ?? null;

    return {
      questions: questions.sort((a, b) => a.correctRate - b.correctRate),
      summary: {
        easiestQuestion: easiest
          ? { id: easiest.id, stem: easiest.stem, correctRate: easiest.correctRate }
          : null,
        hardestQuestion: hardest
          ? { id: hardest.id, stem: hardest.stem, correctRate: hardest.correctRate }
          : null,
        averageDifficulty: this.averageDifficulty(withAttempts.map((q) => q.correctRate)),
      },
    };
  }

  async getCategoryTrend(
    categoryId: string,
    startDate?: string,
    endDate?: string,
    interval: 'day' | 'week' | 'month' = 'week',
  ) {
    await this.assertCategory(categoryId);
    const { start, end } = this.resolveRange(startDate, endDate);

    const exams = await this.prisma.exam.findMany({
      where: { categoryId },
      select: { id: true },
    });
    const examIds = exams.map((e) => e.id);
    if (!examIds.length) {
      return { points: [], interval };
    }

    const scores = await this.prisma.scoreRecord.findMany({
      where: {
        result: { in: ['PASS', 'FAIL'] },
        attempt: {
          examId: { in: examIds },
          submittedAt: { gte: start, lte: end },
        },
      },
      select: {
        result: true,
        totalScore: true,
        createdAt: true,
        attempt: { select: { submittedAt: true } },
      },
    });

    const bucketMap = new Map<string, { pass: number; total: number; scoreSum: number }>();

    for (const score of scores) {
      const date = score.attempt.submittedAt ?? score.createdAt;
      const key = this.bucketKey(date, interval);
      const bucket = bucketMap.get(key) ?? { pass: 0, total: 0, scoreSum: 0 };
      bucket.total += 1;
      bucket.scoreSum += Number(score.totalScore);
      if (score.result === 'PASS') bucket.pass += 1;
      bucketMap.set(key, bucket);
    }

    const points = [...bucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, bucket]) => ({
        period,
        passRate: bucket.total ? this.round1((bucket.pass / bucket.total) * 100) : 0,
        avgScore: bucket.total ? this.round1(bucket.scoreSum / bucket.total) : 0,
        total: bucket.total,
      }));

    return { points, interval };
  }

  /** Legacy summary endpoint used by older Reports UI */
  async getSummary(from?: string, to?: string) {
    const { start, end } = this.resolveRange(from, to);

    const scores = await this.prisma.scoreRecord.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        result: { in: ['PASS', 'FAIL'] },
      },
      include: {
        attempt: {
          include: {
            user: { include: { department: true } },
          },
        },
      },
    });

    const weekMap = new Map<string, { pass: number; total: number }>();
    for (const score of scores) {
      const d = score.createdAt;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      const bucket = weekMap.get(key) ?? { pass: 0, total: 0 };
      bucket.total += 1;
      if (score.result === 'PASS') bucket.pass += 1;
      weekMap.set(key, bucket);
    }

    const passRateTrend = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, bucket]) => ({
        week,
        passRate: bucket.total ? Math.round((bucket.pass / bucket.total) * 100) : 0,
        total: bucket.total,
      }));

    const deptMap = new Map<string, { name: string; pass: number; total: number }>();
    for (const score of scores) {
      const dept = score.attempt.user.department;
      const key = dept?.id ?? 'none';
      const name = dept?.name ?? 'Unassigned';
      const bucket = deptMap.get(key) ?? { name, pass: 0, total: 0 };
      bucket.total += 1;
      if (score.result === 'PASS') bucket.pass += 1;
      deptMap.set(key, bucket);
    }

    const departmentComparison = [...deptMap.values()]
      .map((d) => ({
        department: d.name,
        passRate: d.total ? Math.round((d.pass / d.total) * 100) : 0,
        total: d.total,
      }))
      .sort((a, b) => b.total - a.total);

    const answerRecords = await this.prisma.answerRecord.findMany({
      where: {
        attempt: { submittedAt: { gte: start, lte: end } },
        question: { type: { in: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'] } },
      },
      include: { question: { select: { stem: true, type: true } } },
    });

    const questionMap = new Map<
      string,
      { stem: string; type: string; correct: number; total: number }
    >();
    for (const record of answerRecords) {
      const key = record.questionId;
      const bucket = questionMap.get(key) ?? {
        stem: record.question.stem.slice(0, 80),
        type: record.question.type,
        correct: 0,
        total: 0,
      };
      bucket.total += 1;
      const max = Number(record.autoScore ?? 0);
      const final = Number(record.finalScore ?? record.autoScore ?? 0);
      if (max > 0 && final >= max) bucket.correct += 1;
      else if (max === 0 && final > 0) bucket.correct += 1;
      questionMap.set(key, bucket);
    }

    const questionAccuracy = [...questionMap.entries()]
      .map(([questionId, q]) => ({
        questionId,
        stem: q.stem,
        type: q.type,
        accuracy: q.total ? Math.round((q.correct / q.total) * 100) : 0,
        attempts: q.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 20);

    return { passRateTrend, departmentComparison, questionAccuracy };
  }

  private bucketKey(date: Date, interval: 'day' | 'week' | 'month') {
    const d = new Date(date);
    if (interval === 'day') return d.toISOString().slice(0, 10);
    if (interval === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    return weekStart.toISOString().slice(0, 10);
  }

  private async assertExam(examId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
    if (!exam) throw new NotFoundException('Exam not found');
  }

  private async assertCategory(categoryId: string) {
    const category = await this.prisma.examCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
  }
}
