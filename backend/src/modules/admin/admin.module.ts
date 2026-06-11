import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { DepartmentsController } from './departments.controller';
import { RolesController } from './roles.controller';

@Module({
  imports: [UsersModule],
  controllers: [
    AdminDashboardController,
    AdminReportsController,
    DepartmentsController,
    RolesController,
  ],
  providers: [AdminDashboardService, AdminReportsService],
})
export class AdminModule {}
