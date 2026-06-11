import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExamsService } from '../exams/exams.service';
import { SessionsService } from '../exams/sessions.service';

@Injectable()
export class ExamStatusTask {
  private readonly logger = new Logger(ExamStatusTask.name);

  constructor(
    private readonly examsService: ExamsService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Cron('* * * * *')
  async handleExamStatusUpdates() {
    await this.sessionsService.invalidateExpiredQrTokens();
    const result = await this.examsService.updateExamStatuses();
    if (result.started > 0 || result.closed > 0) {
      this.logger.log(
        `Exam status sync: ${result.started} started, ${result.closed} closed`,
      );
    }
  }
}
