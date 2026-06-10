import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { ResultsService } from './results.service';

@ApiTags('Admin - Results')
@ApiBearerAuth()
@Controller('admin/exams')
export class ResultsController {
  constructor(private resultsService: ResultsService) {}

  @Get(':id/scores')
  @RequirePermissions(PERMISSIONS.RESULT_VIEW)
  getScores(@Param('id') id: string) {
    return this.resultsService.getExamScores(id);
  }

  @Get(':id/stats')
  @RequirePermissions(PERMISSIONS.RESULT_VIEW)
  getStats(@Param('id') id: string) {
    return this.resultsService.getExamStats(id);
  }

  @Get(':id/export')
  @RequirePermissions(PERMISSIONS.RESULT_EXPORT)
  async export(@Param('id') id: string, @Res() res: Response) {
    const { filename, buffer } = await this.resultsService.exportExamResults(id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(buffer));
  }
}
