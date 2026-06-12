import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.module';
import { QrTokenCacheService } from '../../common/services/qr-token-cache.service';
import { QrTokenService } from '../../common/services/qr-token.service';

export type ExamEntryStatus =
  | 'ok'
  | 'invalid'
  | 'expired'
  | 'invalidated'
  | 'login_required'
  | 'unauthorized'
  | 'completed'
  | 'exam_unavailable'
  | 'scan_limit_reached';

export interface ExamEntryResult {
  status: ExamEntryStatus;
  message?: string;
  examId?: string;
  sessionId?: string;
  examTitle?: string;
  examDescription?: string | null;
  sessionName?: string;
  durationMinutes?: number;
  passScore?: number;
  instructions?: string[];
  sessionStartTime?: string;
  sessionEndTime?: string;
  withinTimeWindow?: boolean;
  canStart?: boolean;
  inProgressAttemptId?: string;
  requiresLogin?: boolean;
}

const DEFAULT_INSTRUCTIONS = [
  'Ensure you have a stable internet connection before starting.',
  'Answers are saved automatically during the exam.',
  'The exam will auto-submit when time expires.',
  'Do not refresh the page after submission.',
];

@Injectable()
export class QrEntryService {
  constructor(
    private prisma: PrismaService,
    private qrTokenService: QrTokenService,
    private qrTokenCache: QrTokenCacheService,
  ) {}

  async resolveToken(token: string, userId?: string): Promise<ExamEntryResult> {
    const base = await this.validateToken(token, { countScan: false });
    if (base.status !== 'ok' || !base.sessionId || !base.examId) {
      return base;
    }

    if (!userId) {
      return {
        ...base,
        status: 'login_required',
        requiresLogin: true,
        message: 'Please log in to verify your identity before starting the exam.',
      };
    }

    return this.verifyCandidateAccess(base, userId);
  }

  async previewToken(token: string): Promise<ExamEntryResult> {
    return this.validateToken(token, { countScan: true });
  }

