import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EntityManager, LessThanOrEqual } from 'typeorm';

import { DailyStock } from '../entities/daily-stock.entity';
import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';
import {
  StockMovement,
  StockMovementType,
} from '../entities/stock-movement.entity';
import {
  AdminDailyStockItem,
  DailyStockRepository,
  TodayStockItem,
} from '../repositories/daily-stock.repository';
import {
  AdminDailyStockQueryDto,
  CopyDailyStockDto,
  PatchDailyStockDto,
  SetDailyStockDto,
  SetDailyStockItemDto,
  isoDateValidation,
} from './dto/admin-daily-stock.dto';
import { AddStaffStockDto } from './dto/add-staff-stock.dto';
import { ReduceStaffStockDto } from './dto/reduce-staff-stock.dto';

export interface StaffStockAddResponse {
  productId: string;
  productName: string;
  stockDate: string;
  quantityAdded: number;
  previousQuantity: number;
  newQuantity: number;
  movementId: string;
}

export interface StaffStockReductionResponse {
  productId: string;
  productName: string;
  stockDate: string;
  quantityReduced: number;
  previousQuantity: number;
  newQuantity: number;
  movementId: string;
}

interface StaffStockAdjustment {
  productId: string;
  productName: string;
  stockDate: string;
  previousQuantity: number;
  newQuantity: number;
  movementId: string;
}

/** Dealer-safe stock view. Exact inventory is restricted to staff and admins. */
export type DealerStockAvailabilityItem = Omit<TodayStockItem, 'quantity'>;

@Injectable()
export class StockService {
  constructor(readonly dailyStockRepository: DailyStockRepository) {}

  getTodayStock(date?: string): Promise<TodayStockItem[]> {
    const requestedDate = date ?? this.getIndianCalendarDate();
    this.assertIsoDate(requestedDate);
    return this.dailyStockRepository.findCatalogueStockForDate(requestedDate);
  }

  async getDealerStockAvailability(
    date?: string,
  ): Promise<DealerStockAvailabilityItem[]> {
    const items = await this.getTodayStock(date);
    return items.map(({ quantity: _quantity, ...item }) => item);
  }

  async getAdminStockForDate(
    date: string,
    query: AdminDailyStockQueryDto,
  ): Promise<AdminDailyStockItem[]> {
    this.assertIsoDate(date);
    return this.dailyStockRepository.findAdminStockForDate(date, query);
  }

  async setAdminStockForDate(
    date: string,
    dto: SetDailyStockDto,
  ): Promise<AdminDailyStockItem[]> {
    this.assertIsoDate(date);
    this.assertNoDuplicateProducts(dto.items);
    await this.dailyStockRepository.transaction(async (manager) => {
      for (const item of dto.items) {
        await this.writeStockItem(manager, date, item);
      }
    });
    return this.getAdminStockForDate(date, {});
  }

  async patchAdminStockProduct(
    date: string,
    productId: string,
    dto: PatchDailyStockDto,
  ): Promise<AdminDailyStockItem> {
    this.assertIsoDate(date);
    await this.dailyStockRepository.transaction((manager) =>
      this.writeStockItem(manager, date, { productId, ...dto }),
    );
    const item = (await this.getAdminStockForDate(date, {})).find(
      (stock) => stock.productId === productId,
    );
    if (!item) {
      throw new BadRequestException('Product stock could not be loaded.');
    }
    return item;
  }

  async copyAdminStockForDate(
    targetDate: string,
    dto: CopyDailyStockDto,
  ): Promise<AdminDailyStockItem[]> {
    this.assertIsoDate(targetDate);
    this.assertIsoDate(dto.sourceDate);
    if (targetDate === dto.sourceDate) {
      throw new BadRequestException(
        'Source and target dates must be different.',
      );
    }

    await this.dailyStockRepository.transaction(async (manager) => {
      const stockRepository = manager.getRepository(DailyStock);
      const sourceEntries = await stockRepository.find({
        where: { stockDate: dto.sourceDate },
      });
      for (const source of sourceEntries) {
        const product = await manager.getRepository(Product).findOneBy({
          id: source.productId,
          isActive: true,
        });
        if (!product) continue;

        const target = await stockRepository.findOne({
          where: { productId: source.productId, stockDate: targetDate },
          lock: { mode: 'pessimistic_write' },
        });
        if (target && !dto.overwriteExisting) continue;

        if (!target) {
          await stockRepository.save(
            stockRepository.create({
              productId: source.productId,
              stockDate: targetDate,
              quantity: source.quantity,
            }),
          );
          continue;
        }
        target.quantity = source.quantity;
        await stockRepository.save(target);
      }
    });
    return this.getAdminStockForDate(targetDate, {});
  }

  /** Adds stock, recording an immutable audited stock movement. */
  async addStockForStaff(
    userId: string,
    dto: AddStaffStockDto,
  ): Promise<StaffStockAddResponse> {
    if (!Number.isInteger(dto.quantityToAdd) || dto.quantityToAdd <= 0) {
      throw new BadRequestException('INVALID_STOCK_QUANTITY');
    }

    const adjustment = await this.adjustStockForStaff({
      userId,
      productId: dto.productId,
      stockDate: dto.stockDate,
      quantityChange: dto.quantityToAdd,
      movementType: StockMovementType.STOCK_ADDED,
    });
    return { ...adjustment, quantityAdded: dto.quantityToAdd };
  }

