import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequestUser } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { ExamsService } from './exams.service';
import { SessionsService } from './sessions.service';
import { CreateExamDto, QueryExamDto, UpdateExamDto } from './dto/exam.dto';
import { GenerateQrDto } from './dto/qr.dto';
import {
  AddParticipantsDto,
  CreateSessionDto,
  UpdateSessionDto,
} from './dto/session.dto';

@ApiTags('Admin - Exams')
@ApiBearerAuth()
@Controller('admin/exams')
@RequirePermissions(PERMISSIONS.EXAM_MANAGE)
export class ExamsController {
  constructor(
    private examsService: ExamsService,
    private sessionsService: SessionsService,
  ) {}

  @Get()
  findAll(@Query() query: QueryExamDto) {
    return this.examsService.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateExamDto, @CurrentUser() user: RequestUser) {
    return this.examsService.create(dto, user.userId);
  }

  @Get(':examId/sessions')
  listSessions(@Param('examId') examId: string) {
    return this.sessionsService.findByExam(examId);
  }

  @Post(':examId/sessions')
  @RequirePermissions(PERMISSIONS.SESSION_MANAGE)
  createSession(
    @Param('examId') examId: string,
    @Body() dto: CreateSessionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessionsService.createSession(examId, dto, user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.examsService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.examsService.update(id, dto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.examsService.remove(id, user.userId);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.EXAM_PUBLISH)
  publish(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.examsService.publish(id, user.userId);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.EXAM_PUBLISH)
  close(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.examsService.close(id, user.userId);
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.EXAM_PUBLISH)
  archive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.examsService.archive(id, user.userId);
  }

  @Post(':id/publish-results')
  @RequirePermissions(PERMISSIONS.RESULT_EXPORT)
  publishResults(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.examsService.publishResults(id, user.userId);
  }

  @Post(':id/unpublish-results')
  @RequirePermissions(PERMISSIONS.RESULT_EXPORT)
  unpublishResults(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.examsService.unpublishResults(id, user.userId);
  }
}

@ApiTags('Admin - Sessions')
@ApiBearerAuth()
@Controller('admin/sessions')
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Post(':id/add-participants')
  @RequirePermissions(PERMISSIONS.EXAM_MANAGE)
  addParticipants(
    @Param('id') id: string,
    @Body() dto: AddParticipantsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessionsService.addParticipants(id, dto, user.userId);
  }

  @Get(':id/participants')
  @RequirePermissions(PERMISSIONS.EXAM_MANAGE)
  getParticipants(@Param('id') id: string) {
    return this.sessionsService.getParticipants(id);
  }

  @Post(':id/generate-qr')
  @RequirePermissions(PERMISSIONS.SESSION_MANAGE)
  generateQr(
    @Param('id') id: string,
    @Body() dto: GenerateQrDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessionsService.generateQrCode(id, dto, user.userId);
  }

  @Get(':id/qr-code/image')
  @RequirePermissions(PERMISSIONS.SESSION_MANAGE)
  @Header('Content-Type', 'image/png')
  async getQrImage(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.sessionsService.getQrCodePng(id);
    res.send(buffer);
  }

  @Get(':id/qr-code')
  @RequirePermissions(PERMISSIONS.SESSION_MANAGE)
  getQr(@Param('id') id: string) {
    return this.sessionsService.getQrCode(id);
  }

  @Delete(':id/qr-token')
  @RequirePermissions(PERMISSIONS.SESSION_MANAGE)
  revokeQr(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.sessionsService.revokeQrToken(id, user.userId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SESSION_MANAGE)
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.SESSION_MANAGE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessionsService.updateSession(id, dto, user.userId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SESSION_MANAGE)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.sessionsService.removeSession(id, user.userId);
  }
}
