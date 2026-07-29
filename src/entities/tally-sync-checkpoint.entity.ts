import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'tally_sync_checkpoints' })
@Index(['connectorId', 'tallyCompanyName'], { unique: true })
export class TallySyncCheckpoint extends BaseEntity {
  @Column({ name: 'connector_id', length: 120 })
  connectorId!: string;

  @Column({ name: 'tally_company_name', length: 255 })
  tallyCompanyName!: string;

  @Column({ name: 'checkpoint_token', nullable: true, length: 255 })
  checkpointToken?: string;

  @Column({
    name: 'last_successful_sync_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastSuccessfulSyncAt?: Date;
}
