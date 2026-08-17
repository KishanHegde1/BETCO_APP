import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from './base.entity';
import { PmSuryaGharApplication } from './pm-surya-ghar-application.entity';

export enum PmSuryaGharItemUnit {
  PIECE = 'PIECE',
  METER = 'METER',
  FOOT = 'FOOT',
  KILOGRAM = 'KILOGRAM',
  LITER = 'LITER',
  BOX = 'BOX',
  SET = 'SET',
  ROLL = 'ROLL',
  OTHER = 'OTHER',
}

@Entity({ name: 'pm_surya_ghar_items' })
@Index('pm_surya_ghar_items_application_order_index', [
  'applicationId',
  'displayOrder',
  'createdAt',
])
export class PmSuryaGharItem extends BaseEntity {
  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({ name: 'item_name', type: 'varchar', length: 255 })
  itemName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand!: string | null;

  @Column({
    name: 'physical_serial_number',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  physicalSerialNumber!: string | null;

  @Column({ type: 'varchar', length: 20 })
  unit!: PmSuryaGharItemUnit;

  @Column({ type: 'numeric', precision: 9, scale: 3 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2 })
  unitPrice!: string;

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 19,
    scale: 2,
    asExpression: 'ROUND(quantity * unit_price, 2)',
    generatedType: 'STORED',
    insert: false,
    update: false,
  })
  lineTotal!: string;

  @Column({ name: 'display_order', type: 'integer' })
  displayOrder!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => PmSuryaGharApplication, (application) => application.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'application_id' })
  application!: PmSuryaGharApplication;
}
