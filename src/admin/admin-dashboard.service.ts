import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from '../entities/category.entity';
import { DailyStock } from '../entities/daily-stock.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
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
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async getSummary(): Promise<AdminDashboardSummary> {
    const today = this.getIndianCalendarDate();
    const [categories, products, stock, orders, booked] = await Promise.all([
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
      this.products
        .createQueryBuilder('product')
        .innerJoin(
          Category,
          'category',
          'category.id = product.category_id AND category.is_active = true',
        )
        .leftJoin(
          (subQuery) =>
            subQuery
              .select('stock_source.product_id', 'productId')
              .addSelect('stock_source.quantity', 'quantity')
              .from(DailyStock, 'stock_source')
              .where('stock_source.stock_date <= :stockDate', {
                stockDate: today,
              })
              .distinctOn(['stock_source.product_id'])
              .orderBy('stock_source.product_id', 'ASC')
              .addOrderBy('stock_source.stock_date', 'DESC'),
          'stock',
          'stock."productId" = product.id',
        )
        .select(
          'COUNT(*) FILTER (WHERE COALESCE(stock.quantity, 0) > 0)',
          'withStock',
        )
        .addSelect(
          'COUNT(*) FILTER (WHERE COALESCE(stock.quantity, 0) <= 0)',
          'withoutStock',
        )
        .addSelect(
          'COALESCE(SUM(GREATEST(COALESCE(stock.quantity, 0), 0)), 0)',
          'available',
        )
        .where('product.is_active = true')
        .setParameter('stockDate', today)
        .getRawOne<{
          withStock: string;
          withoutStock: string;
          available: string;
        }>(),
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
      this.orders
        .createQueryBuilder('order')
        .innerJoin(OrderItem, 'item', 'item.order_id = order.id')
        .select('COALESCE(SUM(item.approved_quantity), 0)', 'quantity')
        .where(
          "(order.reviewed_at AT TIME ZONE 'Asia/Kolkata')::date = :today",
          { today },
        )
        .andWhere('order.status IN (:...stockDeductedStatuses)', {
          stockDeductedStatuses: [
            OrderStatus.APPROVED,
            OrderStatus.PARTIALLY_FULFILLED,
            OrderStatus.BILLED,
            OrderStatus.COMPLETED,
          ],
        })
        .getRawOne<{ quantity: string }>(),
    ]);

    return {
      activeCategoryCount: Number(categories?.count ?? 0),
      activeProductCount: Number(products?.activeCount ?? 0),
      inactiveProductCount: Number(products?.inactiveCount ?? 0),
      productsWithStockToday: Number(stock?.withStock ?? 0),
      activeProductsWithoutStockToday: Number(stock?.withoutStock ?? 0),
      totalAvailableQuantityToday: Number(stock?.available ?? 0),
      totalBookedQuantityToday: Number(booked?.quantity ?? 0),
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
