import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export enum TallyLedgerMappingStatus {
  MAPPED = 'MAPPED',
  UNMAPPED = 'UNMAPPED',
}

/** A read-only local projection of a Tally ledger. */
@Entity({ name: 'tally_ledgers' })
@Index(['tallyCompanyName', 'sourceKey'], { unique: true })
export class TallyLedger extends BaseEntity {
  @Column({ name: 'tally_company_name', length: 255 })
  tallyCompanyName!: string;

  @Column({ name: 'source_key', length: 512 })
  sourceKey!: string;

  @Index()
  @Column({ name: 'tally_ledger_guid', nullable: true, length: 255 })
  tallyLedgerGuid?: string | null;

  @Column({ name: 'tally_ledger_name', length: 255 })
  tallyLedgerName!: string;

  @Index()
  @Column({ name: 'normalized_ledger_name', length: 255 })
  normalizedLedgerName!: string;

  @Column({ name: 'parent_group', nullable: true, length: 255 })
  parentGroup?: string | null;

  @Index()
  @Column({ nullable: true, length: 32 })
  phone?: string | null;

  @Column({ nullable: true, length: 255 })
  email?: string | null;

  @Index()
  @Column({ nullable: true, length: 32 })
  gstin?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ name: 'opening_balance', type: 'numeric', precision: 14, scale: 2, default: 0 })
  openingBalance!: string;

  @Column({ name: 'closing_balance', type: 'numeric', precision: 14, scale: 2, default: 0 })
  closingBalance!: string;

  @Index()
  @Column({ name: 'dealer_id', type: 'uuid', nullable: true })
  dealerId?: string | null;

  @Index()
  @Column({ name: 'mapping_status', length: 20, default: TallyLedgerMappingStatus.UNMAPPED })
  mappingStatus!: TallyLedgerMappingStatus;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt?: Date | null;
}
