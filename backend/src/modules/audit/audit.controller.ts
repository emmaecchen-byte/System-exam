import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequestUser } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { AuditService } from '../../common/services/audit.service';
import { AuditExportQueryDto, AuditLogsQueryDto } from './dto/audit-logs.dto';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('Admin - Audit')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AuditController {
  constructor(
    private auditLogsService: AuditLogsService,
    private auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  findAll(@Query() query: AuditLogsQueryDto) {
    return this.auditLogsService.list(query);
  }

  @Get('actions')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  getActions() {
    return this.auditLogsService.getActionTypes();
  }

  @Get('actors')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  getActors() {
    return this.auditLogsService.getFilterActors();
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  async export(
    @Query() query: AuditExportQueryDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const format = query.format ?? 'xlsx';
    const { filename, buffer, contentType } = await this.auditLogsService.export(query, format);

    await this.auditService.log({
      actorId: user.userId,
      actorRole: user.roles.join(','),
      action: 'EXPORT',
      objectType: 'AuditLog',
      objectName: 'Audit log export',
      afterData: { format, filters: query },
      reason: 'Audit log export',
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  }
}
