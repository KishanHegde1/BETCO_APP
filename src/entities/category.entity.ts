import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'categories' })
export class Category extends BaseEntity {
  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'varchar', nullable: true, length: 500 })
  description!: string | null;

  @Column({
    name: 'image_url',
    type: 'varchar',
    nullable: true,
    length: 2048,
  })
  imageUrl!: string | null;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder!: number;

  @Index()
  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
