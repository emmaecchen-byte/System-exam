import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { UsersService } from '../users/users.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/admin.dto';

@ApiTags('Admin - Departments')
@ApiBearerAuth()
@Controller('admin/departments')
@RequirePermissions(PERMISSIONS.USER_MANAGE)
export class DepartmentsController {
  constructor(private usersService: UsersService) {}

  @Get()
  findTree(@Query('includeInactive') includeInactive?: string) {
    return this.usersService.findDepartmentTree(includeInactive === 'true');
  }

  @Post()
  create(@Body() dto: CreateDepartmentDto) {
    return this.usersService.createDepartment(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.usersService.updateDepartment(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.deleteDepartment(id);
  }
}
