import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequestUser } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { PapersService } from './papers.service';
import { PaperAttachmentInterceptor } from './paper-attachment.interceptor';
import {
  AddPaperQuestionsDto,
  CreatePaperDto,
  QueryPaperDto,
  ReorderPaperQuestionsDto,
  UpdatePaperDto,
  UpdatePaperQuestionScoreDto,
} from './dto/paper.dto';

@ApiTags('Admin - Papers')
@ApiBearerAuth()
@Controller('admin/papers')
@RequirePermissions(PERMISSIONS.PAPER_MANAGE)
export class PapersController {
  constructor(private papersService: PapersService) {}

  @Get('options/published')
  @RequirePermissions(PERMISSIONS.EXAM_MANAGE)
  findPublishedOptions() {
    return this.papersService.findPublishedOptions();
  }

  @Get()
  findAll(@Query() query: QueryPaperDto) {
    return this.papersService.findAll(query);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(PaperAttachmentInterceptor)
  create(
    @Body() dto: CreatePaperDto,
    @UploadedFile() attachment: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.papersService.create(dto, user.userId, attachment);
  }

  @Get(':id/versions')
  getVersions(@Param('id') id: string) {
    return this.papersService.getVersions(id);
  }

  @Get(':id/preview')
  preview(@Param('id') id: string) {
    return this.papersService.preview(id);
  }

  @Get(':id/attachment')
  async downloadAttachment(@Param('id') id: string, @Res() res: Response) {
    const file = await this.papersService.getAttachmentFile(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    if (file.size) {
      res.setHeader('Content-Length', String(file.size));
    }
    file.stream.pipe(res);
  }

  @Delete(':id/attachment')
  removeAttachment(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.papersService.removeAttachment(id, user.userId);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.papersService.publish(id, user.userId);
  }

  @Post(':id/new-version')
  createNewVersion(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.papersService.createNewVersion(id, user.userId, user.userId);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.papersService.archive(id, user.userId);
  }

  @Post(':id/unarchive')
  unarchive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.papersService.unarchive(id, user.userId);
  }

  @Post(':id/questions')
  addQuestions(
    @Param('id') id: string,
    @Body() dto: AddPaperQuestionsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.papersService.addQuestions(id, dto, user.userId);
  }

  @Delete(':id/questions/:questionId')
  removeQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.papersService.removeQuestion(id, questionId, user.userId);
  }

  @Put(':id/questions/reorder')
  reorderQuestions(
    @Param('id') id: string,
    @Body() dto: ReorderPaperQuestionsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.papersService.reorderQuestions(id, dto, user.userId);
  }

  @Put(':id/questions/:questionId/score')
  updateQuestionScore(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdatePaperQuestionScoreDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.papersService.updateQuestionScore(id, questionId, dto, user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.papersService.findOne(id);
  }

  @Put(':id')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(PaperAttachmentInterceptor)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePaperDto,
    @UploadedFile() attachment: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.papersService.update(id, dto, user.userId, attachment);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.papersService.remove(id, user.userId);
  }
}
