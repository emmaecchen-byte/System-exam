import { Module } from '@nestjs/common';
import { AuditService } from '../../common/services/audit.service';
import { StudentModule } from '../student/student.module';
import { AdminResultsController } from './admin-results.controller';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  imports: [StudentModule],
  controllers: [ResultsController, AdminResultsController],
  providers: [ResultsService, AuditService],
  exports: [ResultsService],
})
export class ResultsModule {}
