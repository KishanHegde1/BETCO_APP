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

  @Column({ name: 'mapped_count', type: 'integer', default: 0 })
  mappedCount!: number;

  @Column({ name: 'ledger_inserted_count', type: 'integer', default: 0 })
  ledgerInsertedCount!: number;

  @Column({ name: 'ledger_updated_count', type: 'integer', default: 0 })
  ledgerUpdatedCount!: number;

  @Column({ name: 'invoice_inserted_count', type: 'integer', default: 0 })
  invoiceInsertedCount!: number;

  @Column({ name: 'invoice_updated_count', type: 'integer', default: 0 })
  invoiceUpdatedCount!: number;

  @Column({ name: 'payment_inserted_count', type: 'integer', default: 0 })
  paymentInsertedCount!: number;

  @Column({ name: 'payment_updated_count', type: 'integer', default: 0 })
  paymentUpdatedCount!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;
}
