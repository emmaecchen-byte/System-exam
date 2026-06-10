import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { QuestionImportService } from './question-import.service';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionImportService, AuditService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
