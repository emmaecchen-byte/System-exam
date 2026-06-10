import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.module';
import {
  AUDIT_ACTION_CATEGORIES,
  formatActionKey,
  getActionLabel,
  listAuditActionOptions,
  resolveActionCategory,
} from '../../common/audit/audit-metadata';
import { AuditLogsQueryDto } from './dto/audit-logs.dto';

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  private buildWhere(query: AuditLogsQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};

    if (query.actorId) where.actorId = query.actorId;
    if (query.actions?.length) where.action = { in: query.actions };
    if (query.actionCategory) where.actionCategory = query.actionCategory;
    if (query.objectType) where.objectType = query.objectType;

    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { objectName: { contains: term } },
        { reason: { contains: term } },
        { objectType: { contains: term } },
        { actor: { name: { contains: term } } },
        { actor: { employeeNo: { contains: term } } },
      ];
    }

    return where;
  }

  private mapRow(
    log: Prisma.AuditLogGetPayload<{ include: { actor: { select: { id: true; name: true; employeeNo: true } } } }>,
  ) {
    let deviceInfo: { browser?: string; os?: string } | null = null;
    if (log.deviceInfo) {
      try {
        deviceInfo = JSON.parse(log.deviceInfo);
      } catch {
        deviceInfo = { browser: log.deviceInfo, os: '' };
      }
    }

    return {
      id: log.id,
      timestamp: log.createdAt,
      actorId: log.actorId,
      actorName: log.actor?.name ?? 'System',
      actorEmployeeNo: log.actor?.employeeNo ?? null,
      actorRole: log.actorRole,
      action: log.action,
      actionKey: formatActionKey(log.action, log.objectType),
      actionLabel: getActionLabel(log.action),
      actionCategory: log.actionCategory ?? resolveActionCategory(log.objectType, log.action),
      objectType: log.objectType,
      objectId: log.objectId,
      objectName: log.objectName,
      beforeData: log.beforeDataJson,
      afterData: log.afterDataJson,
      ipAddress: log.ip,
      userAgent: log.userAgent,
      deviceInfo,
      reason: log.reason,
    };
  }

  async list(query: AuditLogsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where = this.buildWhere(query);

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, employeeNo: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: logs.map((log) => this.mapRow(log)),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  getActionTypes() {
    return {
      actions: listAuditActionOptions(),
      categories: Object.entries(AUDIT_ACTION_CATEGORIES).map(([value, label]) => ({
        value,
        label,
      })),
      objectTypes: [
        'User',
        'ExamCategory',
        'Question',
        'QuestionImport',
        'Paper',
        'Exam',
        'ExamSession',
        'ExamAttempt',
        'AnswerRecord',
        'ScoreRecord',
        'AuditLog',
      ],
    };
  }

  async getFilterActors() {
    const actors = await this.prisma.auditLog.findMany({
      distinct: ['actorId'],
      where: { actorId: { not: null } },
      select: {
        actorId: true,
        actor: { select: { id: true, name: true, employeeNo: true } },
      },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });
    return actors
      .filter((a) => a.actor)
      .map((a) => ({
        id: a.actor!.id,
        name: a.actor!.name,
        employeeNo: a.actor!.employeeNo,
      }));
  }

  async export(query: AuditLogsQueryDto, format: 'xlsx' | 'json' = 'xlsx') {
    const { data } = await this.list({ ...query, page: 1, pageSize: 100000 });

    if (format === 'json') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      return {
        filename: `audit_logs_${timestamp}.json`,
        buffer: Buffer.from(JSON.stringify(data, null, 2)),
        contentType: 'application/json',
      };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Audit Logs');
    sheet.columns = [
      { header: 'Timestamp', key: 'timestamp', width: 22 },
      { header: 'Actor', key: 'actorName', width: 18 },
      { header: 'Role', key: 'actorRole', width: 16 },
      { header: 'Action', key: 'actionLabel', width: 16 },
      { header: 'Category', key: 'actionCategory', width: 18 },
      { header: 'Object Type', key: 'objectType', width: 14 },
      { header: 'Object Name', key: 'objectName', width: 24 },
      { header: 'Object ID', key: 'objectId', width: 22 },
      { header: 'IP', key: 'ipAddress', width: 16 },
      { header: 'Reason', key: 'reason', width: 28 },
      { header: 'Before', key: 'beforeData', width: 30 },
      { header: 'After', key: 'afterData', width: 30 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

    for (const row of data) {
      sheet.addRow({
        ...row,
        timestamp: new Date(row.timestamp).toISOString(),
        beforeData: row.beforeData ? JSON.stringify(row.beforeData) : '',
        afterData: row.afterData ? JSON.stringify(row.afterData) : '',
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const buffer = await workbook.xlsx.writeBuffer();
    return {
      filename: `audit_logs_${timestamp}.xlsx`,
      buffer: Buffer.from(buffer),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
