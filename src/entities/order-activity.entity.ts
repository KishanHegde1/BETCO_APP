import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export enum OrderActivityType {
  ORDER_PLACED = 'ORDER_PLACED',
  ORDER_APPROVED = 'ORDER_APPROVED',
  ORDER_PARTIALLY_APPROVED = 'ORDER_PARTIALLY_APPROVED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  BILL_GENERATED = 'BILL_GENERATED',
  ORDER_SHIPPED = 'ORDER_SHIPPED',
  ORDER_RECEIVED = 'ORDER_RECEIVED',
}

/** Immutable audit records shown in the order timeline. */
@Entity({ name: 'order_activities' })
@Index(['orderId', 'createdAt'])
export class OrderActivity extends BaseEntity {
  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'activity_type', type: 'varchar', length: 50 })
  activityType!: OrderActivityType;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Index()
  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy?: string | null;
}
