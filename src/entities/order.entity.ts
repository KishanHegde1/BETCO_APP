import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PARTIALLY_FULFILLED = 'PARTIALLY_FULFILLED',
  CANCELLED = 'CANCELLED',
  BILLED = 'BILLED',
  COMPLETED = 'COMPLETED',
}

/** Delivery progresses independently from the booking and billing workflow. */
export enum DeliveryStatus {
  NOT_READY = 'NOT_READY',
  READY_FOR_DISPATCH = 'READY_FOR_DISPATCH',
  SHIPPED = 'SHIPPED',
  RECEIVED = 'RECEIVED',
}

@Entity({ name: 'orders' })
export class Order extends BaseEntity {
  @Index()
  @Column({ name: 'dealer_id', type: 'uuid' })
  dealerId!: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status!: OrderStatus;

  @Column({ nullable: true, length: 1000 })
  remarks?: string;

  @Column({ name: 'admin_remarks', nullable: true, length: 1000 })
  adminRemarks?: string;

  @Column({ name: 'cancellation_reason', nullable: true, length: 1000 })
  cancellationReason?: string;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date;

  /** A Tally bill was confirmed by a staff member; no invoice is stored here. */
  @Column({ name: 'bill_generated', default: false })
  billGenerated!: boolean;

  @Column({ name: 'bill_generated_at', type: 'timestamptz', nullable: true })
  billGeneratedAt?: Date;

  @Index()
  @Column({ name: 'bill_generated_by', type: 'uuid', nullable: true })
  billGeneratedBy?: string;

  @Index()
  @Column({
    name: 'delivery_status',
    type: 'varchar',
    length: 30,
    default: DeliveryStatus.NOT_READY,
  })
  deliveryStatus!: DeliveryStatus;

  @Column({ name: 'shipped_at', type: 'timestamptz', nullable: true })
  shippedAt?: Date | null;

  @Index()
  @Column({ name: 'shipped_by', type: 'uuid', nullable: true })
  shippedBy?: string | null;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt?: Date | null;

  @Index()
  @Column({ name: 'received_by', type: 'uuid', nullable: true })
  receivedBy?: string | null;
}
