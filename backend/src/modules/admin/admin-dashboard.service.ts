import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.module';

@Injectable()
export class AdminDashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalExams, totalUsers, pendingGrading, monthScores] = await Promise.all([
      this.prisma.exam.count({ where: { status: { not: 'ARCHIVED' } } }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.examAttempt.count({
        where: { status: { in: ['GRADING', 'SUBMITTED'] } },
      }),
      this.prisma.scoreRecord.findMany({
        where: {
          createdAt: { gte: monthStart },
          result: { in: ['PASS', 'FAIL'] },
        },
        select: { result: true },
      }),
    ]);

    const passCount = monthScores.filter((s) => s.result === 'PASS').length;
    const passRateThisMonth = monthScores.length
      ? Math.round((passCount / monthScores.length) * 100)
      : 0;

    return { totalExams, totalUsers, pendingGrading, passRateThisMonth };
  }

  async getRecentActivity() {
    const logs = await this.prisma.auditLog.findMany({
      take: 12,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true } } },
    });
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      objectType: log.objectType,
      objectName: log.objectName,
      actorName: log.actor?.name ?? 'System',
      createdAt: log.createdAt,
    }));
  }

  async getExamCompletions() {
    const days = 7;
    const points: Array<{ date: string; count: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const count = await this.prisma.examAttempt.count({
        where: {
          submittedAt: { gte: dayStart, lt: dayEnd },
          status: { in: ['SUBMITTED', 'GRADING', 'COMPLETED'] },
        },
      });

      points.push({
        date: dayStart.toISOString().slice(0, 10),
        count,
      });
    }

    return points;
  }
}
