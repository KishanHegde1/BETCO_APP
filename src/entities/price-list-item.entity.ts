import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

export enum PriceListItemMatchStatus {
  MATCHED = 'MATCHED',
  UNMATCHED = 'UNMATCHED',
}

@Entity({ name: 'price_list_items' })
@Index(['priceListId', 'normalizedModelName'], { unique: true })
@Index(['productId'])
export class PriceListItem extends BaseEntity {
  @Column({ name: 'price_list_id', type: 'uuid' })
  priceListId!: string;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId!: string | null;

  @Column({ name: 'model_name', length: 255 })
  modelName!: string;

  @Column({ name: 'normalized_model_name', length: 255 })
  normalizedModelName!: string;

  @Column({
    name: 'net_effective_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  netEffectivePrice!: string | null;

  @Column({
    name: 'gst_rate',
    type: 'numeric',
    precision: 6,
    scale: 3,
    nullable: true,
  })
  gstRate!: string | null;

  @Column({
    name: 'gst_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  gstAmount!: string | null;

  @Column({
    name: 'gst_included_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  gstIncludedPrice!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  mrp!: string | null;

  @Column({ name: 'match_status', type: 'varchar', length: 20 })
  matchStatus!: PriceListItemMatchStatus;
}
