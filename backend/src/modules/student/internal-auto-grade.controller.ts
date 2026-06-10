import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/current-user.decorator';
import { InternalApiGuard } from '../../common/guards/internal-api.guard';
import { AutoGradeService } from './auto-grade.service';

@ApiTags('Internal - Auto Grade')
@Controller('internal/exams')
@Public()
@UseGuards(InternalApiGuard)
export class InternalAutoGradeController {
  constructor(private autoGradeService: AutoGradeService) {}

  @Post(':examId/attempts/:attemptId/auto-grade')
  @ApiHeader({ name: 'X-Internal-Key', required: false })
  autoGrade(
    @Param('examId') examId: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.autoGradeService.autoGradeAttempt(attemptId, examId);
  }
}
