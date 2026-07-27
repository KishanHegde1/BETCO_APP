import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
import { AdminDailyStockItem } from '../repositories/daily-stock.repository';
import {
  AdminDailyStockQueryDto,
  CopyDailyStockDto,
  PatchDailyStockDto,
  SetDailyStockDto,
} from './dto/admin-daily-stock.dto';
import { StockService } from './stock.service';

@ApiTags('Admin Daily Stock')
@ApiBearerAuth()
@Controller({ path: 'admin/daily-stock', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminStockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  @ApiOperation({ summary: 'List daily stock for the selected date' })
  list(
    @Query('date') date: string,
    @Query() query: AdminDailyStockQueryDto,
  ): Promise<AdminDailyStockItem[]> {
    return this.stockService.getAdminStockForDate(date, query);
  }

  @Get(':date')
  @ApiParam({ name: 'date', example: '2026-07-26' })
  @ApiOperation({ summary: 'View every catalogue item and stock for one date' })
  getForDate(
    @Param('date') date: string,
    @Query() query: AdminDailyStockQueryDto,
  ): Promise<AdminDailyStockItem[]> {
    return this.stockService.getAdminStockForDate(date, query);
  }

  @Put(':date')
  @ApiParam({ name: 'date', example: '2026-07-26' })
  @ApiOperation({ summary: 'Set stock for multiple products atomically' })
  setForDate(
    @Param('date') date: string,
    @Body() dto: SetDailyStockDto,
  ): Promise<AdminDailyStockItem[]> {
    return this.stockService.setAdminStockForDate(date, dto);
  }

  @Patch(':date/products/:productId')
  @ApiOperation({ summary: 'Update stock for one product' })
  patchProduct(
    @Param('date') date: string,
    @Param('productId') productId: string,
    @Body() dto: PatchDailyStockDto,
  ): Promise<AdminDailyStockItem> {
    return this.stockService.patchAdminStockProduct(date, productId, dto);
  }

  @Post(':date/copy')
  @ApiParam({ name: 'date', example: '2026-07-26' })
  @ApiOperation({ summary: 'Copy stock from another date' })
  copyFromDate(
    @Param('date') date: string,
    @Body() dto: CopyDailyStockDto,
  ): Promise<AdminDailyStockItem[]> {
    return this.stockService.copyAdminStockForDate(date, dto);
  }
}
