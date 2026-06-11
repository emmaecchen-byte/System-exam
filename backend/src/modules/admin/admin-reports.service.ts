import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.module';

@Injectable()
export class AdminReportsService {
  constructor(private prisma: PrismaService) {}

  private resolveRange(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = from ? new Date(from) : new Date(end);
    if (!from) start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

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

    const passRateTrend: Array<{ week: string; passRate: number; total: number }> = [];
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

    for (const [week, bucket] of [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      passRateTrend.push({
        week,
        passRate: bucket.total ? Math.round((bucket.pass / bucket.total) * 100) : 0,
        total: bucket.total,
      });
    }

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
      include: {
        question: { select: { stem: true, type: true } },
      },
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
}
