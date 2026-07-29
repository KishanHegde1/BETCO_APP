import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'dealer_payments' })
export class DealerPayment extends BaseEntity {
  @Index()
  @Column({ name: 'dealer_id', type: 'uuid' })
  dealerId!: string;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate!: string;

  @Column({ name: 'reference_number', nullable: true, length: 100 })
  referenceNumber?: string;

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

  @Column({ name: 'voucher_number', nullable: true, length: 100 })
  voucherNumber?: string;

  @Column({ name: 'voucher_type', length: 80 })
  voucherType!: string;

  @Column({ name: 'party_ledger_name', length: 255 })
  partyLedgerName!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt!: Date;

  @Column({ name: 'source_metadata', type: 'jsonb', nullable: true })
  sourceMetadata?: Record<string, unknown>;
}
