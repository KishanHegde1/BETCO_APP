import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export enum TallySyncRunStatus {
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

@Entity({ name: 'tally_sync_runs' })
export class TallySyncRun extends BaseEntity {
  @Index()
  @Column({ name: 'connector_id', length: 120 })
  connectorId!: string;

  @Index()
  @Column({ name: 'tally_company_name', length: 255 })
  tallyCompanyName!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: TallySyncRunStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt?: Date;

  @Column({ name: 'ledger_count', type: 'integer', default: 0 })
  ledgerCount!: number;

  @Column({ name: 'invoice_count', type: 'integer', default: 0 })
  invoiceCount!: number;

  @Column({ name: 'payment_count', type: 'integer', default: 0 })
  paymentCount!: number;

  @Column({ name: 'unmatched_count', type: 'integer', default: 0 })
  unmatchedCount!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;
}
