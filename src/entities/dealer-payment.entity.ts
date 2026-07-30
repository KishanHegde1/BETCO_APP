import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'dealer_payments' })
export class DealerPayment extends BaseEntity {
  @Column({ name: 'source_key', length: 512 })
  sourceKey!: string;

  @Index()
  @Column({ name: 'dealer_id', type: 'uuid', nullable: true })
  dealerId?: string | null;

  @Column({ name: 'tally_ledger_id', type: 'uuid', nullable: true })
  tallyLedgerId?: string | null;

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

  @Index()
  @Column({ name: 'normalized_party_ledger_name', length: 255 })
  normalizedPartyLedgerName!: string;

  @Column({
    name: 'payment_mode',
    type: 'varchar',
    nullable: true,
    length: 80,
  })
  paymentMode?: string | null;

  @Column({ type: 'text', nullable: true })
  narration?: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt!: Date;

  @Column({ name: 'source_metadata', type: 'jsonb', nullable: true })
  sourceMetadata?: Record<string, unknown>;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload?: Record<string, unknown>;
}
