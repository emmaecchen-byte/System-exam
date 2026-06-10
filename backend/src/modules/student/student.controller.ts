import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/decorators/auth.decorator';
import { extractRequestAudit } from '../../common/utils/request-audit.util';
import { StudentService } from './student.service';
import {
  BatchSaveAnswersDto,
  CandidateAuditEventDto,
  SaveAnswerDto,
  StartExamDto,
  SubmitExamDto,
} from './dto/student.dto';

@ApiTags('Candidate')
@ApiBearerAuth()
@Controller('student')
export class StudentController {
  constructor(private studentService: StudentService) {}

  @Get('exams')
  listExams(@CurrentUser() user: RequestUser) {
    return this.studentService.listExams(user.userId);
  }

  @Get('exams/:examId')
  getExam(@Param('examId') examId: string, @CurrentUser() user: RequestUser) {
    return this.studentService.getExam(examId, user.userId);
  }

  @Post('exams/:examId/start')
  startExam(
    @Param('examId') examId: string,
    @Body() dto: StartExamDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.studentService.startExam(
      examId,
      user.userId,
      dto.sessionId,
      extractRequestAudit(req),
      user.roles.join(','),
      user.name,
    );
  }

  @Get('attempts/:attemptId')
  getAttempt(@Param('attemptId') attemptId: string, @CurrentUser() user: RequestUser) {
    return this.studentService.getAttempt(attemptId, user.userId);
  }

  @Post('attempts/:attemptId/answers')
  saveAnswer(
    @Param('attemptId') attemptId: string,
    @Body() dto: SaveAnswerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.studentService.saveAnswer(attemptId, user.userId, dto);
  }

  @Put('attempts/:attemptId/answers')
  saveAnswers(
    @Param('attemptId') attemptId: string,
    @Body() dto: BatchSaveAnswersDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.studentService.saveAnswers(attemptId, user.userId, dto);
  }

  @Post('attempts/:attemptId/auto-save')
  autoSave(
    @Param('attemptId') attemptId: string,
    @Body() dto: BatchSaveAnswersDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.studentService.autoSave(
      attemptId,
      user.userId,
      dto,
      extractRequestAudit(req),
      user.roles.join(','),
    );
  }

  @Post('attempts/:attemptId/submit')
  submit(
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitExamDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const submitType = dto.submitType === 'TIMEOUT' ? 'TIMEOUT' : 'MANUAL';
    return this.studentService.submitAttempt(
      attemptId,
      user.userId,
      submitType,
      extractRequestAudit(req),
      user.roles.join(','),
    );
  }

  @Post('attempts/:attemptId/audit-event')
  auditEvent(
    @Param('attemptId') attemptId: string,
    @Body() dto: CandidateAuditEventDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.studentService.logCandidateEvent(
      attemptId,
      user.userId,
      dto,
      extractRequestAudit(req),
      user.roles.join(','),
    );
  }

  @Get('attempts/:attemptId/result')
  result(@Param('attemptId') attemptId: string, @CurrentUser() user: RequestUser) {
    return this.studentService.getResult(attemptId, user.userId);
  }
}
