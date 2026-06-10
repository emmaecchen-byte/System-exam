import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.module';
import { AuditAction } from '@prisma/client';
import { resolveActionCategory } from '../audit/audit-metadata';

export interface AuditLogInput {
  actorId?: string;
  actorRole?: string;
  action: AuditAction;
  actionCategory?: string;
  objectType: string;
  objectId?: string;
  objectName?: string;
  beforeData?: unknown;
  afterData?: unknown;
  ip?: string;
  userAgent?: string;
  deviceInfo?: string;
  reason?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        actionCategory:
          input.actionCategory ?? resolveActionCategory(input.objectType, input.action),
        objectType: input.objectType,
        objectId: input.objectId,
        objectName: input.objectName,
        beforeDataJson: input.beforeData as object,
        afterDataJson: input.afterData as object,
        ip: input.ip,
        userAgent: input.userAgent,
        deviceInfo: input.deviceInfo,
        reason: input.reason,
      },
    });
  }
}
