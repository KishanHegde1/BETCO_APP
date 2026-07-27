import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from '../entities/category.entity';
import { DailyStock } from '../entities/daily-stock.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { Product } from '../entities/product.entity';

export interface AdminDashboardSummary {
  activeCategoryCount: number;
  activeProductCount: number;
  inactiveProductCount: number;
  productsWithStockToday: number;
  activeProductsWithoutStockToday: number;
  totalAvailableQuantityToday: number;
  totalBookedQuantityToday: number;
  dealerOrdersToday: number;
  pendingOrderCount: number;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(DailyStock)
    private readonly stocks: Repository<DailyStock>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async getSummary(): Promise<AdminDashboardSummary> {
    const today = this.getIndianCalendarDate();
    const [categories, products, stock, noStock, orders] = await Promise.all([
      this.categories
        .createQueryBuilder('category')
        .select('COUNT(*)', 'count')
        .where('category.is_active = true')
        .getRawOne<{ count: string }>(),
      this.products
        .createQueryBuilder('product')
        .select(
          'COUNT(*) FILTER (WHERE product.is_active = true)',
          'activeCount',
        )
        .addSelect(
          'COUNT(*) FILTER (WHERE product.is_active = false)',
          'inactiveCount',
        )
        .getRawOne<{ activeCount: string; inactiveCount: string }>(),
      this.stocks
        .createQueryBuilder('stock')
        .select('COUNT(*) FILTER (WHERE stock.quantity > 0)', 'withStock')
        .addSelect('COALESCE(SUM(stock.quantity), 0)', 'available')
        .where('stock.stock_date = :today', { today })
        .getRawOne<{ withStock: string; available: string }>(),
      this.products
        .createQueryBuilder('product')
        .leftJoin(
          DailyStock,
          'stock',
          'stock.product_id = product.id AND stock.stock_date = :today',
          { today },
        )
        .select('COUNT(*)', 'count')
        .where('product.is_active = true')
        .andWhere('stock.id IS NULL')
        .getRawOne<{ count: string }>(),
      this.orders
        .createQueryBuilder('order')
        .select('COUNT(*)', 'todayCount')
        .addSelect(
          'COUNT(*) FILTER (WHERE order.status = :pending)',
          'pendingCount',
        )
        .where(
          "(order.created_at AT TIME ZONE 'Asia/Kolkata')::date = :today",
          {
            today,
          },
        )
        .setParameter('pending', OrderStatus.PENDING)
        .getRawOne<{ todayCount: string; pendingCount: string }>(),
    ]);

    return {
      activeCategoryCount: Number(categories?.count ?? 0),
      activeProductCount: Number(products?.activeCount ?? 0),
      inactiveProductCount: Number(products?.inactiveCount ?? 0),
      productsWithStockToday: Number(stock?.withStock ?? 0),
      activeProductsWithoutStockToday: Number(noStock?.count ?? 0),
      totalAvailableQuantityToday: Number(stock?.available ?? 0),
      totalBookedQuantityToday: 0,
      dealerOrdersToday: Number(orders?.todayCount ?? 0),
      pendingOrderCount: Number(orders?.pendingCount ?? 0),
    };
  }

  private getIndianCalendarDate(): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts();
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
}
