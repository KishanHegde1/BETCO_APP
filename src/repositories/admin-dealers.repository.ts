import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';

import { AdminDealersQueryDto } from '../admin/dto/admin-dealers-query.dto';
import { BusinessDateRange } from '../common/utils/business-date.util';
import { Dealer } from '../entities/dealer.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { User } from '../entities/user.entity';

export interface DealerOrderSummary {
  totalOrders: number;
  pendingOrders: number;
  approvedOrders: number;
  partiallyFulfilledOrders: number;
  cancelledOrders: number;
  rejectedOrders: number;
  completedOrders: number;
  totalRequestedQuantity: number;
  totalApprovedQuantity: number;
}

export interface AdminDealerListRow {
  id: string;
  userId: string;
  name: string;
  businessName: string;
  phone: string | null;
  contactNumber: string | null;
  address: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  orderSummary: DealerListOrderSummary;
}

export interface DealerListOrderSummary {
  totalOrders: number;
  pendingOrders: number;
  approvedOrders: number;
  partiallyFulfilledOrders: number;
  cancelledOrders: number;
  rejectedOrders: number;
  completedOrders: number;
  thisMonthOrders: number;
  previousMonthOrders: number;
}

export interface AdminDealersPage {
  items: AdminDealerListRow[];
  total: number;
  summary: {
    totalDealers: number;
    activeDealers: number;
    dealersWithPendingOrders: number;
    newThisMonth: number;
  };
}

export interface AdminDealerProfileRow {
  id: string;
  userId: string;
  name: string;
  businessName: string;
  phone: string | null;
  contactNumber: string | null;
  address: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminDealerDetailsRow extends AdminDealerProfileRow {
  orderSummary: DealerOrderSummary;
  monthlyComparison: {
    currentMonthOrders: number;
    previousMonthOrders: number;
    currentMonthRequestedQuantity: number;
    previousMonthRequestedQuantity: number;
    currentMonthApprovedQuantity: number;
    previousMonthApprovedQuantity: number;
    orderCountChangePercent: number | null;
  };
}

export interface DealerAnalyticsRow {
  summary: DealerOrderSummary;
  statusBreakdown: Array<{ status: OrderStatus; count: number }>;
  dailyTrend: Array<{
    date: string;
    orderCount: number;
    requestedQuantity: number;
    approvedQuantity: number;
  }>;
}

@Injectable()
export class AdminDealersRepository {
  constructor(
    @InjectRepository(Dealer) readonly dealers: Repository<Dealer>,
    @InjectRepository(Order) readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) readonly orderItems: Repository<OrderItem>,
  ) {}

  async findPage(
    options: AdminDealersQueryDto,
    currentMonth: BusinessDateRange,
    previousMonth: BusinessDateRange,
  ): Promise<AdminDealersPage> {
    const query = this.dealerListQuery(currentMonth, previousMonth);
    this.applyDealerFilters(query, options);

    const countQuery = this.dealerBaseQuery();
    this.applyDealerFilters(countQuery, options);
    const totalRow = await countQuery
      .select('COUNT(dealer.id)', 'count')
      .getRawOne<{ count: string | number }>();
    const rows = await query
      .orderBy(
        options.sort === 'name' ? '"user".username' : 'dealer.created_at',
        options.sort === 'name' ? 'ASC' : 'DESC',
      )
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getRawMany<AdminDealerListRow>();

    return {
      items: rows.map((row) => this.normalizeDealerListRow(row)),
      total: Number(totalRow?.count ?? 0),
      summary: await this.findListSummary(currentMonth),
    };
  }

  async findById(id: string): Promise<AdminDealerProfileRow | null> {
    const row = await this.dealerBaseQuery()
      .select([
        'dealer.id AS "id"',
        'dealer.user_id AS "userId"',
        '"user".username AS "name"',
        'dealer.business_name AS "businessName"',
        'dealer.phone AS "phone"',
        'COALESCE(dealer.phone, "user".phone) AS "contactNumber"',
        'dealer.address AS "address"',
        '"user".email AS "email"',
        '"user".role AS "role"',
        '"user".is_active AS "isActive"',
        '"user".must_change_password AS "mustChangePassword"',
        'dealer.created_at AS "createdAt"',
        'dealer.updated_at AS "updatedAt"',
      ])
      .where('dealer.id = :id', { id })
      .getRawOne<AdminDealerProfileRow>();
    return row ? this.normalizeProfile(row) : null;
  }

