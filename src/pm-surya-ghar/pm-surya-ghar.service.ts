import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PDFDocument, PDFName } from 'pdf-lib';
import { EntityManager, In, Repository } from 'typeorm';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UserRole } from '../common/constants/user-role.enum';
import {
  PmSuryaGharApplication,
  PmSuryaGharApplicationStatus,
} from '../entities/pm-surya-ghar-application.entity';
import {
  PmSuryaGharDocument,
  PmSuryaGharDocumentType,
} from '../entities/pm-surya-ghar-document.entity';
import {
  PmSuryaGharItem,
  PmSuryaGharItemUnit,
} from '../entities/pm-surya-ghar-item.entity';
import { User } from '../entities/user.entity';
import { CreatePmSuryaGharApplicationDto } from './dto/create-pm-surya-ghar-application.dto';
import { CreatePmSuryaGharItemDto } from './dto/create-pm-surya-ghar-item.dto';
import { UpdatePmSuryaGharApplicationDto } from './dto/update-pm-surya-ghar-application.dto';
import { UpdatePmSuryaGharItemDto } from './dto/update-pm-surya-ghar-item.dto';
import { UploadPmSuryaGharDocumentDto } from './dto/upload-pm-surya-ghar-document.dto';

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 30;
const MAX_DOCUMENTS_PER_APPLICATION = 25;
const MAX_DOCUMENT_BYTES_PER_APPLICATION = 200 * 1024 * 1024;
const MAX_ITEMS_PER_APPLICATION = 250;
const DUPLICATE_DOCUMENT_CONSTRAINT =
  'pm_surya_ghar_documents_application_sha256_unique';
const DUPLICATE_ITEM_SERIAL_CONSTRAINT =
  'pm_surya_ghar_items_application_serial_unique';

export interface UploadedPmSuryaGharPdf {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface PmSuryaGharDocumentResponse {
  id: string;
  documentType: PmSuryaGharDocumentType;
  title: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  pageCount: number;
  createdAt: Date;
}

export interface PmSuryaGharItemResponse {
  id: string;
  itemName: string;
  brand: string | null;
  serialNumber: string | null;
  unit: PmSuryaGharItemUnit;
  quantity: string;
  /** Internal pricing is intentionally omitted from every STAFF response. */
  unitPrice?: string;
  lineTotal?: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PmSuryaGharApplicationResponse {
  id: string;
  createdBy: string;
  isSharedWithStaff: boolean;
  canManage: boolean;
  customerName: string;
  customerPhone: string;
  alternatePhone: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  district: string;
  state: string;
  pincode: string;
  electricityConsumerNumber: string | null;
  electricityProvider: string | null;
  sanctionedLoadKw: number | null;
  notes: string | null;
  status: PmSuryaGharApplicationStatus;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  documents: PmSuryaGharDocumentResponse[];
  items: PmSuryaGharItemResponse[];
  /** Internal pricing is intentionally omitted from every STAFF response. */
  itemsGrandTotal?: string;
}

export interface PmSuryaGharDownloadResponse {
  url: string;
  expiresAt: Date;
}

interface CurrentPmSuryaGharActor {
  id: string;
  role: UserRole.ADMIN | UserRole.STAFF;
}

@Injectable()
export class PmSuryaGharService {
  constructor(
    @InjectRepository(PmSuryaGharApplication)
    private readonly applications: Repository<PmSuryaGharApplication>,
    @InjectRepository(PmSuryaGharDocument)
    private readonly documents: Repository<PmSuryaGharDocument>,
    @InjectRepository(PmSuryaGharItem)
    private readonly items: Repository<PmSuryaGharItem>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    actor: JwtPayload,
    dto: CreatePmSuryaGharApplicationDto,
  ): Promise<PmSuryaGharApplicationResponse> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    const application = this.applications.create({
      createdBy: currentActor.id,
      staffVisible: currentActor.role === UserRole.ADMIN,
      customerName: this.requiredText(dto.customerName, 'Customer name'),
      customerPhone: this.requiredText(dto.customerPhone, 'Customer phone'),
      alternatePhone: this.optionalText(dto.alternatePhone),
      email: this.optionalText(dto.email)?.toLowerCase() ?? null,
      addressLine1: this.requiredText(dto.addressLine1, 'Address line 1'),
      addressLine2: this.optionalText(dto.addressLine2),
      city: this.requiredText(dto.city, 'City'),
      district: this.requiredText(dto.district, 'District'),
      state: this.requiredText(dto.state, 'State'),
      pincode: this.requiredText(dto.pincode, 'Pincode'),
      electricityConsumerNumber: this.optionalText(
        dto.electricityConsumerNumber,
      ),
      electricityProvider: this.optionalText(dto.electricityProvider),
      sanctionedLoadKw: this.loadValue(dto.sanctionedLoadKw),
      notes: this.optionalText(dto.notes),
      status: PmSuryaGharApplicationStatus.DRAFT,
      submittedAt: null,
    });
    const saved = await this.applications.save(application);
    saved.documents = [];
    saved.items = [];
    return this.toApplicationResponse(saved, currentActor);
  }

