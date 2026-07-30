import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'dealer_invoices' })
export class DealerInvoice extends BaseEntity {
  @Column({ name: 'source_key', length: 512 })
  sourceKey!: string;

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
  @Column({ name: 'normalized_party_ledger_name', length: 255 })
  normalizedPartyLedgerName!: string;

  @Index()
  @Column({ name: 'dealer_id', type: 'uuid', nullable: true })
  dealerId?: string | null;

  @Column({ name: 'tally_ledger_id', type: 'uuid', nullable: true })
  tallyLedgerId?: string | null;

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

  @Column({ name: 'paid_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  paidAmount!: string;

  @Index()
  @Column({ name: 'payment_status', length: 30, default: 'UNKNOWN' })
  paymentStatus!: string;

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

  @Column({ type: 'text', nullable: true })
  narration?: string | null;

  @Column({ name: 'pdf_url', type: 'text', nullable: true })
  pdfUrl?: string | null;

  @Column({ name: 'pdf_status', length: 20, default: 'NOT_AVAILABLE' })
  pdfStatus!: string;

  @Column({ name: 'pdf_generated_at', type: 'timestamptz', nullable: true })
  pdfGeneratedAt?: Date | null;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt!: Date;

  @Column({ name: 'source_metadata', type: 'jsonb', nullable: true })
  sourceMetadata?: Record<string, unknown>;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload?: Record<string, unknown>;
}
