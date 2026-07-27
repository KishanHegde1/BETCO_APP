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
import {
  AdminProductListQueryDto,
  CreateAdminProductDto,
  UpdateAdminProductDto,
} from './dto/admin-product.dto';
import {
  AdminProductResponse,
  PaginatedProductsResponse,
  ProductsService,
} from './products.service';

@ApiTags('Admin Products')
@ApiBearerAuth()
@Controller({ path: 'admin/products', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter catalogue products' })
  findAll(
    @Query() query: AdminProductListQueryDto,
  ): Promise<PaginatedProductsResponse> {
    return this.productsService.findAllForAdmin(query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Get a catalogue product' })
  findOne(@Param('id') id: string): Promise<AdminProductResponse> {
    return this.productsService.findOneForAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a catalogue product' })
  create(@Body() dto: CreateAdminProductDto): Promise<AdminProductResponse> {
    return this.productsService.createForAdmin(dto);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Update a catalogue product' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminProductDto,
  ): Promise<AdminProductResponse> {
    return this.productsService.updateForAdmin(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Delete an unreferenced catalogue product' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.productsService.removeForAdmin(id);
  }
}
