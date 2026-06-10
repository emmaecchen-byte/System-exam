import { Module } from '@nestjs/common';
import { PapersController } from './papers.controller';
import { PapersService } from './papers.service';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [PapersController],
  providers: [PapersService, AuditService],
  exports: [PapersService],
})
export class PapersModule {}
