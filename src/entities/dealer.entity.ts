import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'dealers' })
export class Dealer extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'business_name', length: 255 })
  businessName!: string;

  @Column({ name: 'shop_name', nullable: true, length: 255 })
  shopName?: string;

  @Column({ nullable: true, length: 32 })
  phone?: string;

  @Column({ name: 'contact_number', nullable: true, length: 32 })
  contactNumber?: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;
}
