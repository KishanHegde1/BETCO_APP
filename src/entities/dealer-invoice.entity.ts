import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'dealer_invoices' })
export class DealerInvoice extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'invoice_number', length: 100 })
  invoiceNumber!: string;

  @Index()
  @Column({ name: 'dealer_id', type: 'uuid' })
  dealerId!: string;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate!: string;
}
