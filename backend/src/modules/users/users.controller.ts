import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { CreateUserDto, UpdateUserDto } from '../admin/dto/admin.dto';
import { UsersService } from './users.service';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@Controller('admin/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('departments')
  @RequirePermissions(PERMISSIONS.EXAM_MANAGE)
  findDepartments() {
    return this.usersService.findDepartments();
  }

  @Get()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  findAll(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.usersService.findAll(search, role, includeInactive === 'true');
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  remove(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  @Get('candidates/search')
  @RequirePermissions(PERMISSIONS.EXAM_MANAGE)
  searchCandidates(@Query('q') q?: string) {
    return this.usersService.findAll(q, 'CANDIDATE');
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
