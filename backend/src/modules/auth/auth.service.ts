import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.module';
import { AuditLogInput, AuditService } from '../../common/services/audit.service';
import { RequestAuditContext } from '../../common/utils/request-audit.util';
import { JwtPayload, RequestUser } from '../../common/decorators/auth.decorator';
import { ROLE_PERMISSION_MAP, RoleCode } from '../../common/constants';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditService: AuditService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto, ctx: RequestAuditContext = {}) {
    const identifier = dto.identifier.trim();
    const emailLookup = identifier.includes('@') ? identifier.toLowerCase() : identifier;
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ employeeNo: identifier }, { email: emailLookup }],
      },
      include: {
        department: true,
        userRoles: { include: { role: true } },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      await this.safeAuditLog({
        action: 'LOGIN_FAILED',
        objectType: 'User',
        objectName: identifier,
        afterData: { reason: 'User not found or inactive' },
        ...ctx,
      });
      throw new UnauthorizedException('Invalid email/employee number or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.safeAuditLog({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        objectType: 'User',
        objectId: user.id,
        objectName: user.name,
        afterData: { reason: 'Invalid password' },
        ...ctx,
      });
      throw new UnauthorizedException('Invalid email/employee number or password');
    }

    const roles = user.userRoles.map((ur) => ur.role.code as RoleCode);
    const permissions = [...new Set(roles.flatMap((r) => ROLE_PERMISSION_MAP[r] ?? []))];
    const expiresIn = dto.rememberMe
      ? this.config.get<string>('JWT_REMEMBER_EXPIRES_IN') ?? '7d'
      : this.config.get<string>('JWT_EXPIRES_IN') ?? '8h';

    const payload: JwtPayload = {
      sub: user.id,
      employeeNo: user.employeeNo,
      name: user.name,
      roles,
      permissions,
    };

    await this.safeAuditLog({
      actorId: user.id,
      actorRole: roles.join(','),
      action: 'LOGIN',
      objectType: 'User',
      objectId: user.id,
      objectName: user.name,
      ...ctx,
    });

    const accessToken = this.jwtService.sign(payload, { expiresIn });

    return {
      accessToken,
      expiresIn,
      user: this.toUserResponse(user, roles, permissions),
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: true,
        userRoles: { include: { role: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User inactive or not found');
    }
    const roles = user.userRoles.map((ur) => ur.role.code as RoleCode);
    const permissions = [...new Set(roles.flatMap((r) => ROLE_PERMISSION_MAP[r] ?? []))];
    return this.toUserResponse(user, roles, permissions);
  }

  async logout(user: RequestUser, ctx: RequestAuditContext = {}) {
    await this.auditService.log({
      actorId: user.userId,
      actorRole: user.roles.join(','),
      action: 'LOGOUT',
      objectType: 'User',
      objectId: user.userId,
      objectName: user.name,
      ...ctx,
    });
    return { message: 'Logged out successfully' };
  }

  async refreshToken(user: RequestUser) {
    const fresh = await this.getMe(user.userId);
    const payload: JwtPayload = {
      sub: fresh.id,
      employeeNo: fresh.employeeNo,
      name: fresh.name,
      roles: fresh.roles as RoleCode[],
      permissions: fresh.permissions,
    };
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN') ?? '8h';
    const accessToken = this.jwtService.sign(payload, { expiresIn });
    return { accessToken, expiresIn, user: fresh };
  }

  async validatePayload(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User inactive or not found');
    }
    const roles = user.userRoles.map((ur) => ur.role.code as RoleCode);
    const permissions = [...new Set(roles.flatMap((r) => ROLE_PERMISSION_MAP[r] ?? []))];
    return {
      userId: user.id,
      sub: user.id,
      employeeNo: user.employeeNo,
      name: user.name,
      roles,
      permissions,
    };
  }

  private toUserResponse(
    user: {
      id: string;
      name: string;
      employeeNo: string;
      email: string | null;
      department: { id: string; name: string } | null;
    },
    roles: RoleCode[],
    permissions: string[],
  ) {
    return {
      id: user.id,
      name: user.name,
      employeeNo: user.employeeNo,
      email: user.email,
      department: user.department,
      roles,
      permissions,
      primaryRole: this.resolvePrimaryRole(roles),
    };
  }

  private async safeAuditLog(input: AuditLogInput) {
    try {
      await this.auditService.log(input);
    } catch {
      // Login must succeed even if audit logging fails (e.g. DB migration drift).
    }
  }

  resolvePrimaryRole(roles: RoleCode[]): RoleCode {
    const priority: RoleCode[] = [
      'SUPER_ADMIN',
      'ADMIN',
      'EXAM_ADMIN',
      'GRADER',
      'CANDIDATE',
    ];
    return priority.find((r) => roles.includes(r)) ?? roles[0];
  }
}
