import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { DepartmentsController } from './departments.controller';
import { RolesController } from './roles.controller';

@Module({
  imports: [UsersModule],
  controllers: [
    AdminDashboardController,
    DepartmentsController,
    RolesController,
  ],
  providers: [AdminDashboardService],
})
export class AdminModule {}
