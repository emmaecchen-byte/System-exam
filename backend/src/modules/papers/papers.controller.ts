import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequestUser } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { PapersService } from './papers.service';
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
  create(@Body() dto: CreatePaperDto, @CurrentUser() user: RequestUser) {
    return this.papersService.create(dto, user.userId);
  }

  @Get(':id/versions')
  getVersions(@Param('id') id: string) {
    return this.papersService.getVersions(id);
  }

  @Get(':id/preview')
  preview(@Param('id') id: string) {
    return this.papersService.preview(id);
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
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePaperDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.papersService.update(id, dto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.papersService.remove(id, user.userId);
  }
}