  async findAll(actor: JwtPayload): Promise<PmSuryaGharApplicationResponse[]> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    const builder = this.applications.createQueryBuilder('application');
    if (currentActor.role !== UserRole.ADMIN) {
      builder.where(
        '(application.created_by = :createdBy OR application.staff_visible = TRUE)',
        { createdBy: currentActor.id },
      );
    }
    const applications = await builder
      .orderBy('application.updated_at', 'DESC')
      .getMany();
    await this.loadApplicationDetails(applications);
    return applications.map((application) =>
      this.toApplicationResponse(application, currentActor),
    );
  }

  async findOne(
    id: string,
    actor: JwtPayload,
  ): Promise<PmSuryaGharApplicationResponse> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    return this.toApplicationResponse(
      await this.requireAccessibleApplication(id, currentActor),
      currentActor,
    );
  }

  async update(
    id: string,
    actor: JwtPayload,
    dto: UpdatePmSuryaGharApplicationDto,
  ): Promise<PmSuryaGharApplicationResponse> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    await this.applications.manager.transaction(async (manager) => {
      const application = await this.lockManageableApplication(
        manager,
        id,
        currentActor,
      );
      this.applyUpdate(application, dto);
      await manager.save(application);
    });
    return this.toApplicationResponse(
      await this.requireAccessibleApplication(id, currentActor),
      currentActor,
    );
  }

  async createItem(
    applicationId: string,
    actor: JwtPayload,
    dto: CreatePmSuryaGharItemDto,
  ): Promise<PmSuryaGharApplicationResponse> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    try {
      await this.applications.manager.transaction(async (manager) => {
        const application = await this.lockAccessibleDraft(
          manager,
          applicationId,
          currentActor,
        );
        const repository = manager.getRepository(PmSuryaGharItem);
        const itemCount = await repository.count({ where: { applicationId } });
        if (itemCount >= MAX_ITEMS_PER_APPLICATION) {
          throw new BadRequestException(
            `An application can contain up to ${MAX_ITEMS_PER_APPLICATION} supplied items.`,
          );
        }
        const lastItem = await repository.findOne({
          select: { displayOrder: true },
          where: { applicationId },
          order: { displayOrder: 'DESC' },
        });
        const displayOrder = (lastItem?.displayOrder ?? -1) + 1;
        await repository.save(
          repository.create({
            applicationId,
            itemName: this.requiredText(dto.itemName, 'Item name'),
            brand: this.optionalText(dto.brand),
            physicalSerialNumber: this.optionalText(dto.serialNumber),
            unit: dto.unit,
            quantity: this.quantityValue(dto.quantity),
            unitPrice: this.moneyValue(dto.unitPrice),
            displayOrder,
            createdBy: currentActor.id,
          }),
        );
        application.updatedAt = new Date();
        await manager.save(application);
      });
    } catch (error) {
      this.rethrowFriendlyItemSerialConflict(error);
    }
    return this.toApplicationResponse(
      await this.requireAccessibleApplication(applicationId, currentActor),
      currentActor,
    );
  }

  async updateItem(
    applicationId: string,
    itemId: string,
    actor: JwtPayload,
    dto: UpdatePmSuryaGharItemDto,
  ): Promise<PmSuryaGharApplicationResponse> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    try {
      await this.applications.manager.transaction(async (manager) => {
        const application = await this.lockAccessibleDraft(
          manager,
          applicationId,
          currentActor,
        );
        const repository = manager.getRepository(PmSuryaGharItem);
        const item = await repository.findOne({
          where: { id: itemId, applicationId },
        });
        if (!item) {
          throw new NotFoundException('PM Surya Ghar item not found.');
        }
        this.applyItemUpdate(item, dto);
        await repository.save(item);
        application.updatedAt = new Date();
        await manager.save(application);
      });
    } catch (error) {
      this.rethrowFriendlyItemSerialConflict(error);
    }
    return this.toApplicationResponse(
      await this.requireAccessibleApplication(applicationId, currentActor),
      currentActor,
    );
  }

  async removeItem(
    applicationId: string,
    itemId: string,
    actor: JwtPayload,
  ): Promise<PmSuryaGharApplicationResponse> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    await this.applications.manager.transaction(async (manager) => {
      const application = await this.lockAccessibleDraft(
        manager,
        applicationId,
        currentActor,
      );
      const repository = manager.getRepository(PmSuryaGharItem);
      const item = await repository.findOne({
        where: { id: itemId, applicationId },
      });
      if (!item) {
        throw new NotFoundException('PM Surya Ghar item not found.');
      }
      await repository.remove(item);
      const remainingItems = await repository.find({
        where: { applicationId },
        order: { displayOrder: 'ASC', createdAt: 'ASC' },
      });
      const resequencedItems = remainingItems.filter((remaining, index) => {
        if (remaining.displayOrder === index) return false;
        remaining.displayOrder = index;
        return true;
      });
      if (resequencedItems.length > 0) {
        await repository.save(resequencedItems);
      }
      application.updatedAt = new Date();
      await manager.save(application);
    });
    return this.toApplicationResponse(
      await this.requireAccessibleApplication(applicationId, currentActor),
      currentActor,
    );
  }

  async uploadDocument(
    applicationId: string,
    actor: JwtPayload,
    dto: UploadPmSuryaGharDocumentDto,
    file: UploadedPmSuryaGharPdf | undefined,
  ): Promise<PmSuryaGharDocumentResponse> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    const application = await this.requireManageableApplication(
      applicationId,
      currentActor,
    );
    this.assertDraft(application);
    const validation = await this.validatePdf(file);
    if (dto.pageCount !== validation.pageCount) {
      throw new BadRequestException(
        `The PDF contains ${validation.pageCount} page(s), but pageCount was ${dto.pageCount}.`,
      );
    }
    const existingDuplicate = await this.documents.findOne({
      where: { applicationId, sha256: validation.sha256 },
    });
    if (existingDuplicate) {
      throw new ConflictException(
        'This PDF is already attached to the application.',
      );
    }

    const upload = await this.cloudinaryService.uploadPmSuryaGharPdf(
      file!.buffer,
    );
    try {
      const saved = await this.applications.manager.transaction(
        async (manager) => {
          const lockedApplication = await this.lockAccessibleDraft(
            manager,
            applicationId,
            currentActor,
          );
          const repository = manager.getRepository(PmSuryaGharDocument);
          const existingDocuments = await repository.find({
            select: { fileSizeBytes: true },
            where: { applicationId },
          });
          if (existingDocuments.length >= MAX_DOCUMENTS_PER_APPLICATION) {
            throw new BadRequestException(
              `An application can contain up to ${MAX_DOCUMENTS_PER_APPLICATION} PDFs.`,
            );
          }
          const storedBytes = existingDocuments.reduce(
            (total, document) => total + document.fileSizeBytes,
            0,
          );
          if (
            storedBytes + file!.buffer.length >
            MAX_DOCUMENT_BYTES_PER_APPLICATION
          ) {
            throw new BadRequestException(
              'An application can contain up to 200 MiB of PDFs.',
            );
          }
          const document = await repository.save(
            repository.create({
              applicationId,
              documentType: dto.documentType,
              title: this.requiredText(dto.title, 'Document title'),
              originalFileName: this.safeFileName(file!.originalname),
              mimeType: 'application/pdf',
              fileSizeBytes: file!.buffer.length,
              pageCount: validation.pageCount,
              storagePublicId: upload.publicId,
              storageFormat: upload.format,
              sha256: validation.sha256,
              uploadedBy: currentActor.id,
            }),
          );
          lockedApplication.updatedAt = new Date();
          await manager.save(lockedApplication);
          return document;
        },
      );
      return this.toDocumentResponse(saved);
    } catch (error) {
      await this.cloudinaryService
        .removePmSuryaGharPdf(upload.publicId)
        .catch(() => undefined);
      if (this.isDuplicateDocumentError(error)) {
        throw new ConflictException(
          'This PDF is already attached to the application.',
        );
      }
      throw error;
    }
  }

  async createDownloadUrl(
    applicationId: string,
    documentId: string,
    actor: JwtPayload,
  ): Promise<PmSuryaGharDownloadResponse> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    await this.requireAccessibleApplication(applicationId, currentActor, false);
    const document = await this.documents.findOne({
      where: { id: documentId, applicationId },
    });
    if (!document) {
      throw new NotFoundException('PM Surya Ghar document not found.');
    }
    return this.cloudinaryService.createPmSuryaGharPdfDownload(
      document.storagePublicId,
      document.storageFormat,
    );
  }

  async submit(
    id: string,
    actor: JwtPayload,
  ): Promise<PmSuryaGharApplicationResponse> {
    const currentActor = await this.requireCurrentActor(actor.sub);
    await this.applications.manager.transaction(async (manager) => {
      const application = await this.lockAccessibleDraft(
        manager,
        id,
        currentActor,
      );
      const documentCount = await manager.count(PmSuryaGharDocument, {
        where: { applicationId: id },
      });
      if (documentCount === 0) {
        throw new BadRequestException(
          'Add at least one PDF before marking this application ready.',
        );
      }
      const itemCount = await manager.count(PmSuryaGharItem, {
        where: { applicationId: id },
      });
      if (itemCount === 0) {
        throw new BadRequestException(
          'Add at least one supplied item before marking this application ready.',
        );
      }
      application.status = PmSuryaGharApplicationStatus.READY;
      application.submittedAt = new Date();
      await manager.save(application);
    });
    return this.toApplicationResponse(
      await this.requireAccessibleApplication(id, currentActor),
      currentActor,
    );
  }

  private async requireCurrentActor(
    userId: string,
  ): Promise<CurrentPmSuryaGharActor> {
    const user = await this.users.findOne({
      select: { id: true, role: true, isActive: true },
      where: { id: userId },
    });
    if (
      !user?.isActive ||
      (user.role !== UserRole.ADMIN && user.role !== UserRole.STAFF)
    ) {
      throw new ForbiddenException(
        'PM Surya Ghar access requires an active administrator or staff account.',
      );
    }
    return { id: user.id, role: user.role };
  }

  private async requireAccessibleApplication(
    id: string,
    actor: CurrentPmSuryaGharActor,
    includeDetails = true,
  ): Promise<PmSuryaGharApplication> {
    const builder = this.applications
      .createQueryBuilder('application')
      .where('application.id = :id', { id });
    if (actor.role !== UserRole.ADMIN) {
      builder.andWhere(
        '(application.created_by = :createdBy OR application.staff_visible = TRUE)',
        { createdBy: actor.id },
      );
    }
    const application = await builder.getOne();
    if (!application) {
      throw new NotFoundException('PM Surya Ghar application not found.');
    }
    if (includeDetails) {
      await this.loadApplicationDetails([application]);
    }
    return application;
  }

  private async requireManageableApplication(
    id: string,
    actor: CurrentPmSuryaGharActor,
  ): Promise<PmSuryaGharApplication> {
    const builder = this.applications
      .createQueryBuilder('application')
      .where('application.id = :id', { id });
    if (actor.role !== UserRole.ADMIN) {
      builder.andWhere(
        'application.created_by = :createdBy AND application.staff_visible = FALSE',
        { createdBy: actor.id },
      );
    }
    const application = await builder.getOne();
    if (!application) {
      throw new NotFoundException('PM Surya Ghar application not found.');
    }
    return application;
  }

  private async loadApplicationDetails(
    applications: PmSuryaGharApplication[],
  ): Promise<void> {
    if (applications.length === 0) return;
    const applicationIds = applications.map((application) => application.id);
    const documents = await this.documents.find({
      where: { applicationId: In(applicationIds) },
      order: { createdAt: 'ASC' },
    });
    const items = await this.items.find({
      where: { applicationId: In(applicationIds) },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
    const applicationsById = new Map(
      applications.map((application) => {
        application.documents = [];
        application.items = [];
        return [application.id, application] as const;
      }),
    );
    for (const document of documents) {
      applicationsById.get(document.applicationId)?.documents.push(document);
    }
    for (const item of items) {
      applicationsById.get(item.applicationId)?.items.push(item);
    }
  }

  private async lockAccessibleDraft(
    manager: EntityManager,
    id: string,
    actor: CurrentPmSuryaGharActor,
  ): Promise<PmSuryaGharApplication> {
    const application = await manager.findOne(PmSuryaGharApplication, {
      where:
        actor.role === UserRole.ADMIN
          ? { id }
          : { id, createdBy: actor.id, staffVisible: false },
      lock: { mode: 'pessimistic_write' },
    });
    if (!application) {
      throw new NotFoundException('PM Surya Ghar application not found.');
    }
    this.assertDraft(application);
    return application;
  }

  /**
   * Customer details can be corrected by an administrator after internal
   * review. Staff can still change only their own drafts.
   */
  private async lockManageableApplication(
    manager: EntityManager,
    id: string,
    actor: CurrentPmSuryaGharActor,
  ): Promise<PmSuryaGharApplication> {
    const application = await manager.findOne(PmSuryaGharApplication, {
      where:
        actor.role === UserRole.ADMIN
          ? { id }
          : { id, createdBy: actor.id, staffVisible: false },
      lock: { mode: 'pessimistic_write' },
    });
    if (!application) {
      throw new NotFoundException('PM Surya Ghar application not found.');
    }
    if (
      application.status !== PmSuryaGharApplicationStatus.DRAFT &&
      actor.role !== UserRole.ADMIN
    ) {
      throw new ConflictException(
        'Only an administrator can correct customer details after an application is ready.',
      );
    }
    return application;
  }

  private assertDraft(application: PmSuryaGharApplication): void {
    if (application.status !== PmSuryaGharApplicationStatus.DRAFT) {
      throw new ConflictException(
        'Only a draft PM Surya Ghar application can be changed.',
      );
    }
  }

  private applyUpdate(
    application: PmSuryaGharApplication,
    dto: UpdatePmSuryaGharApplicationDto,
  ): void {
    if (dto.customerName !== undefined) {
      application.customerName = this.requiredText(
        dto.customerName,
        'Customer name',
      );
    }
    if (dto.customerPhone !== undefined) {
      application.customerPhone = this.requiredText(
        dto.customerPhone,
        'Customer phone',
      );
    }
    if (dto.alternatePhone !== undefined) {
      application.alternatePhone = this.optionalText(dto.alternatePhone);
    }
    if (dto.email !== undefined) {
      application.email = this.optionalText(dto.email)?.toLowerCase() ?? null;
    }
    if (dto.addressLine1 !== undefined) {
      application.addressLine1 = this.requiredText(
        dto.addressLine1,
        'Address line 1',
      );
    }
    if (dto.addressLine2 !== undefined) {
      application.addressLine2 = this.optionalText(dto.addressLine2);
    }
    if (dto.city !== undefined) {
      application.city = this.requiredText(dto.city, 'City');
    }
    if (dto.district !== undefined) {
      application.district = this.requiredText(dto.district, 'District');
    }
    if (dto.state !== undefined) {
      application.state = this.requiredText(dto.state, 'State');
    }
    if (dto.pincode !== undefined) {
      application.pincode = this.requiredText(dto.pincode, 'Pincode');
    }
    if (dto.electricityConsumerNumber !== undefined) {
      application.electricityConsumerNumber = this.optionalText(
        dto.electricityConsumerNumber,
      );
    }
    if (dto.electricityProvider !== undefined) {
      application.electricityProvider = this.optionalText(
        dto.electricityProvider,
      );
    }
    if (dto.sanctionedLoadKw !== undefined) {
      application.sanctionedLoadKw = this.loadValue(dto.sanctionedLoadKw);
    }
    if (dto.notes !== undefined) {
      application.notes = this.optionalText(dto.notes);
    }
  }

  private applyItemUpdate(
    item: PmSuryaGharItem,
    dto: UpdatePmSuryaGharItemDto,
  ): void {
    if (dto.itemName !== undefined) {
      item.itemName = this.requiredText(dto.itemName, 'Item name');
    }
    if (dto.brand !== undefined) {
      item.brand = this.optionalText(dto.brand);
    }
    if (dto.serialNumber !== undefined) {
      item.physicalSerialNumber = this.optionalText(dto.serialNumber);
    }
    if (dto.unit !== undefined) {
      item.unit = dto.unit;
    }
    if (dto.quantity !== undefined) {
      item.quantity = this.quantityValue(dto.quantity);
    }
    if (dto.unitPrice !== undefined) {
      item.unitPrice = this.moneyValue(dto.unitPrice);
    }
  }

  private async validatePdf(
    file: UploadedPmSuryaGharPdf | undefined,
  ): Promise<{ pageCount: number; sha256: string }> {
    if (!file?.buffer?.length || file.size <= 0) {
      throw new BadRequestException('Select a non-empty PDF.');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('The selected file must be a PDF.');
    }
    if (file.buffer.length > MAX_PDF_BYTES) {
      throw new BadRequestException('PDF files must be 20 MiB or smaller.');
    }
    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('The selected file is not a valid PDF.');
    }

    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(file.buffer, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
    } catch {
      throw new BadRequestException(
        'The PDF is damaged, encrypted, or unsupported.',
      );
    }
    if (pdf.isEncrypted) {
      throw new BadRequestException('Encrypted PDFs cannot be uploaded.');
    }
    this.assertPassivePdf(pdf);
    const pageCount = pdf.getPageCount();
    if (pageCount < 1 || pageCount > MAX_PDF_PAGES) {
      throw new BadRequestException(
        `PDF files must contain between 1 and ${MAX_PDF_PAGES} pages.`,
      );
    }
    return {
      pageCount,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  private assertPassivePdf(pdf: PDFDocument): void {
    const forbiddenCatalogKeys = [
      'OpenAction',
      'AA',
      'Names',
      'AcroForm',
      'Collection',
    ];
    const hasActiveCatalogEntry = forbiddenCatalogKeys.some((key) =>
      pdf.catalog.has(PDFName.of(key)),
    );
    const hasActivePageEntry = pdf
      .getPages()
      .some(
        (page) =>
          page.node.has(PDFName.of('Annots')) ||
          page.node.has(PDFName.of('AA')),
      );
    if (hasActiveCatalogEntry || hasActivePageEntry) {
      throw new BadRequestException(
        'Only passive image-style PDFs without forms, actions, annotations, or embedded content can be uploaded.',
      );
    }
  }

  private isDuplicateDocumentError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const value = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const code = value.code ?? value.driverError?.code;
    const constraint = value.constraint ?? value.driverError?.constraint;
    return code === '23505' && constraint === DUPLICATE_DOCUMENT_CONSTRAINT;
  }

  private rethrowFriendlyItemSerialConflict(error: unknown): never {
    if (
      this.isDatabaseConstraintError(error, DUPLICATE_ITEM_SERIAL_CONSTRAINT)
    ) {
      throw new ConflictException(
        'This serial number is already assigned to another item in the application.',
      );
    }
    throw error;
  }

  private isDatabaseConstraintError(
    error: unknown,
    expectedConstraint: string,
  ): boolean {
    if (!error || typeof error !== 'object') return false;
    const value = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const code = value.code ?? value.driverError?.code;
    const constraint = value.constraint ?? value.driverError?.constraint;
    return code === '23505' && constraint === expectedConstraint;
  }

  private toApplicationResponse(
    application: PmSuryaGharApplication,
    actor: CurrentPmSuryaGharActor,
  ): PmSuryaGharApplicationResponse {
    const canSeeAmounts = actor.role === UserRole.ADMIN;
    const items = [...(application.items ?? [])]
      .sort(
        (left, right) =>
          left.displayOrder - right.displayOrder ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .map((item) => this.toItemResponse(item, canSeeAmounts));
    return {
      id: application.id,
      createdBy: application.createdBy,
      isSharedWithStaff: application.staffVisible === true,
      canManage:
        actor.role === UserRole.ADMIN ||
        (application.createdBy === actor.id &&
          application.staffVisible !== true),
      customerName: application.customerName,
      customerPhone: application.customerPhone,
      alternatePhone: application.alternatePhone ?? null,
      email: application.email ?? null,
      addressLine1: application.addressLine1,
      addressLine2: application.addressLine2 ?? null,
      city: application.city,
      district: application.district,
      state: application.state,
      pincode: application.pincode,
      electricityConsumerNumber: application.electricityConsumerNumber ?? null,
      electricityProvider: application.electricityProvider ?? null,
      sanctionedLoadKw:
        application.sanctionedLoadKw == null
          ? null
          : Number(application.sanctionedLoadKw),
      notes: application.notes ?? null,
      status: application.status,
      submittedAt: application.submittedAt ?? null,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      documents: [...(application.documents ?? [])]
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
        )
        .map((document) => this.toDocumentResponse(document)),
      items,
      ...(canSeeAmounts
        ? {
            itemsGrandTotal: this.sumMoney(
              items.map((item) => item.lineTotal ?? '0.00'),
            ),
          }
        : {}),
    };
  }

  private toDocumentResponse(
    document: PmSuryaGharDocument,
  ): PmSuryaGharDocumentResponse {
    return {
      id: document.id,
      documentType: document.documentType,
      title: document.title,
      originalFileName: document.originalFileName,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
      pageCount: document.pageCount,
      createdAt: document.createdAt,
    };
  }

  private toItemResponse(
    item: PmSuryaGharItem,
    includeAmounts: boolean,
  ): PmSuryaGharItemResponse {
    return {
      id: item.id,
      itemName: item.itemName,
      brand: item.brand ?? null,
      serialNumber: item.physicalSerialNumber ?? null,
      unit: item.unit,
      quantity: this.fixedDecimal(item.quantity, 3),
      ...(includeAmounts
        ? {
            unitPrice: this.fixedDecimal(item.unitPrice, 2),
            lineTotal: this.fixedDecimal(item.lineTotal, 2),
          }
        : {}),
      displayOrder: item.displayOrder,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private requiredText(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required.`);
    }
    return value.trim();
  }

  private optionalText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return value.trim() || null;
  }

  private loadValue(value: number | null | undefined): string | null {
    return value == null ? null : value.toFixed(2);
  }

  private quantityValue(value: number): string {
    return value.toFixed(3);
  }

  private moneyValue(value: number): string {
    return value.toFixed(2);
  }

  private sumMoney(values: string[]): string {
    const cents = values.reduce(
      (total, value) => total + this.decimalToMinorUnits(value, 2),
      0n,
    );
    const whole = cents / 100n;
    const fraction = (cents % 100n).toString().padStart(2, '0');
    return `${whole}.${fraction}`;
  }

  private fixedDecimal(value: string, scale: number): string {
    const units = this.decimalToMinorUnits(value, scale);
    const factor = 10n ** BigInt(scale);
    const whole = units / factor;
    const fraction = (units % factor).toString().padStart(scale, '0');
    return `${whole}.${fraction}`;
  }

  private decimalToMinorUnits(value: string, scale: number): bigint {
    const normalized = String(value).trim();
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
      throw new Error(
        'Invalid non-negative decimal value returned by the database.',
      );
    }
    const [whole, fraction = ''] = normalized.split('.');
    const paddedFraction = fraction.padEnd(scale, '0');
    if (paddedFraction.length > scale) {
      throw new Error('Database decimal value exceeds its configured scale.');
    }
    return BigInt(whole) * 10n ** BigInt(scale) + BigInt(paddedFraction || '0');
  }

  private safeFileName(originalName: string): string {
    const baseName =
      originalName.split(/[\\/]/).pop()?.trim() || 'document.pdf';
    const safe = baseName
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 255);
    if (safe.toLowerCase().endsWith('.pdf')) return safe;
    return `${safe.slice(0, 251)}.pdf`;
  }
}
