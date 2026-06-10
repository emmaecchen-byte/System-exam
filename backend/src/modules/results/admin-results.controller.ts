import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequestUser, Roles } from '../../common/decorators/auth.decorator';
import { PERMISSIONS, ROLES } from '../../common/constants';
import { RegradeAttemptDto, ResultsQueryDto } from './dto/results.dto';
import { ResultsService } from './results.service';

@ApiTags('Admin - Results')
@ApiBearerAuth()
@Controller()
export class AdminResultsController {
  constructor(private resultsService: ResultsService) {}

  @Get('admin/results')
  @RequirePermissions(PERMISSIONS.RESULT_VIEW)
  listResults(@Query() query: ResultsQueryDto) {
    return this.resultsService.listResults(query);
  }

  @Get('admin/results/filters')
  @RequirePermissions(PERMISSIONS.RESULT_VIEW)
  getFilters() {
    return this.resultsService.getFilterOptions();
  }

  @Get('admin/results/export')
  @RequirePermissions(PERMISSIONS.RESULT_EXPORT)
  async export(
    @Query() query: ResultsQueryDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const { filename, buffer } = await this.resultsService.exportResults(query, user);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(buffer));
  }

  @Get('admin/exams/:examId/results')
  @RequirePermissions(PERMISSIONS.RESULT_VIEW)
  getExamResults(@Param('examId') examId: string, @Query() query: ResultsQueryDto) {
    return this.resultsService.getExamResults(examId, query);
  }

  @Get('admin/sessions/:sessionId/results')
  @RequirePermissions(PERMISSIONS.RESULT_VIEW)
  getSessionResults(@Param('sessionId') sessionId: string, @Query() query: ResultsQueryDto) {
    return this.resultsService.getSessionResults(sessionId, query);
  }

  @Get('admin/attempts/:attemptId/detailed-results')
  @RequirePermissions(PERMISSIONS.RESULT_VIEW)
  getDetailedResults(@Param('attemptId') attemptId: string) {
    return this.resultsService.getDetailedResults(attemptId);
  }

  @Post('admin/attempts/:attemptId/regrade')
  @RequirePermissions(PERMISSIONS.RESULT_CORRECT)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  regrade(
    @Param('attemptId') attemptId: string,
    @Body() dto: RegradeAttemptDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.resultsService.regradeAttempt(attemptId, dto, user);
  }
}
