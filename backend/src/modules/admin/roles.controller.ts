import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { UsersService } from '../users/users.service';
import { UpdateRolePermissionsDto } from './dto/admin.dto';

@ApiTags('Admin - Roles')
@ApiBearerAuth()
@Controller('admin/roles')
@RequirePermissions(PERMISSIONS.ROLE_MANAGE)
export class RolesController {
  constructor(private usersService: UsersService) {}

  @Get()
  listRoles() {
    return this.usersService.listRoles();
  }

  @Get('permissions')
  listPermissions() {
    return this.usersService.listPermissions();
  }

  @Put(':id/permissions')
  updatePermissions(@Param('id') id: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.usersService.updateRolePermissions(id, dto);
  }
}
