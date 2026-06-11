import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import {
  CategoryTrendQueryDto,
  ExamReportQueryDto,
  ReportsSummaryQueryDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('Admin - Reports')
@ApiBearerAuth()
@Controller('admin/reports')
@RequirePermissions(PERMISSIONS.RESULT_VIEW)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('summary')
  getSummary(@Query() query: ReportsSummaryQueryDto) {
    return this.reportsService.getSummary(query.from, query.to);
  }

  @Get('department-stats')
  getDepartmentStats(@Query() query: ExamReportQueryDto) {
    return this.reportsService.getDepartmentStats(query.examId, query.startDate, query.endDate);
  }

  @Get('question-analysis')
  getQuestionAnalysis(@Query() query: ExamReportQueryDto) {
    return this.reportsService.getQuestionAnalysis(query.examId);
  }

  @Get('category-trend')
  getCategoryTrend(@Query() query: CategoryTrendQueryDto) {
    return this.reportsService.getCategoryTrend(
      query.categoryId,
      query.startDate,
      query.endDate,
      query.interval ?? 'week',
    );
  }
}
