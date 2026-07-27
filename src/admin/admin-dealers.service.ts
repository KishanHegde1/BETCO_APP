import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AdminDealerOrdersQueryDto } from './dto/admin-dealer-orders-query.dto';
import { AdminDealersQueryDto } from './dto/admin-dealers-query.dto';
import {
  BusinessDateRange,
  currentMonthBusinessRange,
  inclusiveBusinessDateRange,
  previousMonthBusinessRange,
} from '../common/utils/business-date.util';
import { AdminDealersRepository } from '../repositories/admin-dealers.repository';
import { OrdersRepository } from '../repositories/orders.repository';

@Injectable()
export class AdminDealersService {
  constructor(
    private readonly dealersRepository: AdminDealersRepository,
    private readonly ordersRepository: OrdersRepository,
  ) {}

  findAll(query: AdminDealersQueryDto) {
    return this.dealersRepository.findPage(query, currentMonthBusinessRange());
  }

  async findOne(dealerId: string) {
    const details = await this.dealersRepository.findDetails(
      dealerId,
      currentMonthBusinessRange(),
      previousMonthBusinessRange(),
    );
    if (!details) {
      throw new NotFoundException('Dealer not found.');
    }
    return details;
  }

  async findOrders(dealerId: string, query: AdminDealerOrdersQueryDto) {
    await this.requireDealer(dealerId);
    const period = this.resolvePeriod(query);
    const page = await this.ordersRepository.findAdminPage({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      dealerId,
      fromDate: period?.fromDate,
      toDate: period?.toDate,
      sortOrder: 'DESC',
    });
    return {
      items: page.items,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems: page.total,
        totalPages: Math.ceil(page.total / query.limit),
      },
    };
  }

  async findAnalytics(dealerId: string, query: AdminDealerOrdersQueryDto) {
    await this.requireDealer(dealerId);
    const period = this.resolvePeriod(query);
    const analytics = await this.dealersRepository.findAnalytics(
      dealerId,
      period,
    );
    return {
      period: {
        type: query.period,
        fromDate: period?.fromDate ?? null,
        toDate: period?.toDate ?? null,
      },
      ...analytics,
    };
  }

  private async requireDealer(dealerId: string): Promise<void> {
    const dealer = await this.dealersRepository.findById(dealerId);
    if (!dealer) {
      throw new NotFoundException('Dealer not found.');
    }
  }

  private resolvePeriod(
    query: AdminDealerOrdersQueryDto,
  ): BusinessDateRange | undefined {
    switch (query.period) {
      case 'all':
        return undefined;
      case 'this_month':
        return currentMonthBusinessRange();
      case 'last_month':
        return previousMonthBusinessRange();
      case 'custom': {
        if (!query.fromDate || !query.toDate) {
          throw new BadRequestException(
            'Both fromDate and toDate are required for a custom range.',
          );
        }
        if (query.fromDate > query.toDate) {
          throw new BadRequestException('From date cannot be after to date.');
        }
        const range = inclusiveBusinessDateRange(query.fromDate, query.toDate);
        const maximumRangeInDays = 366;
        const rangeInDays = Math.ceil(
          (range.toExclusive.getTime() - range.from.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (rangeInDays > maximumRangeInDays) {
          throw new BadRequestException(
            'A custom range can include up to 366 days.',
          );
        }
        return range;
      }
    }
  }
}
