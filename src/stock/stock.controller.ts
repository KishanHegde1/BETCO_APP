import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiQuery,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/constants/user-role.enum';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TodayStockItem } from '../repositories/daily-stock.repository';
import { DealerStockAvailabilityItem, StockService } from './stock.service';

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
      'Every active product and its availability as of the requested date. Exact quantities are visible only to staff and admins.',
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
            isCarriedForward: true,
            isAvailable: true,
            stockUpdatedAt: '2026-07-26T11:30:00.000Z',
          },
        ],
      },
    },
  })
  getTodayStock(
    @Query('date') date?: string,
    @Req() request?: { user?: JwtPayload },
  ): Promise<TodayStockItem[] | DealerStockAvailabilityItem[]> {
    if (request?.user?.role === UserRole.USER) {
      return this.stockService.getDealerStockAvailability(date);
    }
    return this.stockService.getTodayStock(date);
  }
}
