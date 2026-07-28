import { Column, Entity, Index, OneToMany } from 'typeorm';

import { BaseEntity } from './base.entity';
import { SolarProjectMedia } from './solar-project-media.entity';

export enum SolarProjectStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

@Entity({ name: 'solar_projects' })
export class SolarProject extends BaseEntity {
  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 2000 })
  description!: string;

  @Column({
    name: 'customer_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  customerName!: string | null;

  @Index()
  @Column({ length: 255 })
  location!: string;

  @Index()
  @Column({ name: 'completion_date', type: 'date' })
  completionDate!: string;

  @Index()
  @Column({ length: 120 })
  category!: string;

  @Index()
  @Column({
    type: 'varchar',
    length: 20,
    default: SolarProjectStatus.PUBLISHED,
  })
  status!: SolarProjectStatus;

  @Index()
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @OneToMany(() => SolarProjectMedia, (media) => media.project)
  media!: SolarProjectMedia[];
}
