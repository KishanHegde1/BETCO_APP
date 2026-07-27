import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export enum ProductUnit {
  PIECE = 'PIECE',
  SET = 'SET',
  BOX = 'BOX',
}

@Entity({ name: 'products' })
export class Product extends BaseEntity {
  @Column({ length: 100 })
  sku!: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'varchar', nullable: true, length: 2000 })
  description!: string | null;

  @Column({
    name: 'image_url',
    type: 'varchar',
    nullable: true,
    length: 2048,
  })
  imageUrl!: string | null;

  @Column({ type: 'varchar', length: 20, default: ProductUnit.PIECE })
  unit!: ProductUnit;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder!: number;

  @Index()
  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
