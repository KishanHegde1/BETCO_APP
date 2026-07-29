import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity({ name: 'dealer_invoice_items' })
export class DealerInvoiceItem extends BaseEntity {
  @Index()
  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string;

  @Column({ name: 'item_name', length: 255, default: '' })
  itemName!: string;

  @Column({ nullable: true, length: 100 })
  sku?: string;

  @Column({ type: 'numeric', precision: 14, scale: 3 })
  quantity!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  rate!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  amount!: string;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  discountAmount!: string;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  taxAmount!: string;

  @Column({ nullable: true, length: 32 })
  unit?: string;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder!: number;
}
