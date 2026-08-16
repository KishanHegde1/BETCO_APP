import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from './base.entity';
import { PmSuryaGharApplication } from './pm-surya-ghar-application.entity';

export enum PmSuryaGharDocumentType {
  IDENTITY_PROOF = 'IDENTITY_PROOF',
  ADDRESS_PROOF = 'ADDRESS_PROOF',
  ELECTRICITY_BILL = 'ELECTRICITY_BILL',
  PROPERTY_PROOF = 'PROPERTY_PROOF',
  SITE_PHOTO = 'SITE_PHOTO',
  OTHER = 'OTHER',
}

@Entity({ name: 'pm_surya_ghar_documents' })
@Index('pm_surya_ghar_documents_application_date_index', [
  'applicationId',
  'createdAt',
])
@Index(
  'pm_surya_ghar_documents_application_sha256_unique',
  ['applicationId', 'sha256'],
  { unique: true },
)
export class PmSuryaGharDocument extends BaseEntity {
  @Index()
  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({ name: 'document_type', type: 'varchar', length: 40 })
  documentType!: PmSuryaGharDocumentType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'original_file_name', type: 'varchar', length: 255 })
  originalFileName!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  @Column({ name: 'file_size_bytes', type: 'integer' })
  fileSizeBytes!: number;

  @Column({ name: 'page_count', type: 'smallint' })
  pageCount!: number;

  @Index({ unique: true })
  @Column({ name: 'storage_public_id', type: 'varchar', length: 512 })
  storagePublicId!: string;

  @Column({ name: 'storage_format', type: 'varchar', length: 20 })
  storageFormat!: string;

  @Column({ name: 'sha256', type: 'char', length: 64 })
  sha256!: string;

  @Index()
  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @ManyToOne(
    () => PmSuryaGharApplication,
    (application) => application.documents,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'application_id' })
  application!: PmSuryaGharApplication;
}