  private async validateToken(
    token: string,
    options: { countScan?: boolean },
  ): Promise<ExamEntryResult> {
    if (!token?.trim()) {
      return { status: 'invalid', message: 'Missing exam entry token.' };
    }

    const hash = this.qrTokenService.hashToken(token.trim());
    const cached = await this.qrTokenCache.getToken(hash);

    const session = await this.prisma.examSession.findFirst({
      where: cached ? { id: cached.sessionId } : { qrTokenHash: hash },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            durationMinutes: true,
            passScore: true,
            allowRetake: true,
            maxAttempts: true,
          },
        },
      },
    });

    if (!session || !session.qrTokenEnc) {
      return {
        status: 'invalid',
        message: 'This QR code is invalid. Please contact your administrator.',
      };
    }

    const now = new Date();

    if (cached && !cached.isValid) {
      return {
        status: 'invalidated',
        message: 'This QR code has been invalidated.',
        examTitle: session.exam.title,
        sessionName: session.name,
      };
    }

    if (cached && new Date(cached.expiresAt) < now) {
      return {
        status: 'expired',
        message: 'This QR code has expired.',
        examTitle: session.exam.title,
        sessionName: session.name,
      };
    }

    if (!cached && session.qrTokenHash && session.qrExpiresAt && session.qrIsValid) {
      const ttlSeconds = Math.max(
        1,
        Math.floor((session.qrExpiresAt.getTime() - now.getTime()) / 1000),
      );
      await this.qrTokenCache.setToken(
        session.qrTokenHash,
        {
          sessionId: session.id,
          expiresAt: session.qrExpiresAt.toISOString(),
          isValid: true,
        },
        ttlSeconds,
      );
    }

    if (session.qrInvalidatedAt) {
      return {
        status: 'invalidated',
        message: 'This QR code has been invalidated.',
        examTitle: session.exam.title,
        sessionName: session.name,
      };
    }

    if (
      !session.qrIsValid
      || !session.qrExpiresAt
      || session.qrExpiresAt < now
      || session.endTime < now
      || session.status === 'CLOSED'
      || session.status === 'ARCHIVED'
    ) {
      return {
        status: 'expired',
        message: 'This QR code has expired.',
        examTitle: session.exam.title,
        sessionName: session.name,
      };
    }

    if (session.qrMaxScans != null && session.qrScanCount >= session.qrMaxScans) {
      return {
        status: 'scan_limit_reached',
        message: 'QR code has already been used.',
      };
    }

    if (options.countScan && session.qrMaxScans != null) {
      await this.prisma.examSession.update({
        where: { id: session.id },
        data: { qrScanCount: { increment: 1 } },
      });
    }

    if (!['PUBLISHED', 'IN_PROGRESS'].includes(session.exam.status)) {
      return {
        status: 'exam_unavailable',
        message: 'This exam is not currently available.',
        examTitle: session.exam.title,
        sessionName: session.name,
      };
    }

    const nowMs = now.getTime();
    const withinTimeWindow =
      nowMs >= session.startTime.getTime() && nowMs <= session.endTime.getTime();

    return {
      status: 'ok',
      examId: session.exam.id,
      sessionId: session.id,
      examTitle: session.exam.title,
      examDescription: session.exam.description,
      sessionName: session.name,
      durationMinutes: session.exam.durationMinutes,
      passScore: Number(session.exam.passScore),
      instructions: DEFAULT_INSTRUCTIONS,
      sessionStartTime: session.startTime.toISOString(),
      sessionEndTime: session.endTime.toISOString(),
      withinTimeWindow,
      canStart: withinTimeWindow,
      message: withinTimeWindow
        ? undefined
        : 'The exam session has not started yet or has already ended.',
    };
  }

  private async verifyCandidateAccess(
    base: ExamEntryResult,
    userId: string,
  ): Promise<ExamEntryResult> {
    const examId = base.examId!;
    const sessionId = base.sessionId!;

    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      select: { qrCandidateId: true },
    });

    if (session?.qrCandidateId && session.qrCandidateId !== userId) {
      return {
        ...base,
        status: 'unauthorized',
        canStart: false,
        message: 'You are not registered for this exam.',
      };
    }

    const participant = await this.prisma.examParticipant.findFirst({
      where: {
        examId,
        userId,
        OR: [{ sessionId }, { sessionId: null }],
      },
    });

    if (!participant) {
      return {
        ...base,
        status: 'unauthorized',
        canStart: false,
        message: 'You are not registered for this exam.',
      };
    }

    const inProgress = await this.prisma.examAttempt.findFirst({
      where: { examId, userId, sessionId, status: 'IN_PROGRESS' },
    });
    if (inProgress) {
      return {
        ...base,
        status: 'ok',
        canStart: true,
        inProgressAttemptId: inProgress.id,
        message: 'You have an exam in progress. Continue where you left off.',
      };
    }

    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return { status: 'invalid', message: 'Exam not found.' };
    }

    const submittedCount = await this.prisma.examAttempt.count({
      where: {
        examId,
        userId,
        sessionId,
        status: { in: ['SUBMITTED', 'GRADING', 'COMPLETED'] },
      },
    });

    const allowedAttempts = participant.allowedAttempts ?? exam.maxAttempts;
    if (submittedCount >= allowedAttempts && !exam.allowRetake) {
      return {
        ...base,
        status: 'completed',
        canStart: false,
        message: 'You have already completed this exam.',
      };
    }

    if (submittedCount >= allowedAttempts) {
      return {
        ...base,
        status: 'completed',
        canStart: false,
        message: 'You have used all allowed attempts for this exam.',
      };
    }

    if (!base.withinTimeWindow) {
      return {
        ...base,
        status: 'ok',
        canStart: false,
        message: base.message ?? 'Outside the session time window.',
      };
    }

    return {
      ...base,
      status: 'ok',
      canStart: true,
    };
  }
}
