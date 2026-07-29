import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'dealer_invoices' })
export class DealerInvoice extends BaseEntity {
  @Column({ name: 'invoice_number', length: 100 })
  invoiceNumber!: string;

  @Index()
  @Column({ name: 'tally_company_name', length: 255 })
  tallyCompanyName!: string;

  @Index()
  @Column({ name: 'tally_voucher_guid', length: 255 })
  tallyVoucherGuid!: string;

  @Column({ name: 'tally_master_id', nullable: true, length: 100 })
  tallyMasterId?: string;

  @Column({ name: 'tally_alter_id', nullable: true, length: 100 })
  tallyAlterId?: string;

  @Column({ name: 'voucher_type', length: 80, default: 'Sales' })
  voucherType!: string;

  @Column({ name: 'party_ledger_name', length: 255 })
  partyLedgerName!: string;

  @Index()
  @Column({ name: 'dealer_id', type: 'uuid' })
  dealerId!: string;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate!: string;

  @Column({ name: 'invoice_amount', type: 'numeric', precision: 14, scale: 2 })
  invoiceAmount!: string;

  @Column({
    name: 'pending_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  pendingAmount!: string;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  discountAmount!: string;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  taxAmount!: string;

  @Column({ name: 'is_cancelled', default: false })
  isCancelled!: boolean;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt!: Date;

  @Column({ name: 'source_metadata', type: 'jsonb', nullable: true })
  sourceMetadata?: Record<string, unknown>;
}
