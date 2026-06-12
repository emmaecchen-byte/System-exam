import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExamsModule } from '../exams/exams.module';
import { LlmModule } from '../llm/llm.module';
import { TimerModule } from '../timer/timer.module';
import { InternalApiGuard } from '../../common/guards/internal-api.guard';
import { CandidateController } from './candidate.controller';
import { InternalAutoGradeController } from './internal-auto-grade.controller';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { AutoGradeService } from './auto-grade.service';

@Module({
  imports: [AuditModule, ExamsModule, LlmModule, forwardRef(() => TimerModule)],
  controllers: [StudentController, CandidateController, InternalAutoGradeController],
  providers: [StudentService, AutoGradeService, InternalApiGuard],
  exports: [StudentService, AutoGradeService],
})
export class StudentModule {}
