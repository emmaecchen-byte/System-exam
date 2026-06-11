import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExamStatus, Prisma, UserStatus } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.module';
import { AuditService } from '../../common/services/audit.service';
import { QrTokenCacheService } from '../../common/services/qr-token-cache.service';
import { QrTokenService } from '../../common/services/qr-token.service';
import { resolveQrCodeStatus } from './qr-status.util';
import { GenerateQrDto } from './dto/qr.dto';
import {
  AddParticipantsDto,
  CreateSessionDto,
  ParticipantTargetType,
  UpdateSessionDto,
} from './dto/session.dto';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private qrTokenService: QrTokenService,
    private qrTokenCache: QrTokenCacheService,
    private config: ConfigService,
  ) {}

  async findByExam(examId: string) {
    const sessions = await this.prisma.examSession.findMany({
      where: { examId },
      include: { _count: { select: { participants: true } } },
      orderBy: { startTime: 'asc' },
    });
    return sessions.map((s) => this.toResponse(s));
  }

  async findOne(id: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id },
      include: {
        exam: { select: { id: true, title: true, status: true, maxAttempts: true } },
        _count: { select: { participants: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return this.toResponse(session);
  }

  async createSession(examId: string, dto: CreateSessionDto, actorId?: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');
    if (exam.status === ExamStatus.ARCHIVED || exam.status === ExamStatus.COMPLETED) {
      throw new BadRequestException('Cannot add sessions to closed or archived exams');
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    this.validateSessionTimes(startTime, endTime);

    const session = await this.prisma.examSession.create({
      data: {
        examId,
        name: dto.name.trim(),
        sessionDate: startTime,
        startTime,
        endTime,
        location: dto.location?.trim() || null,
        notes: dto.notes?.trim() || null,
        status: 'DRAFT',
      },
      include: { _count: { select: { participants: true } } },
    });

    await this.auditService.log({
      actorId,
      action: 'CREATE',
      objectType: 'ExamSession',
      objectId: session.id,
      afterData: { examId, name: session.name },
    });

    return this.toResponse(session);
  }

  async updateSession(id: string, dto: UpdateSessionDto, actorId?: string) {
    const session = await this.getSessionOrThrow(id);
    const exam = await this.prisma.exam.findUnique({ where: { id: session.examId } });
    if (exam && exam.status !== ExamStatus.DRAFT && exam.status !== ExamStatus.READY) {
      throw new BadRequestException('Cannot edit sessions of published exams');
    }

    const startTime = dto.startTime ? new Date(dto.startTime) : session.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : session.endTime;
    if (dto.startTime || dto.endTime) {
      this.validateSessionTimes(startTime, endTime);
    }

    const updated = await this.prisma.examSession.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.startTime !== undefined ? { startTime, sessionDate: startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime } : {}),
        ...(dto.location !== undefined ? { location: dto.location?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: { _count: { select: { participants: true } } },
    });

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'ExamSession',
      objectId: id,
      afterData: dto,
    });

    return this.toResponse(updated);
  }

  async removeSession(id: string, actorId?: string) {
    const session = await this.getSessionOrThrow(id);
    const exam = await this.prisma.exam.findUnique({ where: { id: session.examId } });
    if (exam && exam.status !== ExamStatus.DRAFT) {
      throw new BadRequestException('Cannot delete sessions from published exams');
    }

    await this.prisma.examSession.delete({ where: { id } });
    await this.auditService.log({
      actorId,
      action: 'DELETE',
      objectType: 'ExamSession',
      objectId: id,
    });
    return { message: 'Session deleted', id };
  }

  async addParticipants(sessionId: string, dto: AddParticipantsDto, actorId?: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: { exam: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.exam.status === ExamStatus.ARCHIVED) {
      throw new BadRequestException('Cannot modify archived exam participants');
    }

    const userIds = await this.resolveTargetUsers(dto);
    if (userIds.length === 0) {
      throw new BadRequestException('No candidates matched the target criteria');
    }

    const allowedAttempts = session.exam.allowRetake ? session.exam.maxAttempts : 1;
    let added = 0;

    for (const userId of userIds) {
      try {
        await this.prisma.examParticipant.upsert({
          where: {
            examId_userId_sessionId: {
              examId: session.examId,
              userId,
              sessionId,
            },
          },
          update: { allowedAttempts },
          create: {
            examId: session.examId,
            sessionId,
            userId,
            allowedAttempts,
            status: 'ASSIGNED',
          },
        });
        added++;
      } catch {
        // skip duplicates
      }
    }

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'ExamSession',
      objectId: sessionId,
      reason: `Added ${added} participants (${dto.targetType})`,
    });

    return { added, total: userIds.length, sessionId };
  }

  async getParticipants(sessionId: string) {
    const session = await this.getSessionOrThrow(sessionId);
    const participants = await this.prisma.examParticipant.findMany({
      where: { sessionId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            employeeNo: true,
            email: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      sessionId,
      examId: session.examId,
      count: participants.length,
      participants: participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        user: p.user,
        allowedAttempts: p.allowedAttempts,
        status: p.status,
      })),
    };
  }

  async generateQrCode(sessionId: string, dto: GenerateQrDto = {}, actorId?: string) {
    const session = await this.getSessionOrThrow(sessionId);
    if (session.status === 'CLOSED' || session.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot generate QR for a closed or archived session');
    }

    if (dto.candidateId) {
      const participant = await this.prisma.examParticipant.findFirst({
        where: { sessionId, userId: dto.candidateId },
      });
      if (!participant) {
        throw new BadRequestException('Candidate is not assigned to this session');
      }
    }

    const expiresAt = this.resolveQrExpiry(session, dto);
    const token = this.qrTokenService.generateOpaqueToken();
    const hash = this.qrTokenService.hashToken(token);
    const enc = this.qrTokenService.encryptForStorage(token);
    const createdAt = new Date();

    await this.prisma.examSession.update({
      where: { id: sessionId },
      data: {
        qrTokenHash: hash,
        qrTokenEnc: enc,
        qrExpiresAt: expiresAt,
        qrCreatedAt: createdAt,
        qrIsValid: true,
        qrInvalidatedAt: null,
        qrInvalidatedById: null,
        qrMaxScans: dto.maxScans ?? null,
        qrScanCount: 0,
        qrCandidateId: dto.candidateId ?? null,
      },
    });

    const ttlSeconds = Math.max(
      1,
      Math.floor((expiresAt.getTime() - createdAt.getTime()) / 1000),
    );
    await this.qrTokenCache.setToken(hash, {
      sessionId,
      expiresAt: expiresAt.toISOString(),
      isValid: true,
    }, ttlSeconds);

    await this.auditService.log({
      actorId,
      action: 'CREATE',
      objectType: 'ExamSession',
      objectId: sessionId,
      objectName: session.name,
      afterData: {
        qrExpiresAt: expiresAt.toISOString(),
        candidateId: dto.candidateId,
        maxScans: dto.maxScans,
      },
      reason: 'QR code generated',
    });

    return this.buildQrResponse(
      sessionId,
      token,
      expiresAt,
      createdAt,
      {
        ...session,
        qrTokenHash: hash,
        qrExpiresAt: expiresAt,
        qrIsValid: true,
        qrInvalidatedAt: null,
      },
      dto.maxScans,
    );
  }

  async getQrCode(sessionId: string) {
    const session = await this.getSessionOrThrow(sessionId);
    this.assertActiveQrSession(session);

    const token = this.decryptStoredToken(session);
    return this.buildQrResponse(
      sessionId,
      token,
      session.qrExpiresAt!,
      session.qrCreatedAt ?? undefined,
      session,
      session.qrMaxScans ?? undefined,
      false,
    );
  }

  async getQrCodePng(sessionId: string): Promise<Buffer> {
    const session = await this.getSessionOrThrow(sessionId);
    this.assertActiveQrSession(session);
    const token = this.decryptStoredToken(session);
    const entryUrl = this.buildEntryUrl(token);
    return QRCode.toBuffer(entryUrl, { type: 'png', width: 512, margin: 2 });
  }

  async revokeQrToken(sessionId: string, actorId?: string) {
    const session = await this.getSessionOrThrow(sessionId);
    if (!session.qrTokenHash) {
      throw new NotFoundException('No QR code generated for this session.');
    }
    if (!session.qrIsValid) {
      throw new BadRequestException('QR code is already invalidated.');
    }

    const now = new Date();
    await this.prisma.examSession.update({
      where: { id: sessionId },
      data: {
        qrIsValid: false,
        qrInvalidatedAt: now,
        qrInvalidatedById: actorId ?? null,
      },
    });

    if (session.qrTokenHash && session.qrExpiresAt) {
      await this.qrTokenCache.markInvalid(session.qrTokenHash, {
        sessionId,
        expiresAt: session.qrExpiresAt.toISOString(),
        isValid: false,
      });
    }

    await this.auditService.log({
      actorId,
      action: 'DELETE',
      objectType: 'ExamSession',
      objectId: sessionId,
      reason: 'QR token manually invalidated',
    });
    return { sessionId, invalidated: true, invalidatedAt: now.toISOString() };
  }

  async revokeQrTokensForExam(examId: string) {
    const now = new Date();
    const activeSessions = await this.prisma.examSession.findMany({
      where: { examId, qrTokenHash: { not: null }, qrIsValid: true },
      select: { id: true, qrTokenHash: true, qrExpiresAt: true },
    });

    await this.prisma.examSession.updateMany({
      where: { examId, qrTokenHash: { not: null }, qrIsValid: true },
      data: {
        qrIsValid: false,
        qrInvalidatedAt: now,
      },
    });

    for (const row of activeSessions) {
      if (!row.qrTokenHash || !row.qrExpiresAt) continue;
      await this.qrTokenCache.markInvalid(row.qrTokenHash, {
        sessionId: row.id,
        expiresAt: row.qrExpiresAt.toISOString(),
        isValid: false,
      });
    }
  }

  /** Marks QR tokens expired when session end time or configured expiry has passed. */
  async invalidateExpiredQrTokens(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.examSession.updateMany({
      where: {
        qrTokenHash: { not: null },
        qrIsValid: true,
        OR: [{ endTime: { lt: now } }, { qrExpiresAt: { lt: now } }],
      },
      data: {
        qrIsValid: false,
      },
    });
    return result.count;
  }

  private resolveQrExpiry(
    session: { startTime: Date; endTime: Date },
    dto: GenerateQrDto,
  ): Date {
    const now = new Date();
    let expiry: Date;

    if (dto.expiresAt) {
      expiry = new Date(dto.expiresAt);
    } else if (dto.validityDays) {
      expiry = new Date(now.getTime() + dto.validityDays * 24 * 3600 * 1000);
    } else if (dto.expiresInHours) {
      expiry = new Date(now.getTime() + dto.expiresInHours * 3600 * 1000);
    } else {
      expiry = session.endTime;
    }

    // QR never remains valid after the session ends
    if (expiry > session.endTime) {
      expiry = session.endTime;
    }

    if (expiry <= now) {
      throw new BadRequestException('QR expiration must be in the future');
    }
    return expiry;
  }

  private getApiPublicBaseUrl(): string {
    return (
      this.config.get<string>('API_PUBLIC_URL')
      ?? this.config.get<string>('APP_URL')
      ?? `http://localhost:${this.config.get<string>('PORT') ?? '3000'}`
    ).replace(/\/$/, '');
  }

  private buildEntryUrl(token: string): string {
    return `${this.getApiPublicBaseUrl()}/api/public/exam-entry?token=${encodeURIComponent(token)}`;
  }

  private async buildQrResponse(
    sessionId: string,
    token: string,
    expiresAt: Date,
    createdAt: Date | undefined,
    session: {
      qrTokenHash: string | null;
      qrIsValid: boolean;
      qrExpiresAt: Date | null;
      qrInvalidatedAt: Date | null;
      endTime: Date;
      status: string;
    },
    maxScans?: number | null,
    includeToken = true,
  ) {
    const entryUrl = this.buildEntryUrl(token);
    const qrDataUrl = await QRCode.toDataURL(entryUrl, { width: 280, margin: 2 });
    const qrStatus = resolveQrCodeStatus(session);
    return {
      entryUrl,
      entryPath: `/api/public/exam-entry?token=${encodeURIComponent(token)}`,
      ...(includeToken ? { token } : {}),
      expiresAt,
      createdAt: createdAt ?? null,
      maxScans: maxScans ?? null,
      qrStatus,
      qrDataUrl,
      qrPngDataUrl: qrDataUrl,
      qrImageUrl: `/api/admin/sessions/${sessionId}/qr-code/image`,
    };
  }

  private assertActiveQrSession(session: {
    qrTokenHash: string | null;
    qrTokenEnc: string | null;
    qrExpiresAt: Date | null;
    qrIsValid: boolean;
    qrInvalidatedAt: Date | null;
    endTime: Date;
    status: string;
  }) {
    if (!session.qrTokenHash || !session.qrTokenEnc || !session.qrExpiresAt) {
      throw new NotFoundException('No QR code generated for this session. Generate one first.');
    }

    const status = resolveQrCodeStatus(session);
    if (status === 'invalidated') {
      throw new BadRequestException('This QR code has been invalidated.');
    }
    if (status === 'expired') {
      throw new BadRequestException('This QR code has expired.');
    }
  }

  private decryptStoredToken(session: { qrTokenEnc: string | null }): string {
    if (!session.qrTokenEnc) {
      throw new NotFoundException('QR token not available. Regenerate the QR code.');
    }
    try {
      return this.qrTokenService.decryptFromStorage(session.qrTokenEnc);
    } catch {
      throw new BadRequestException('Stored QR token is invalid. Regenerate the QR code.');
    }
  }

  private async resolveTargetUsers(dto: AddParticipantsDto): Promise<string[]> {
    const candidateRole = await this.prisma.role.findUnique({ where: { code: 'CANDIDATE' } });
    if (!candidateRole) return [];

    const baseWhere: Prisma.UserWhereInput = {
      status: UserStatus.ACTIVE,
      userRoles: { some: { roleId: candidateRole.id } },
    };

    if (dto.targetType === ParticipantTargetType.ALL) {
      const users = await this.prisma.user.findMany({
        where: baseWhere,
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    if (dto.targetType === ParticipantTargetType.DEPARTMENTS) {
      if (!dto.departmentIds?.length) {
        throw new BadRequestException('departmentIds required for department target');
      }
      const users = await this.prisma.user.findMany({
        where: {
          ...baseWhere,
          departmentId: { in: dto.departmentIds },
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    if (dto.targetType === ParticipantTargetType.USERS) {
      if (!dto.userIds?.length) {
        throw new BadRequestException('userIds required for user target');
      }
      const users = await this.prisma.user.findMany({
        where: {
          ...baseWhere,
          id: { in: dto.userIds },
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    return [];
  }

  private validateSessionTimes(start: Date, end: Date) {
    if (start >= end) {
      throw new BadRequestException('Session end time must be after start time');
    }
  }

  private async getSessionOrThrow(id: string) {
    const session = await this.prisma.examSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private toResponse(
    session: Prisma.ExamSessionGetPayload<{
      include: { _count: { select: { participants: true } } };
    }> & { exam?: { id: string; title: string; status: ExamStatus; maxAttempts: number } },
  ) {
    return {
      id: session.id,
      examId: session.examId,
      name: session.name,
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      location: session.location,
      notes: session.notes,
      status: session.status,
      statusLabel: this.statusLabel(session.status),
      participantCount: session._count?.participants ?? 0,
      exam: session.exam,
      qrExpiresAt: session.qrExpiresAt,
      qrCreatedAt: session.qrCreatedAt,
      qrIsValid: session.qrIsValid,
      qrInvalidatedAt: session.qrInvalidatedAt,
      qrInvalidatedById: session.qrInvalidatedById,
      qrMaxScans: session.qrMaxScans,
      qrScanCount: session.qrScanCount,
      qrCandidateId: session.qrCandidateId,
      hasQrToken: Boolean(session.qrTokenHash),
      qrStatus: resolveQrCodeStatus(session),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private statusLabel(status: string) {
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
