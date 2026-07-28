import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from './base.entity';
import { SolarProject } from './solar-project.entity';

export enum SolarProjectMediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

@Entity({ name: 'solar_project_media' })
export class SolarProjectMedia extends BaseEntity {
  @Index()
  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'media_url', type: 'varchar', length: 2048 })
  mediaUrl!: string;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 2048 })
  thumbnailUrl!: string;

  @Column({ name: 'public_id', type: 'varchar', length: 512 })
  publicId!: string;

  @Column({ name: 'media_type', type: 'varchar', length: 10 })
  mediaType!: SolarProjectMediaType;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder!: number;

  @ManyToOne(() => SolarProject, (project) => project.media, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project!: SolarProject;
}