  async findDetails(
    dealerId: string,
    currentMonth: BusinessDateRange,
    previousMonth: BusinessDateRange,
  ): Promise<AdminDealerDetailsRow | null> {
    const profile = await this.findById(dealerId);
    if (!profile) return null;

    const totals = await this.orderTotalsQuery(dealerId)
      .select([
        'COUNT("order".id) AS "totalOrders"',
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.PENDING}') AS "pendingOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.APPROVED}') AS "approvedOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.PARTIALLY_FULFILLED}') AS "partiallyFulfilledOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.CANCELLED}') AS "cancelledOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.REJECTED}') AS "rejectedOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.COMPLETED}') AS "completedOrders"`,
        'COALESCE(SUM(item_totals."requestedQuantity"), 0) AS "totalRequestedQuantity"',
        'COALESCE(SUM(item_totals."approvedQuantity"), 0) AS "totalApprovedQuantity"',
        'COUNT("order".id) FILTER (WHERE "order".created_at >= :currentStart AND "order".created_at < :currentEnd) AS "currentMonthOrders"',
        'COUNT("order".id) FILTER (WHERE "order".created_at >= :previousStart AND "order".created_at < :previousEnd) AS "previousMonthOrders"',
        'COALESCE(SUM(item_totals."requestedQuantity") FILTER (WHERE "order".created_at >= :currentStart AND "order".created_at < :currentEnd), 0) AS "currentMonthRequestedQuantity"',
        'COALESCE(SUM(item_totals."requestedQuantity") FILTER (WHERE "order".created_at >= :previousStart AND "order".created_at < :previousEnd), 0) AS "previousMonthRequestedQuantity"',
        'COALESCE(SUM(item_totals."approvedQuantity") FILTER (WHERE "order".created_at >= :currentStart AND "order".created_at < :currentEnd), 0) AS "currentMonthApprovedQuantity"',
        'COALESCE(SUM(item_totals."approvedQuantity") FILTER (WHERE "order".created_at >= :previousStart AND "order".created_at < :previousEnd), 0) AS "previousMonthApprovedQuantity"',
      ])
      .setParameters({
        currentStart: currentMonth.from,
        currentEnd: currentMonth.toExclusive,
        previousStart: previousMonth.from,
        previousEnd: previousMonth.toExclusive,
      })
      .getRawOne<Record<string, string | number | null>>();

    const values = this.numberRecord(totals);
    const previousOrders = values.previousMonthOrders;
    return {
      ...profile,
      orderSummary: this.toOrderSummary(values),
      monthlyComparison: {
        currentMonthOrders: values.currentMonthOrders,
        previousMonthOrders: previousOrders,
        currentMonthRequestedQuantity: values.currentMonthRequestedQuantity,
        previousMonthRequestedQuantity: values.previousMonthRequestedQuantity,
        currentMonthApprovedQuantity: values.currentMonthApprovedQuantity,
        previousMonthApprovedQuantity: values.previousMonthApprovedQuantity,
        orderCountChangePercent:
          previousOrders === 0
            ? null
            : Number(
                (
                  ((values.currentMonthOrders - previousOrders) /
                    previousOrders) *
                  100
                ).toFixed(1),
              ),
      },
    };
  }

  async findAnalytics(
    dealerId: string,
    period?: BusinessDateRange,
  ): Promise<DealerAnalyticsRow> {
    const totalsQuery = this.orderTotalsQuery(dealerId);
    this.applyPeriod(totalsQuery, period);
    const totals = await totalsQuery
      .select([
        'COUNT("order".id) AS "totalOrders"',
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.PENDING}') AS "pendingOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.APPROVED}') AS "approvedOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.PARTIALLY_FULFILLED}') AS "partiallyFulfilledOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.CANCELLED}') AS "cancelledOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.REJECTED}') AS "rejectedOrders"`,
        `COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.COMPLETED}') AS "completedOrders"`,
        'COALESCE(SUM(item_totals."requestedQuantity"), 0) AS "totalRequestedQuantity"',
        'COALESCE(SUM(item_totals."approvedQuantity"), 0) AS "totalApprovedQuantity"',
      ])
      .getRawOne<Record<string, string | number | null>>();

    const statusQuery = this.orders
      .createQueryBuilder('order')
      .select('"order".status', 'status')
      .addSelect('COUNT("order".id)', 'count')
      .where('"order".dealer_id = :dealerId', { dealerId });
    this.applyPeriod(statusQuery, period);
    const statusBreakdown = await statusQuery
      .groupBy('"order".status')
      .getRawMany<{ status: OrderStatus; count: string | number }>();

    const trendQuery = this.orderTotalsQuery(dealerId)
      .select(
        `TO_CHAR("order".created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`,
        'date',
      )
      .addSelect('COUNT("order".id)', 'orderCount')
      .addSelect(
        'COALESCE(SUM(item_totals."requestedQuantity"), 0)',
        'requestedQuantity',
      )
      .addSelect(
        'COALESCE(SUM(item_totals."approvedQuantity"), 0)',
        'approvedQuantity',
      );
    this.applyPeriod(trendQuery, period);
    const dailyTrend = await trendQuery
      .groupBy(
        `TO_CHAR("order".created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`,
      )
      .orderBy('date', 'ASC')
      .getRawMany<{
        date: string;
        orderCount: string | number;
        requestedQuantity: string | number;
        approvedQuantity: string | number;
      }>();

    return {
      summary: this.toOrderSummary(this.numberRecord(totals)),
      statusBreakdown: statusBreakdown.map((row) => ({
        status: row.status,
        count: Number(row.count),
      })),
      dailyTrend: dailyTrend.map((row) => ({
        date: row.date,
        orderCount: Number(row.orderCount),
        requestedQuantity: Number(row.requestedQuantity),
        approvedQuantity: Number(row.approvedQuantity),
      })),
    };
  }

  private dealerBaseQuery(): SelectQueryBuilder<Dealer> {
    return this.dealers
      .createQueryBuilder('dealer')
      .innerJoin(User, 'user', '"user".id = dealer.user_id')
      .where('"user".role = :dealerRole', { dealerRole: 'USER' });
  }

  private dealerListQuery(
    currentMonth: BusinessDateRange,
    previousMonth: BusinessDateRange,
  ): SelectQueryBuilder<Dealer> {
    return this.dealerBaseQuery()
      .leftJoin(
        `(
          SELECT
            "order".dealer_id AS dealer_id,
            COUNT("order".id) AS total_orders,
            COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.PENDING}') AS pending_orders,
            COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.APPROVED}') AS approved_orders,
            COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.PARTIALLY_FULFILLED}') AS partially_fulfilled_orders,
            COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.CANCELLED}') AS cancelled_orders,
            COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.REJECTED}') AS rejected_orders,
            COUNT("order".id) FILTER (WHERE "order".status = '${OrderStatus.COMPLETED}') AS completed_orders,
            COUNT("order".id) FILTER (WHERE "order".created_at >= :currentStart AND "order".created_at < :currentEnd) AS this_month_orders,
            COUNT("order".id) FILTER (WHERE "order".created_at >= :previousStart AND "order".created_at < :previousEnd) AS previous_month_orders
          FROM orders "order"
          GROUP BY "order".dealer_id
        )`,
        'order_summary',
        'order_summary.dealer_id = dealer.id',
      )
      .select([
        'dealer.id AS "id"',
        'dealer.user_id AS "userId"',
        '"user".username AS "name"',
        'dealer.business_name AS "businessName"',
        'dealer.phone AS "phone"',
        'COALESCE(dealer.phone, "user".phone) AS "contactNumber"',
        'dealer.address AS "address"',
        '"user".email AS "email"',
        '"user".role AS "role"',
        '"user".is_active AS "isActive"',
        '"user".must_change_password AS "mustChangePassword"',
        'dealer.created_at AS "createdAt"',
        'dealer.updated_at AS "updatedAt"',
        'COALESCE(order_summary.total_orders, 0) AS "totalOrders"',
        'COALESCE(order_summary.pending_orders, 0) AS "pendingOrders"',
        'COALESCE(order_summary.approved_orders, 0) AS "approvedOrders"',
        'COALESCE(order_summary.partially_fulfilled_orders, 0) AS "partiallyFulfilledOrders"',
        'COALESCE(order_summary.cancelled_orders, 0) AS "cancelledOrders"',
        'COALESCE(order_summary.rejected_orders, 0) AS "rejectedOrders"',
        'COALESCE(order_summary.completed_orders, 0) AS "completedOrders"',
        'COALESCE(order_summary.this_month_orders, 0) AS "thisMonthOrders"',
        'COALESCE(order_summary.previous_month_orders, 0) AS "previousMonthOrders"',
      ])
      .setParameters({
        currentStart: currentMonth.from,
        currentEnd: currentMonth.toExclusive,
        previousStart: previousMonth.from,
        previousEnd: previousMonth.toExclusive,
      });
  }

  private async findListSummary(
    currentMonth: BusinessDateRange,
  ): Promise<AdminDealersPage['summary']> {
    const row = await this.dealerBaseQuery()
      .leftJoin(Order, 'order', '"order".dealer_id = dealer.id')
      .select([
        'COUNT(DISTINCT dealer.id) AS "totalDealers"',
        'COUNT(DISTINCT dealer.id) FILTER (WHERE "user".is_active = TRUE) AS "activeDealers"',
        `COUNT(DISTINCT dealer.id) FILTER (WHERE "order".status = '${OrderStatus.PENDING}') AS "dealersWithPendingOrders"`,
        'COUNT(DISTINCT dealer.id) FILTER (WHERE dealer.created_at >= :currentStart AND dealer.created_at < :currentEnd) AS "newThisMonth"',
      ])
      .setParameters({
        currentStart: currentMonth.from,
        currentEnd: currentMonth.toExclusive,
      })
      .getRawOne<Record<string, string | number | null>>();
    const values = this.numberRecord(row);
    return {
      totalDealers: values.totalDealers,
      activeDealers: values.activeDealers,
      dealersWithPendingOrders: values.dealersWithPendingOrders,
      newThisMonth: values.newThisMonth,
    };
  }

  private orderTotalsQuery(dealerId: string): SelectQueryBuilder<Order> {
    return this.orders
      .createQueryBuilder('order')
      .leftJoin(
        `(
          SELECT
            order_id,
            SUM(quantity) AS "requestedQuantity",
            SUM(COALESCE(approved_quantity, 0)) AS "approvedQuantity"
          FROM order_items
          GROUP BY order_id
        )`,
        'item_totals',
        'item_totals.order_id = "order".id',
      )
      .where('"order".dealer_id = :dealerId', { dealerId });
  }

  private applyDealerFilters(
    query: SelectQueryBuilder<Dealer>,
    options: AdminDealersQueryDto,
  ): void {
    if (options.search?.trim()) {
      query.andWhere(
        new Brackets((builder) => {
          builder
            .where('dealer.business_name ILIKE :search', {
              search: `%${options.search!.trim()}%`,
            })
            .orWhere('"user".username ILIKE :search', {
              search: `%${options.search!.trim()}%`,
            })
            .orWhere('dealer.phone ILIKE :search', {
              search: `%${options.search!.trim()}%`,
            })
            .orWhere('"user".phone ILIKE :search', {
              search: `%${options.search!.trim()}%`,
            });
        }),
      );
    }
    if (options.status !== 'all') {
      query.andWhere('"user".is_active = :isActive', {
        isActive: options.status === 'active',
      });
    }
  }

  private applyPeriod(
    query: SelectQueryBuilder<Order>,
    period?: BusinessDateRange,
  ): void {
    if (!period) return;
    query.andWhere('"order".created_at >= :periodStart', {
      periodStart: period.from,
    });
    query.andWhere('"order".created_at < :periodEnd', {
      periodEnd: period.toExclusive,
    });
  }

  private normalizeDealerListRow(row: AdminDealerListRow): AdminDealerListRow {
    const values = this.numberRecord(row as unknown as Record<string, unknown>);
    return {
      ...this.normalizeProfile(row),
      orderSummary: {
        totalOrders: values.totalOrders,
        pendingOrders: values.pendingOrders,
        approvedOrders: values.approvedOrders,
        partiallyFulfilledOrders: values.partiallyFulfilledOrders,
        cancelledOrders: values.cancelledOrders,
        rejectedOrders: values.rejectedOrders,
        completedOrders: values.completedOrders,
        thisMonthOrders: values.thisMonthOrders,
        previousMonthOrders: values.previousMonthOrders,
      },
    };
  }

  private normalizeProfile<T extends AdminDealerProfileRow>(row: T): T {
    return {
      ...row,
      isActive: String(row.isActive) === 'true',
      mustChangePassword: String(row.mustChangePassword) === 'true',
    };
  }

  private numberRecord(
    row: Record<string, unknown> | null | undefined,
  ): Record<string, number> {
    return Object.fromEntries(
      Object.entries(row ?? {}).map(([key, value]) => [
        key,
        Number(value ?? 0),
      ]),
    );
  }

  private toOrderSummary(values: Record<string, number>): DealerOrderSummary {
    return {
      totalOrders: values.totalOrders,
      pendingOrders: values.pendingOrders,
      approvedOrders: values.approvedOrders,
      partiallyFulfilledOrders: values.partiallyFulfilledOrders,
      cancelledOrders: values.cancelledOrders,
      rejectedOrders: values.rejectedOrders,
      completedOrders: values.completedOrders,
      totalRequestedQuantity: values.totalRequestedQuantity,
      totalApprovedQuantity: values.totalApprovedQuantity,
    };
  }
}
