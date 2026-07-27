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
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { User } from '../entities/user.entity';
import { businessDayStart } from '../common/utils/business-date.util';
import { AdminOrdersQueryDto } from '../orders/dto/admin-orders-query.dto';
import { StaffBillingQueueQueryDto } from '../orders/dto/staff-billing-queue-query.dto';

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
  billGenerated: boolean;
  billGeneratedAt: Date | null;
  billGeneratedBy: string | null;
  billGeneratedByName: string | null;
  items: AdminOrderItemRow[];
}

export interface StaffBillingQueueItemRow {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  requestedQuantity: number;
  approvedQuantity: number | null;
}

export interface StaffBillingQueueOrderRow {
  id: string;
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  orderStatus: OrderStatus;
  dealerName: string;
  dealerPhone: string | null;
  createdAt: Date;
  orderDate: Date;
  billGeneratedAt: Date | null;
  billGeneratedByName: string | null;
  totalItems: number;
  totalQuantity: number;
  totalRequestedQuantity: number;
  totalApprovedQuantity: number;
  dealer: {
    dealerId: string;
    businessName: string;
    shopName: string | null;
    phone: string | null;
    contactNumber: string | null;
    address: string | null;
  };
  items: StaffBillingQueueItemRow[];
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

  async findStaffBillingQueue(
    options: StaffBillingQueueQueryDto,
  ): Promise<StaffBillingQueueOrderRow[]> {
    return this.findStaffOrders(
      [OrderStatus.APPROVED, OrderStatus.PARTIALLY_FULFILLED],
      options,
    );
  }

  async findStaffBilledOrders(
    options: StaffBillingQueueQueryDto,
  ): Promise<StaffBillingQueueOrderRow[]> {
    return this.findStaffOrders([OrderStatus.BILLED], options);
  }

  private async findStaffOrders(
    statuses: OrderStatus[],
    options: StaffBillingQueueQueryDto,
  ): Promise<StaffBillingQueueOrderRow[]> {
    const query = this.adminBaseQuery()
      .innerJoin(OrderItem, 'orderItem', 'orderItem.order_id = "order".id')
      .innerJoin(Product, 'product', 'product.id = orderItem.product_id')
      .select([
        '"order".id AS "orderId"',
        '"order".status AS "status"',
        '"order".created_at AS "createdAt"',
        '"order".bill_generated_at AS "billGeneratedAt"',
        'billGenerator.username AS "billGeneratedByName"',
        'dealer.id AS "dealerId"',
        'COALESCE(NULLIF(dealer.business_name, \'\'), "user".username) AS "dealerName"',
        'COALESCE(dealer.phone, "user".phone) AS "dealerPhone"',
        'dealer.business_name AS "businessName"',
        'dealer.shop_name AS "shopName"',
        'dealer.phone AS "phone"',
        'dealer.contact_number AS "contactNumber"',
        'dealer.address AS "address"',
        'orderItem.product_id AS "productId"',
        'product.name AS "productName"',
        'product.sku AS "sku"',
        'product.unit AS "unit"',
        'orderItem.quantity AS "requestedQuantity"',
        'orderItem.approved_quantity AS "approvedQuantity"',
      ])
      .where('"order".status IN (:...statuses)', {
        statuses,
      });

    const search = options.search?.trim();
    if (search) {
      query.andWhere(
        new Brackets((builder) => {
          builder
            .where('CAST("order".id AS TEXT) ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('"user".username ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('dealer.business_name ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('COALESCE(dealer.phone, "user".phone) ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    const rows = await query
      .orderBy('"order".created_at', 'DESC')
      .addOrderBy('product.name', 'ASC')
      .getRawMany<{
        orderId: string;
        status: OrderStatus;
        createdAt: Date;
        billGeneratedAt: Date | null;
        billGeneratedByName: string | null;
        dealerId: string;
        dealerName: string;
        dealerPhone: string | null;
        businessName: string;
        shopName: string | null;
        phone: string | null;
        contactNumber: string | null;
        address: string | null;
        productId: string;
        productName: string;
        sku: string;
        unit: string;
        requestedQuantity: string | number;
        approvedQuantity: string | number | null;
      }>();

    const ordersById = new Map<string, StaffBillingQueueOrderRow>();
    for (const row of rows) {
      let order = ordersById.get(row.orderId);
      if (!order) {
        order = {
          id: row.orderId,
          orderId: row.orderId,
          orderNumber: row.orderId,
          status: row.status,
          orderStatus: row.status,
          dealerName: row.dealerName,
          dealerPhone: row.dealerPhone,
          createdAt: row.createdAt,
          orderDate: row.createdAt,
          billGeneratedAt: row.billGeneratedAt,
          billGeneratedByName: row.billGeneratedByName,
          totalItems: 0,
          totalQuantity: 0,
          totalRequestedQuantity: 0,
          totalApprovedQuantity: 0,
          dealer: {
            dealerId: row.dealerId,
            businessName: row.businessName,
            shopName: row.shopName,
            phone: row.phone,
            contactNumber: row.contactNumber,
            address: row.address,
          },
          items: [],
        };
        ordersById.set(row.orderId, order);
      }

      const requestedQuantity = Number(row.requestedQuantity);
      const approvedQuantity =
        row.approvedQuantity == null ? null : Number(row.approvedQuantity);
      order.items.push({
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        unit: row.unit,
        requestedQuantity,
        approvedQuantity,
      });
      order.totalItems += 1;
      order.totalQuantity += requestedQuantity;
      order.totalRequestedQuantity += requestedQuantity;
      order.totalApprovedQuantity += approvedQuantity ?? 0;
    }
    return [...ordersById.values()];
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
        'COALESCE(dealer.shop_name, dealer.business_name) AS "shopName"',
        'COALESCE(dealer.contact_number, dealer.phone, "user".phone) AS "contactNumber"',
        'dealer.address AS "address"',
        '"order".remarks AS "remarks"',
        '"order".admin_remarks AS "adminRemarks"',
        '"order".cancellation_reason AS "cancellationReason"',
        '"order".reviewed_at AS "reviewedAt"',
        'COALESCE("order".bill_generated, false) AS "billGenerated"',
        '"order".bill_generated_at AS "billGeneratedAt"',
        '"order".bill_generated_by AS "billGeneratedBy"',
        'billGenerator.username AS "billGeneratedByName"',
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
      billGenerated: this.toBoolean(row.billGenerated),
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
      .innerJoin(User, 'user', 'user.id = dealer.user_id')
      .leftJoin(
        User,
        'billGenerator',
        'billGenerator.id = "order".bill_generated_by',
      );
  }

  private adminSummaryQuery(): SelectQueryBuilder<Order> {
    return this.adminBaseQuery()
      .leftJoin(OrderItem, 'orderItem', 'orderItem.order_id = "order".id')
      .select([
        '"order".id AS "id"',
        '"order".dealer_id AS "dealerId"',
        '"user".username AS "dealerUsername"',
        'COALESCE(dealer.shop_name, dealer.business_name) AS "shopName"',
        'COALESCE(dealer.contact_number, dealer.phone, "user".phone) AS "contactNumber"',
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
      .addGroupBy('dealer.shop_name')
      .addGroupBy('dealer.phone')
      .addGroupBy('dealer.contact_number')
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

  private toBoolean(value: unknown): boolean {
    return value === true || value === 'true' || value === 't' || value === 1;
  }

  private nextBusinessDayStart(value: string): Date {
    const date = businessDayStart(value);
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }
}
