import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, Public } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/decorators/auth.decorator';
import { extractRequestAudit } from '../../common/utils/request-audit.util';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, extractRequestAudit(req));
  }

  @Post('logout')
  @ApiBearerAuth()
  logout(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.authService.logout(user, extractRequestAudit(req));
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: RequestUser) {
    return this.authService.getMe(user.userId);
  }

  @Post('refresh-token')
  @ApiBearerAuth()
  refresh(@CurrentUser() user: RequestUser) {
    return this.authService.refreshToken(user);
  }
}
