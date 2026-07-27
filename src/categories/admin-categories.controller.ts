import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Category } from '../entities/category.entity';
import {
  AdminCategoryListQueryDto,
  CreateAdminCategoryDto,
  UpdateAdminCategoryDto,
} from './dto/admin-category.dto';
import { CategoriesService } from './categories.service';

@ApiTags('Admin Categories')
@ApiBearerAuth()
@Controller({ path: 'admin/categories', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories for catalogue administration' })
  findAll(@Query() query: AdminCategoryListQueryDto): Promise<Category[]> {
    return this.categoriesService.findAllForAdmin(query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Get a category for administration' })
  findOne(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.findOneForAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a catalogue category' })
  create(@Body() dto: CreateAdminCategoryDto): Promise<Category> {
    return this.categoriesService.createForAdmin(dto);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Update a catalogue category' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.updateForAdmin(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Delete an empty catalogue category' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.categoriesService.removeForAdmin(id);
  }
}
