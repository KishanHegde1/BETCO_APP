import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export type TallyMappingMethod =
  'MANUAL' | 'GSTIN' | 'DEALER_CODE' | 'PHONE' | 'NAME';

@Entity({ name: 'tally_dealer_mappings' })
@Index(['tallyCompanyName', 'tallyLedgerGuid'], { unique: true })
@Index(['dealerId', 'tallyCompanyName'], { unique: true })
export class TallyDealerMapping extends BaseEntity {
  @Index()
  @Column({ name: 'dealer_id', type: 'uuid' })
  dealerId!: string;

  @Column({ name: 'tally_company_name', length: 255 })
  tallyCompanyName!: string;

  @Column({ name: 'tally_ledger_guid', nullable: true, length: 255 })
  tallyLedgerGuid?: string;

  @Column({ name: 'tally_ledger_name', length: 255 })
  tallyLedgerName!: string;

  @Column({ name: 'mapping_method', type: 'varchar', length: 30 })
  mappingMethod!: TallyMappingMethod;

  @Column({
    name: 'last_closing_balance',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  lastClosingBalance!: string;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt?: Date;
}
