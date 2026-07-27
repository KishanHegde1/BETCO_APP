import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'daily_stocks' })
@Index(['productId', 'stockDate'], { unique: true })
export class DailyStock extends BaseEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'stock_date', type: 'date' })
  stockDate!: string;

  /** Exact available balance for this product on this stock date. */
  @Column({ type: 'integer' })
  quantity!: number;
}
