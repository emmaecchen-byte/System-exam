import { SetMetadata } from '@nestjs/common';
import { PermissionCode, RoleCode } from '../constants';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface JwtPayload {
  sub: string;
  employeeNo: string;
  name: string;
  roles: RoleCode[];
  permissions: string[];
}

export interface RequestUser extends JwtPayload {
  userId: string;
}
