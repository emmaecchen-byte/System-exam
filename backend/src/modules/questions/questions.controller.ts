import {
  BadRequestException,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequestUser } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { QuestionsService } from './questions.service';
import { QuestionImportService } from './question-import.service';
import {
  CreateQuestionDto,
  ImportConfirmDto,
  QueryQuestionDto,
  UpdateQuestionDto,
} from './dto/question.dto';

@ApiTags('Admin - Questions')
@ApiBearerAuth()
@Controller('admin/questions')
@RequirePermissions(PERMISSIONS.QUESTION_MANAGE)
export class QuestionsController {
  constructor(
    private questionsService: QuestionsService,
    private importService: QuestionImportService,
  ) {}

  @Get('import/template')
  @RequirePermissions(PERMISSIONS.QUESTION_IMPORT)
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.importService.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="question-import-template.xlsx"',
    );
    res.send(buffer);
  }

  @Post('import/validate')
  @RequirePermissions(PERMISSIONS.QUESTION_IMPORT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async validateImport(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    return this.importService.validateFile(file.buffer, file.originalname);
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.QUESTION_IMPORT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportConfirmDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      return { importedCount: 0, errors: [{ row: 0, message: 'File is required' }] };
    }
    return this.importService.importFromExcel(
      file.buffer,
      user.userId,
      body.skipInvalidRows !== false,
      file.originalname,
    );
  }

  @Get()
  findAll(@Query() query: QueryQuestionDto) {
    return this.questionsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateQuestionDto, @CurrentUser() user: RequestUser) {
    return this.questionsService.create(dto, user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.questionsService.update(id, dto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.questionsService.remove(id, user.userId);
  }
}
