import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export enum StockMovementType {
  STOCK_ADDED = 'STOCK_ADDED',
  STOCK_REDUCED = 'STOCK_REDUCED',
}

/** Append-only evidence for staff stock adjustments. */
@Entity({ name: 'stock_movements' })
@Index(['productId', 'stockDate'])
export class StockMovement extends BaseEntity {
  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'stock_date', type: 'date' })
  stockDate!: string;

  @Column({ name: 'movement_type', type: 'varchar', length: 50 })
  movementType!: StockMovementType;

  @Column({ name: 'quantity_change', type: 'integer' })
  quantityChange!: number;

  @Column({ name: 'previous_quantity', type: 'integer' })
  previousQuantity!: number;

  @Column({ name: 'new_quantity', type: 'integer' })
  newQuantity!: number;

  @Index()
  @Column({ name: 'performed_by', type: 'uuid' })
  performedBy!: string;

  @Column({ type: 'text', nullable: true })
  remarks?: string | null;
}