  /**
   * Records an audited stock reduction.  A row-level transaction guarantees
   * that a concurrent adjustment cannot take a product below zero.
   */
  async reduceStockForStaff(
    userId: string,
    dto: ReduceStaffStockDto,
  ): Promise<StaffStockReductionResponse> {
    if (!Number.isInteger(dto.quantityToReduce) || dto.quantityToReduce <= 0) {
      throw new BadRequestException('INVALID_STOCK_QUANTITY');
    }

    const adjustment = await this.adjustStockForStaff({
      userId,
      productId: dto.productId,
      stockDate: dto.stockDate,
      quantityChange: -dto.quantityToReduce,
      movementType: StockMovementType.STOCK_REDUCED,
    });
    return { ...adjustment, quantityReduced: dto.quantityToReduce };
  }

  private async adjustStockForStaff({
    userId,
    productId,
    stockDate,
    quantityChange,
    movementType,
  }: {
    userId: string;
    productId: string;
    stockDate: string;
    quantityChange: number;
    movementType: StockMovementType;
  }): Promise<StaffStockAdjustment> {
    this.assertIsoDate(stockDate);
    if (stockDate !== this.getIndianCalendarDate()) {
      throw new BadRequestException(
        'Staff can adjust stock only for the current business date.',
      );
    }

    return this.dailyStockRepository.transaction(async (manager) => {
      // Lock a stable per-product/per-date key even when the first stock row
      // does not exist yet. This closes the unique-row creation race that a
      // normal row lock cannot cover.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `staff-stock:${productId}:${stockDate}`,
      ]);
      const product = await manager.getRepository(Product).findOneBy({
        id: productId,
        isActive: true,
      });
      const category = product
        ? await manager.getRepository(Category).findOneBy({
            id: product.categoryId,
            isActive: true,
          })
        : null;
      if (!product || !category) {
        throw new BadRequestException(
          'A selected product or its category is unavailable or inactive.',
        );
      }

      const stockRepository = manager.getRepository(DailyStock);
      let stock = await stockRepository.findOne({
        where: { productId, stockDate },
        lock: { mode: 'pessimistic_write' },
      });
      if (!stock) {
        const previous = await stockRepository.findOne({
          where: {
            productId,
            stockDate: LessThanOrEqual(stockDate),
          },
          order: { stockDate: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
        // Recheck after locking the preceding balance so parallel additions
        // do not create two competing date rows.
        stock = await stockRepository.findOne({
          where: { productId, stockDate },
          lock: { mode: 'pessimistic_write' },
        });
        if (!stock) {
          stock = stockRepository.create({
            productId,
            stockDate,
            quantity: previous?.quantity ?? 0,
          });
          stock = await stockRepository.save(stock);
        }
      }

      const previousQuantity = stock.quantity;
      const newQuantity = previousQuantity + quantityChange;
      if (newQuantity < 0) {
        throw new ConflictException(
          `Only ${previousQuantity} units are available for this reduction.`,
        );
      }
      stock.quantity = newQuantity;
      stock = await stockRepository.save(stock);
      const movementRepository = manager.getRepository(StockMovement);
      const movement = await movementRepository.save(
        movementRepository.create({
          productId: product.id,
          stockDate,
          movementType,
          quantityChange,
          previousQuantity,
          newQuantity: stock.quantity,
          performedBy: userId,
        }),
      );
      return {
        productId: product.id,
        productName: product.name,
        stockDate,
        previousQuantity,
        newQuantity: stock.quantity,
        movementId: movement.id,
      };
    });
  }

  private async writeStockItem(
    manager: EntityManager,
    date: string,
    item: SetDailyStockItemDto,
  ): Promise<void> {
    const product = await manager.getRepository(Product).findOneBy({
      id: item.productId,
      isActive: true,
    });
    const category = product
      ? await manager
          .getRepository(Category)
          .findOneBy({ id: product.categoryId })
      : null;
    if (!product || !category?.isActive) {
      throw new BadRequestException(
        'A selected product or its category is unavailable or inactive.',
      );
    }

    const stockRepository = manager.getRepository(DailyStock);
    await stockRepository
      .createQueryBuilder()
      .insert()
      .into(DailyStock)
      .values({
        productId: item.productId,
        stockDate: date,
        quantity: item.quantity,
      })
      .orUpdate(['quantity', 'updated_at'], ['product_id', 'stock_date'])
      .execute();
  }

  private assertNoDuplicateProducts(items: SetDailyStockItemDto[]): void {
    const ids = new Set<string>();
    for (const item of items) {
      if (ids.has(item.productId)) {
        throw new BadRequestException(
          'A product may appear only once in a stock update.',
        );
      }
      ids.add(item.productId);
    }
  }

  private assertIsoDate(date: string): void {
    if (
      !isoDateValidation.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    ) {
      throw new BadRequestException('Date must use the ISO format YYYY-MM-DD.');
    }
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
