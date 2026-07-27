import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiQuery,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TodayStockItem } from '../repositories/daily-stock.repository';
import { StockService } from './stock.service';

@ApiBearerAuth()
@ApiTags('Daily Stock')
@Controller({ path: 'daily-stock', version: '1' })
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('today')
  @ApiOperation({
    summary: 'List catalogue stock carried forward to the requested date',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    example: '2026-07-27',
    description:
      'ISO date to resolve stock as of. Defaults to the current application date.',
  })
  @ApiOkResponse({
    description:
      'Every active product and its available quantity as of the requested date.',
    schema: {
      example: {
        success: true,
        data: [
          {
            productId: 'uuid',
            sku: 'ILTT-18060-PRO',
            productName: 'ILTT 18060 PRO',
            unit: 'PIECE',
            categoryId: 'uuid',
            categoryName: 'Battery Inverters',
            sourceStockDate: '2026-07-26',
            quantity: 25,
            isCarriedForward: true,
            isAvailable: true,
            stockUpdatedAt: '2026-07-26T11:30:00.000Z',
          },
        ],
      },
    },
  })
  getTodayStock(@Query('date') date?: string): Promise<TodayStockItem[]> {
    return this.stockService.getTodayStock(date);
  }
}
