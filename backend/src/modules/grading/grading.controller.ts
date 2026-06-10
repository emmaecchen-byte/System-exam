import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequestUser, Roles } from '../../common/decorators/auth.decorator';
import { PERMISSIONS, ROLES } from '../../common/constants';
import { GradingService } from './grading.service';
import {
  AssignGraderDto,
  GradeAnswerDto,
  GradingQueueQueryDto,
  SubmitGradingDto,
} from './dto/grading.dto';

@ApiTags('Admin - Grading')
@ApiBearerAuth()
@Controller('admin/grading')
@RequirePermissions(PERMISSIONS.GRADING_MANAGE)
export class GradingController {
  constructor(private gradingService: GradingService) {}

  @Get('queue')
  getQueue(@Query() query: GradingQueueQueryDto, @CurrentUser() user: RequestUser) {
    return this.gradingService.getQueue(query, user);
  }

  @Get('stats')
  getStats(@CurrentUser() user: RequestUser) {
    return this.gradingService.getStats(user);
  }

  @Get('attempts/:attemptId')
  getAttempt(@Param('attemptId') attemptId: string, @CurrentUser() user: RequestUser) {
    return this.gradingService.getAttemptForGrading(attemptId, user);
  }

  @Put('attempts/:attemptId/answers/:answerId')
  updateAnswer(
    @Param('attemptId') attemptId: string,
    @Param('answerId') answerId: string,
    @Body() dto: GradeAnswerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.gradingService.updateAnswer(attemptId, answerId, user, dto);
  }

  @Post('attempts/:attemptId/draft')
  saveDraft(@Param('attemptId') attemptId: string, @CurrentUser() user: RequestUser) {
    return this.gradingService.saveDraft(attemptId, user);
  }

  @Post('attempts/:attemptId/submit')
  submitGrading(
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitGradingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.gradingService.submitGrading(attemptId, user, dto);
  }

  @Post('attempts/:attemptId/assign')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  assignGrader(
    @Param('attemptId') attemptId: string,
    @Body() dto: AssignGraderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.gradingService.assignGrader(attemptId, dto, user);
  }
}

/** @deprecated Legacy routes — use /admin/grading/* */
@ApiTags('Admin - Grading (Legacy)')
@ApiBearerAuth()
@Controller('admin/reviews')
@RequirePermissions(PERMISSIONS.GRADING_MANAGE)
export class LegacyGradingController {
  constructor(private gradingService: GradingService) {}

  @Get('pending')
  findPending() {
    return this.gradingService.findPending();
  }

  @Post(':answerId')
  grade(
    @Param('answerId') answerId: string,
    @Body() dto: GradeAnswerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.gradingService.gradeAnswer(answerId, user.userId, dto);
  }
}
