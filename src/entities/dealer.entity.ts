import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'dealers' })
export class Dealer extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'business_name', length: 255 })
  businessName!: string;

  @Column({ nullable: true, length: 32 })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;
}
