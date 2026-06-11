import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { ReportsQueryDto } from './dto/admin.dto';
import { AdminReportsService } from './admin-reports.service';

@ApiTags('Admin - Reports')
@ApiBearerAuth()
@Controller('admin/reports')
@RequirePermissions(PERMISSIONS.RESULT_VIEW)
export class AdminReportsController {
  constructor(private reportsService: AdminReportsService) {}

  @Get('summary')
  getSummary(@Query() query: ReportsQueryDto) {
    return this.reportsService.getSummary(query.from, query.to);
  }
}
