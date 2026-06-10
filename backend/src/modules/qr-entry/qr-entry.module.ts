import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QrTokenService } from '../../common/services/qr-token.service';
import { QrEntryController } from './qr-entry.controller';
import { QrEntryService } from './qr-entry.service';

@Module({
  imports: [AuthModule],
  controllers: [QrEntryController],
  providers: [QrEntryService, QrTokenService],
})
export class QrEntryModule {}
