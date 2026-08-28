import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export enum AccountDeletionRequestStatus {
  PENDING = 'PENDING',
  IN_REVIEW = 'IN_REVIEW',
  COMPLETED = 'COMPLETED',
  DECLINED = 'DECLINED',
}

/**
 * A minimal audit record for a public deletion request. It deliberately does
 * not expose a user record until a Betco administrator verifies the requester.
 */
@Entity({ name: 'account_deletion_requests' })
@Index('account_deletion_requests_status_created_at_index', [
  'status',
  'createdAt',
])
export class AccountDeletionRequest extends BaseEntity {
  @Column({ name: 'account_identifier', type: 'varchar', length: 255 })
  accountIdentifier!: string;

  @Column({ type: 'varchar', length: 255 })
  contact!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  details!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: AccountDeletionRequestStatus.PENDING,
  })
  status!: AccountDeletionRequestStatus;

  @Column({ name: 'handled_at', type: 'timestamptz', nullable: true })
  handledAt!: Date | null;
}
