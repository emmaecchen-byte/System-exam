import { Module } from '@nestjs/common';
import { AuditService } from '../../common/services/audit.service';
import { AuditController } from './audit.controller';
import { AuditLogsService } from './audit-logs.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditLogsService],
  exports: [AuditService],
})
export class AuditModule {}
