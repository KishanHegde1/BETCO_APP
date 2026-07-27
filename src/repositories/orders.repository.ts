import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { Dealer } from '../entities/dealer.entity';
import { DailyStock } from '../entities/daily-stock.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { User } from '../entities/user.entity';
import { businessDayStart } from '../common/utils/business-date.util';
import { AdminOrdersQueryDto } from '../orders/dto/admin-orders-query.dto';

export interface OrderItemTotal {
  orderId: string;
  totalItems: number;
  totalQuantity: number;
  totalApprovedQuantity: number | null;
}

export interface AdminOrderSummaryRow {
  id: string;
  dealerId: string;
  dealerUsername: string;
  shopName: string | null;
  contactNumber: string | null;
  status: string;
  createdAt: Date;
  totalItems: number;
  totalQuantity: number;
  totalApprovedQuantity: number;
}

export interface AdminOrderItemRow {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  approvedQuantity: number | null;
  availableQuantity: number | null;
}

export interface AdminOrderDetailsRow extends AdminOrderSummaryRow {
  address: string | null;
  remarks: string | null;
  adminRemarks: string | null;
  cancellationReason: string | null;
  reviewedAt: Date | null;
  items: AdminOrderItemRow[];
}

export interface AdminOrdersPage {
  items: AdminOrderSummaryRow[];
  total: number;
}

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(Order) readonly repository: Repository<Order>,
    @InjectRepository(OrderItem)
    readonly orderItemsRepository: Repository<OrderItem>,
  ) {}

  findByDealerId(dealerId: string): Promise<Order[]> {
    return this.repository.find({
      where: { dealerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findItemTotals(orderIds: string[]): Promise<OrderItemTotal[]> {
    if (orderIds.length === 0) {
      return [];
    }

    const rows = await this.orderItemsRepository
      .createQueryBuilder('orderItem')
      .select('orderItem.order_id', 'orderId')
      .addSelect('COUNT(*)', 'totalItems')
      .addSelect('SUM(orderItem.quantity)', 'totalQuantity')
      .addSelect('SUM(orderItem.approved_quantity)', 'totalApprovedQuantity')
      .where('orderItem.order_id IN (:...orderIds)', { orderIds })
      .groupBy('orderItem.order_id')
      .getRawMany<{
        orderId: string;
        totalItems: string | number;
        totalQuantity: string | number;
        totalApprovedQuantity: string | number | null;
      }>();

    return rows.map((row) => ({
      orderId: row.orderId,
      totalItems: Number(row.totalItems),
      totalQuantity: Number(row.totalQuantity),
      totalApprovedQuantity:
        row.totalApprovedQuantity == null
          ? null
          : Number(row.totalApprovedQuantity),
    }));
  }

  transaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.repository.manager.transaction(callback);
  }

  async findAdminPage(options: AdminOrdersQueryDto): Promise<AdminOrdersPage> {
    const query = this.adminSummaryQuery();
    this.applyAdminFilters(query, options);

    const countQuery = this.adminBaseQuery();
    this.applyAdminFilters(countQuery, options);
    const totalRow = await countQuery
      .select('COUNT(DISTINCT "order".id)', 'count')
      .getRawOne<{ count: string | number }>();
    const rows = await query
      .orderBy('"order".created_at', options.sortOrder)
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getRawMany<AdminOrderSummaryRow>();

    return {
      items: rows.map((row) => this.normalizeAdminSummary(row)),
      total: Number(totalRow?.count ?? 0),
    };
  }

  async findAdminById(id: string): Promise<AdminOrderDetailsRow | null> {
    return this.findDetails({ id });
  }

  async findDealerById(
    id: string,
    dealerId: string,
  ): Promise<AdminOrderDetailsRow | null> {
    return this.findDetails({ id, dealerId });
  }

  private async findDetails({
    id,
    dealerId,
  }: {
    id: string;
    dealerId?: string;
  }): Promise<AdminOrderDetailsRow | null> {
    const query = this.adminBaseQuery()
      .select([
        '"order".id AS "id"',
        '"order".dealer_id AS "dealerId"',
        '"user".username AS "dealerUsername"',
        'dealer.business_name AS "shopName"',
        'COALESCE(dealer.phone, "user".phone) AS "contactNumber"',
        'dealer.address AS "address"',
        '"order".remarks AS "remarks"',
        '"order".admin_remarks AS "adminRemarks"',
        '"order".cancellation_reason AS "cancellationReason"',
        '"order".reviewed_at AS "reviewedAt"',
        '"order".status AS "status"',
        '"order".created_at AS "createdAt"',
      ])
      .where('"order".id = :id', { id });
    if (dealerId) {
      query.andWhere('"order".dealer_id = :dealerId', { dealerId });
    }
    const row =
      await query.getRawOne<
        Omit<AdminOrderDetailsRow, 'items' | 'totalItems' | 'totalQuantity'>
      >();
    if (!row) return null;

    const items = await this.orderItemsRepository
      .createQueryBuilder('orderItem')
      .innerJoin(Product, 'product', 'product.id = orderItem.product_id')
      .leftJoin(
        DailyStock,
        'stock',
        `stock.id = (
          SELECT latest_stock.id
          FROM daily_stocks latest_stock
          WHERE latest_stock.product_id = "orderItem".product_id
            AND latest_stock.stock_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
          ORDER BY latest_stock.stock_date DESC
          LIMIT 1
        )`,
      )
      .select([
        'orderItem.product_id AS "productId"',
        'product.name AS "productName"',
        'product.sku AS "sku"',
        'product.unit AS "unit"',
        'orderItem.quantity AS "quantity"',
        'orderItem.approved_quantity AS "approvedQuantity"',
        'stock.quantity AS "availableQuantity"',
      ])
      .where('orderItem.order_id = :id', { id })
      .orderBy('product.name', 'ASC')
      .getRawMany<AdminOrderItemRow>();
    const normalizedItems = items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      approvedQuantity:
        item.approvedQuantity == null ? null : Number(item.approvedQuantity),
      availableQuantity:
        item.availableQuantity == null ? null : Number(item.availableQuantity),
    }));

    return {
      ...row,
      totalItems: normalizedItems.length,
      totalQuantity: normalizedItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      totalApprovedQuantity: normalizedItems.reduce(
        (sum, item) => sum + (item.approvedQuantity ?? 0),
        0,
      ),
      items: normalizedItems,
    };
  }

  private adminBaseQuery(): SelectQueryBuilder<Order> {
    return this.repository
      .createQueryBuilder('order')
      .innerJoin(Dealer, 'dealer', 'dealer.id = "order".dealer_id')
      .innerJoin(User, 'user', 'user.id = dealer.user_id');
  }

  private adminSummaryQuery(): SelectQueryBuilder<Order> {
    return this.adminBaseQuery()
      .leftJoin(OrderItem, 'orderItem', 'orderItem.order_id = "order".id')
      .select([
        '"order".id AS "id"',
        '"order".dealer_id AS "dealerId"',
        '"user".username AS "dealerUsername"',
        'dealer.business_name AS "shopName"',
        'COALESCE(dealer.phone, "user".phone) AS "contactNumber"',
        '"order".status AS "status"',
        '"order".created_at AS "createdAt"',
        'COUNT(orderItem.id) AS "totalItems"',
        'COALESCE(SUM(orderItem.quantity), 0) AS "totalQuantity"',
        'COALESCE(SUM(orderItem.approved_quantity), 0) AS "totalApprovedQuantity"',
      ])
      .groupBy('"order".id')
      .addGroupBy('"order".dealer_id')
      .addGroupBy('"user".username')
      .addGroupBy('dealer.business_name')
      .addGroupBy('dealer.phone')
      .addGroupBy('"user".phone');
  }

  private applyAdminFilters(
    query: SelectQueryBuilder<Order>,
    options: AdminOrdersQueryDto,
  ): void {
    if (options.search?.trim()) {
      query.andWhere(
        new Brackets((builder) => {
          builder
            .where('CAST("order".id AS TEXT) ILIKE :search', {
              search: `%${options.search!.trim()}%`,
            })
            .orWhere('"user".username ILIKE :search', {
              search: `%${options.search!.trim()}%`,
            })
            .orWhere('dealer.business_name ILIKE :search', {
              search: `%${options.search!.trim()}%`,
            });
        }),
      );
    }
    if (options.status) {
      query.andWhere('"order".status = :status', { status: options.status });
    }
    if (options.dealerId) {
      query.andWhere('"order".dealer_id = :dealerId', {
        dealerId: options.dealerId,
      });
    }
    if (options.fromDate) {
      query.andWhere('"order".created_at >= :fromDate', {
        fromDate: businessDayStart(options.fromDate),
      });
    }
    if (options.toDate) {
      query.andWhere('"order".created_at < :toDateExclusive', {
        toDateExclusive: this.nextBusinessDayStart(options.toDate),
      });
    }
  }

  private normalizeAdminSummary(
    row: AdminOrderSummaryRow,
  ): AdminOrderSummaryRow {
    return {
      ...row,
      totalItems: Number(row.totalItems),
      totalQuantity: Number(row.totalQuantity),
      totalApprovedQuantity: Number(row.totalApprovedQuantity),
    };
  }

  private nextBusinessDayStart(value: string): Date {
    const date = businessDayStart(value);
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }
}
