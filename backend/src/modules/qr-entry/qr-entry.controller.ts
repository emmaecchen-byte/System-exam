import { Body, Controller, Get, Headers, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { IsString } from 'class-validator';
import { Public } from '../../common/decorators/current-user.decorator';
import { renderQrEntryErrorHtml } from './qr-entry-html.util';
import { QrEntryService } from './qr-entry.service';

class VerifyEntryDto {
  @IsString()
  token!: string;
}

@ApiTags('Public - Exam Entry')
@Controller('public/exam-entry')
export class QrEntryController {
  constructor(
    private qrEntryService: QrEntryService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  /**
   * QR codes point here. Browsers are redirected to the SPA entry page;
   * API clients may request JSON via Accept: application/json.
   */
  @Public()
  @Get()
  async preview(
    @Query('token') token: string,
    @Headers('accept') accept: string | undefined,
    @Res() res: Response,
  ) {
    if (!token?.trim()) {
      return res.status(400).json({ status: 'invalid', message: 'Missing exam entry token.' });
    }

    const trimmed = token.trim();
    const wantsJson = accept?.includes('application/json');
    const result = await this.qrEntryService.previewToken(trimmed);

    if (!wantsJson) {
      if (
        result.status === 'expired'
        || result.status === 'invalidated'
        || result.status === 'invalid'
        || result.status === 'scan_limit_reached'
      ) {
        const statusCode = result.status === 'invalid' ? 404 : 410;
        return res.status(statusCode).type('text/html').send(renderQrEntryErrorHtml(result));
      }

      const frontend = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173').replace(
        /\/$/,
        '',
      );
      return res.redirect(
        302,
        `${frontend}/exam-entry?token=${encodeURIComponent(trimmed)}`,
      );
    }

    return res.json(result);
  }

  @Public()
  @Post('verify')
  verify(
    @Body() dto: VerifyEntryDto,
    @Headers('authorization') authorization?: string,
  ) {
    const userId = this.extractUserId(authorization);
    return this.qrEntryService.resolveToken(dto.token.trim(), userId);
  }

  private extractUserId(authorization?: string): string | undefined {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    try {
      const payload = this.jwtService.verify<{ sub: string }>(authorization.slice(7));
      return payload.sub;
    } catch {
      return undefined;
    }
  }
}
