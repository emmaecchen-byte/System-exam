import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { ExamStatusTask } from './exam-status.task';

@Module({
  imports: [ExamsModule],
  providers: [ExamStatusTask],
})
export class TasksModule {}
