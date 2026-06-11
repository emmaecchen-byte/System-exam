import { Module } from '@nestjs/common';
import { ExamsController, SessionsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { ExamLifecycleService } from './exam-lifecycle.service';
import { SessionsService } from './sessions.service';
import { AuditService } from '../../common/services/audit.service';
import { QrTokenService } from '../../common/services/qr-token.service';

@Module({
  controllers: [ExamsController, SessionsController],
  providers: [ExamsService, ExamLifecycleService, SessionsService, AuditService, QrTokenService],
  exports: [ExamsService, ExamLifecycleService, SessionsService],
})
export class ExamsModule {}
