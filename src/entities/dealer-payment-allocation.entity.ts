import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'dealer_payment_allocations' })
export class DealerPaymentAllocation extends BaseEntity {
  @Index()
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Index()
  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;
}
