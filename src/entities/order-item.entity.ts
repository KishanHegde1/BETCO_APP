import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'order_items' })
@Index(['orderId', 'productId'], { unique: true })
export class OrderItem extends BaseEntity {
  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'approved_quantity', type: 'integer', nullable: true })
  approvedQuantity?: number;
}
