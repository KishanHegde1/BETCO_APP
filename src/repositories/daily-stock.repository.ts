import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';

import { Category } from '../entities/category.entity';
import { DailyStock } from '../entities/daily-stock.entity';
import { Product } from '../entities/product.entity';

export interface TodayStockItem {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  sourceStockDate: string | null;
  isCarriedForward: boolean;
  isAvailable: boolean;
  stockUpdatedAt: Date | null;
}

export interface AdminDailyStockItem {
  productId: string;
  productName: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  quantity: number;
  sourceStockDate: string | null;
  isCarriedForward: boolean;
  isAvailable: boolean;
  hasStockEntry: boolean;
}

type ResolvedStockRow = {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  categoryId: string;
  categoryName: string;
  quantity: string | number;
  sourceStockDate: string | null;
  isCarriedForward: boolean | string;
  isAvailable: boolean | string;
  stockUpdatedAt: Date | null;
  hasStockEntry?: boolean | string;
  isActive: boolean | string;
};

@Injectable()
export class DailyStockRepository {
  constructor(
    @InjectRepository(DailyStock) readonly repository: Repository<DailyStock>,
  ) {}

  /**
   * Gets every active product's balance as of `date`. A missing exact-date row
   * carries the latest earlier balance forward without creating a new row.
   */
  async findCatalogueStockForDate(date: string): Promise<TodayStockItem[]> {
    const rows = await this.resolvedStockQuery(date)
      .select(this.catalogueColumns())
      .orderBy('category.display_order', 'ASC')
      .addOrderBy('product.display_order', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .getRawMany<ResolvedStockRow>();

    return rows.map((row) => this.toDealerItem(row));
  }

  async findAdminStockForDate(
    date: string,
    options: { search?: string; categoryId?: string },
  ): Promise<AdminDailyStockItem[]> {
    const query = this.resolvedStockQuery(date).select([
      ...this.catalogueColumns(),
      `CASE WHEN stock."sourceStockDate" = :stockDate THEN true ELSE false END AS "hasStockEntry"`,
    ]);

    if (options.search) {
      query.andWhere(
        new Brackets((builder) => {
          builder
            .where('product.name ILIKE :search', {
              search: `%${options.search}%`,
            })
            .orWhere('product.sku ILIKE :search', {
              search: `%${options.search}%`,
            });
        }),
      );
    }
    if (options.categoryId) {
      query.andWhere('product.category_id = :categoryId', {
        categoryId: options.categoryId,
      });
    }

    const rows = await query
      .orderBy('category.display_order', 'ASC')
      .addOrderBy('product.display_order', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .getRawMany<ResolvedStockRow>();

    return rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      sku: row.sku,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      unit: row.unit,
      quantity: this.quantity(row),
      sourceStockDate: row.sourceStockDate,
      isCarriedForward: this.boolean(row.isCarriedForward),
      isAvailable: this.boolean(row.isAvailable),
      hasStockEntry: this.boolean(row.hasStockEntry),
      isActive: this.boolean(row.isActive),
    }));
  }

  transaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.repository.manager.transaction(callback);
  }

  private resolvedStockQuery(date: string) {
    return this.repository.manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .innerJoin(Category, 'category', 'category.id = product.category_id')
      .leftJoin(
        (subQuery) =>
          subQuery
            .select([
              'stock_source.product_id AS "productId"',
              'stock_source.stock_date AS "sourceStockDate"',
              'stock_source.quantity AS "quantity"',
              'stock_source.updated_at AS "stockUpdatedAt"',
            ])
            .from(DailyStock, 'stock_source')
            .where('stock_source.stock_date <= :stockDate', {
              stockDate: date,
            })
            .distinctOn(['stock_source.product_id'])
            .orderBy('stock_source.product_id', 'ASC')
            .addOrderBy('stock_source.stock_date', 'DESC'),
        'stock',
        'stock."productId" = product.id',
      )
      .where('product.is_active = true')
      .andWhere('category.is_active = true')
      .setParameter('stockDate', date);
  }

  private catalogueColumns(): string[] {
    return [
      'product.id AS "productId"',
      'product.sku AS "sku"',
      'product.name AS "productName"',
      'product.unit AS "unit"',
      'category.id AS "categoryId"',
      'category.name AS "categoryName"',
      'product.is_active AS "isActive"',
      'GREATEST(COALESCE(stock."quantity", 0), 0) AS "quantity"',
      'stock."sourceStockDate" AS "sourceStockDate"',
      `CASE WHEN stock."sourceStockDate" < :stockDate THEN true ELSE false END AS "isCarriedForward"`,
      'CASE WHEN COALESCE(stock."quantity", 0) > 0 THEN true ELSE false END AS "isAvailable"',
      'stock."stockUpdatedAt" AS "stockUpdatedAt"',
    ];
  }

  private toDealerItem(row: ResolvedStockRow): TodayStockItem {
    return {
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      unit: row.unit,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      quantity: this.quantity(row),
      sourceStockDate: row.sourceStockDate,
      isCarriedForward: this.boolean(row.isCarriedForward),
      isAvailable: this.boolean(row.isAvailable),
      stockUpdatedAt: row.stockUpdatedAt,
    };
  }

  private quantity(row: ResolvedStockRow): number {
    return Math.max(0, Number(row.quantity));
  }

  private boolean(value: boolean | string | undefined): boolean {
    return value === true || value === 'true';
  }
}
