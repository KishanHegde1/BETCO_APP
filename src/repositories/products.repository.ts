import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { Category } from '../entities/category.entity';
import { DailyStock } from '../entities/daily-stock.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';

export interface AdminProductRow {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  unit: string;
  unitPrice: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DealerProductRow {
  id: string;
  sku: string;
  name: string;
  isActive: boolean;
  category: {
    id: string;
    name: string;
  };
}

export interface ProductPage {
  items: AdminProductRow[];
  total: number;
}

@Injectable()
export class ProductsRepository {
  constructor(
    @InjectRepository(Product) readonly repository: Repository<Product>,
  ) {}

  async findActiveCatalogue(): Promise<DealerProductRow[]> {
    const rows = await this.repository
      .createQueryBuilder('product')
      .innerJoin(Category, 'category', 'category.id = product.category_id')
      .where('product.is_active = true')
      .select([
        'product.id AS "id"',
        'product.sku AS "sku"',
        'product.name AS "name"',
        'product.is_active AS "isActive"',
        'category.id AS "categoryId"',
        'category.name AS "categoryName"',
      ])
      .orderBy('category.name', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .getRawMany<{
        id: string;
        sku: string;
        name: string;
        isActive: boolean;
        categoryId: string;
        categoryName: string;
      }>();

    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      isActive: Boolean(row.isActive),
      category: { id: row.categoryId, name: row.categoryName },
    }));
  }

  findById(id: string): Promise<Product | null> {
    return this.repository.findOneBy({ id });
  }

  findBySkuInsensitive(sku: string): Promise<Product | null> {
    return this.repository
      .createQueryBuilder('product')
      .where('LOWER(product.sku) = LOWER(:sku)', { sku })
      .getOne();
  }

  findCategoryById(id: string): Promise<Category | null> {
    return this.repository.manager.getRepository(Category).findOneBy({ id });
  }

  async findPage(options: {
    page: number;
    limit: number;
    search?: string;
    categoryId?: string;
    isActive?: boolean;
    sortBy: 'name' | 'sku' | 'displayOrder' | 'createdAt';
    sortOrder: 'ASC' | 'DESC';
  }): Promise<ProductPage> {
    const query = this.adminQuery();
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
    if (options.isActive !== undefined) {
      query.andWhere('product.is_active = :isActive', {
        isActive: options.isActive,
      });
    }

    const sortableColumns = {
      name: 'product.name',
      sku: 'product.sku',
      displayOrder: 'product.display_order',
      createdAt: 'product.created_at',
    } as const;
    const total = await query.clone().getCount();
    const rows = await query
      .orderBy(sortableColumns[options.sortBy], options.sortOrder)
      .addOrderBy('product.name', 'ASC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getRawMany<AdminProductRow>();
    return { items: rows.map((row) => this.normalizeRow(row)), total };
  }

  async findAdminById(id: string): Promise<AdminProductRow | null> {
    const row = await this.adminQuery()
      .where('product.id = :id', { id })
      .getRawOne<AdminProductRow>();
    return row ? this.normalizeRow(row) : null;
  }

  async isReferenced(productId: string): Promise<boolean> {
    const [stockCount, orderItemCount] = await Promise.all([
      this.repository.manager
        .getRepository(DailyStock)
        .count({ where: { productId } }),
      this.repository.manager
        .getRepository(OrderItem)
        .count({ where: { productId } }),
    ]);
    return stockCount > 0 || orderItemCount > 0;
  }

  save(product: Product): Promise<Product> {
    return this.repository.save(product);
  }

  remove(product: Product): Promise<Product> {
    return this.repository.remove(product);
  }

  private adminQuery() {
    return this.repository
      .createQueryBuilder('product')
      .innerJoin(Category, 'category', 'category.id = product.category_id')
      .select([
        'product.id AS "id"',
        'product.category_id AS "categoryId"',
        'category.name AS "categoryName"',
        'product.name AS "name"',
        'product.sku AS "sku"',
        'product.description AS "description"',
        'product.image_url AS "imageUrl"',
        'product.unit AS "unit"',
        'product.unit_price AS "unitPrice"',
        'product.display_order AS "displayOrder"',
        'product.is_active AS "isActive"',
        'product.created_at AS "createdAt"',
        'product.updated_at AS "updatedAt"',
      ]);
  }

  private normalizeRow(row: AdminProductRow): AdminProductRow {
    return {
      ...row,
      unitPrice: Number(row.unitPrice).toFixed(2),
      displayOrder: Number(row.displayOrder),
      isActive: Boolean(row.isActive),
    };
  }
}
