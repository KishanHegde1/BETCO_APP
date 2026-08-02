import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

/**
 * An internal acknowledgement that a dealer says cash was handed to Betco.
 *
 * This is deliberately not a Tally receipt and is never read by, or written
 * to, the Tally connector. Staff must enter an official receipt in Tally
 * separately when that is required by the accounting process.
 */
export enum CashDeclarationStatus {
  PENDING = 'PENDING',
  RECEIVED = 'RECEIVED',
}

@Entity({ name: 'cash_declarations' })
@Index('cash_declarations_dealer_status_date_index', [
  'dealerId',
  'status',
  'cashGivenAt',
])
@Index('cash_declarations_status_date_index', ['status', 'cashGivenAt'])
export class CashDeclaration extends BaseEntity {
  @Index()
  @Column({ name: 'dealer_id', type: 'uuid' })
  dealerId!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ name: 'cash_given_at', type: 'timestamptz' })
  cashGivenAt!: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  /**
   * Optional payment/cash proof stored in Cloudinary, never in NeonDB or
   * Tally. The retention service removes the asset after one year.
   */
  @Column({ name: 'payment_proof_url', type: 'text', nullable: true })
  paymentProofUrl?: string | null;

  @Column({ name: 'payment_proof_public_id', type: 'varchar', nullable: true })
  paymentProofPublicId?: string | null;

  @Index('cash_declarations_payment_proof_expiry_index')
  @Column({
    name: 'payment_proof_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  paymentProofExpiresAt?: Date | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: CashDeclarationStatus.PENDING,
  })
  status!: CashDeclarationStatus;

  @Index()
  @Column({ name: 'received_by', type: 'uuid', nullable: true })
  receivedBy?: string | null;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt?: Date | null;
}
