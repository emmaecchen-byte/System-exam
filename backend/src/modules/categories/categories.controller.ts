import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequestUser } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '../../common/constants';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  QueryCategoryDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './dto/category.dto';

@ApiTags('Admin - Categories')
@ApiBearerAuth()
@Controller('admin/categories')
@RequirePermissions(PERMISSIONS.CATEGORY_MANAGE)
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  findAll(@Query() query: QueryCategoryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get('options')
  @RequirePermissions(PERMISSIONS.EXAM_MANAGE)
  findOptions(@Query('excludeId') excludeId?: string) {
    return this.categoriesService.findActiveOptions(excludeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: RequestUser) {
    return this.categoriesService.create(dto, user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.update(id, dto, user.userId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.updateStatus(id, dto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.categoriesService.remove(id, user.userId);
  }
}
