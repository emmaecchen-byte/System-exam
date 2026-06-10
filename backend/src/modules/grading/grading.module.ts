import { Module } from '@nestjs/common';
import { AuditService } from '../../common/services/audit.service';
import { GradingController, LegacyGradingController } from './grading.controller';
import { GradingService } from './grading.service';

@Module({
  controllers: [GradingController, LegacyGradingController],
  providers: [GradingService, AuditService],
  exports: [GradingService],
})
export class GradingModule {}
