import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@RequirePermissions(PERMISSIONS.RESULT_VIEW)
export class AdminDashboardController {
  constructor(private dashboardService: AdminDashboardService) {}

  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('activity')
  getActivity() {
    return this.dashboardService.getRecentActivity();
  }

  @Get('completions')
  getCompletions() {
    return this.dashboardService.getExamCompletions();
  }
}
