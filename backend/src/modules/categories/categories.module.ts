import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, AuditService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
