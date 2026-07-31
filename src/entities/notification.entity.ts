import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export enum NotificationType {
  ORDER_APPROVED = 'ORDER_APPROVED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_UPDATED = 'ORDER_UPDATED',
  BILL_GENERATED = 'BILL_GENERATED',
  ORDER_SHIPPED = 'ORDER_SHIPPED',
  ORDER_RECEIVED = 'ORDER_RECEIVED',
}

@Entity({ name: 'notifications' })
export class Notification extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: NotificationType.ORDER_UPDATED,
  })
  type!: NotificationType;

  @Column({ name: 'is_read', default: false })
  isRead!: boolean;
}
