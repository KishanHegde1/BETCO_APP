import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'price_lists' })
@Index(['isActive', 'effectiveDate'])
export class PriceList extends BaseEntity {
  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  supplier!: string | null;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate!: string;

  @Column({ name: 'is_active', default: false })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;
}
