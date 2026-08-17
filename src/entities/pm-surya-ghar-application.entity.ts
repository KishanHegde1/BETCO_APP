import { Column, Entity, Index, OneToMany } from 'typeorm';

import { BaseEntity } from './base.entity';
import { PmSuryaGharDocument } from './pm-surya-ghar-document.entity';
import { PmSuryaGharItem } from './pm-surya-ghar-item.entity';

export enum PmSuryaGharApplicationStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
}

@Entity({ name: 'pm_surya_ghar_applications' })
@Index('pm_surya_ghar_applications_owner_status_index', ['createdBy', 'status'])
export class PmSuryaGharApplication extends BaseEntity {
  @Index()
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'staff_visible', type: 'boolean', default: false })
  staffVisible!: boolean;

  @Column({ name: 'customer_name', type: 'varchar', length: 255 })
  customerName!: string;

  @Index()
  @Column({ name: 'customer_phone', type: 'varchar', length: 15 })
  customerPhone!: string;

  @Column({
    name: 'alternate_phone',
    type: 'varchar',
    length: 15,
    nullable: true,
  })
  alternatePhone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'address_line_1', type: 'varchar', length: 500 })
  addressLine1!: string;

  @Column({
    name: 'address_line_2',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 120 })
  city!: string;

  @Column({ type: 'varchar', length: 120 })
  district!: string;

  @Column({ type: 'varchar', length: 120 })
  state!: string;

  @Column({ type: 'varchar', length: 6 })
  pincode!: string;

  @Column({
    name: 'electricity_consumer_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  electricityConsumerNumber!: string | null;

  @Column({
    name: 'electricity_provider',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  electricityProvider!: string | null;

  @Column({
    name: 'sanctioned_load_kw',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  sanctionedLoadKw!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  notes!: string | null;

  @Index()
  @Column({
    type: 'varchar',
    length: 20,
    default: PmSuryaGharApplicationStatus.DRAFT,
  })
  status!: PmSuryaGharApplicationStatus;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @OneToMany(() => PmSuryaGharDocument, (document) => document.application)
  documents!: PmSuryaGharDocument[];

  @OneToMany(() => PmSuryaGharItem, (item) => item.application)
  items!: PmSuryaGharItem[];
}
