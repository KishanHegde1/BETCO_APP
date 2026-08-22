import { BadRequestException, ConflictException } from '@nestjs/common';
import { PDFDocument, PDFName } from 'pdf-lib';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
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
import { PmSuryaGharService } from './pm-surya-ghar.service';

describe('PmSuryaGharService', () => {
  const staff: JwtPayload = {
    sub: 'staff-1',
    username: 'staff_member',
    role: UserRole.STAFF,
  };
  const admin: JwtPayload = {
    sub: 'admin-1',
    username: 'administrator',
    role: UserRole.ADMIN,
  };
  const now = new Date('2026-08-16T08:00:00.000Z');
  const application = (
    overrides: Partial<PmSuryaGharApplication> = {},
  ): PmSuryaGharApplication => ({
    id: 'application-1',
    createdBy: staff.sub,
    staffVisible: false,
    customerName: 'Anil Kumar',
    customerPhone: '9876543210',
    alternatePhone: null,
    email: null,
    addressLine1: '1 Main Road',
    addressLine2: null,
    city: 'Bengaluru',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    pincode: '560001',
    electricityConsumerNumber: null,
    electricityProvider: null,
    sanctionedLoadKw: null,
    notes: null,
    status: PmSuryaGharApplicationStatus.DRAFT,
    submittedAt: null,
    createdAt: now,
    updatedAt: now,
    documents: [],
    items: [],
    ...overrides,
  });

  const suppliedItem = (
    overrides: Partial<PmSuryaGharItem> = {},
  ): PmSuryaGharItem => ({
    id: 'item-1',
    applicationId: 'application-1',
    itemName: 'Copper wire',
    brand: 'Betco',
    physicalSerialNumber: null,
    unit: PmSuryaGharItemUnit.METER,
    quantity: '15.000',
    unitPrice: '2.50',
    lineTotal: '37.50',
    displayOrder: 0,
    createdBy: staff.sub,
    createdAt: now,
    updatedAt: now,
    application: undefined as never,
    ...overrides,
  });

  const queryBuilder = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    getOne: jest.fn(),
    getMany: jest.fn(),
  };
  const documentRepository = {
    create:
      jest.fn<
        (value: Partial<PmSuryaGharDocument>) => Partial<PmSuryaGharDocument>
      >(),
    save: jest.fn<
      (value: Partial<PmSuryaGharDocument>) => Promise<PmSuryaGharDocument>
    >(),
    find: jest.fn<() => Promise<PmSuryaGharDocument[]>>(),
    findOne: jest.fn(),
  };
  const itemRepository = {
    create:
      jest.fn<(value: Partial<PmSuryaGharItem>) => Partial<PmSuryaGharItem>>(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
  };
  const transactionManager = {
    findOne: jest.fn(),
    getRepository: jest.fn(),
    save: jest.fn<
      (value: PmSuryaGharApplication) => Promise<PmSuryaGharApplication>
    >(),
    count: jest.fn(),
  };
  const applications = {
    create:
      jest.fn<
        (
          value: Partial<PmSuryaGharApplication>,
        ) => Partial<PmSuryaGharApplication>
      >(),
    save: jest.fn<
      (
        value: Partial<PmSuryaGharApplication>,
      ) => Promise<PmSuryaGharApplication>
    >(),
    createQueryBuilder: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const documents = { find: jest.fn(), findOne: jest.fn() };
  const items = { find: jest.fn() };
  const users = { findOne: jest.fn() };
  const cloudinary = {
    uploadPmSuryaGharPdf: jest.fn(),
    removePmSuryaGharPdf: jest.fn(),
    createPmSuryaGharPdfDownload: jest.fn(),
  };
  let lastCreatedDocument: Partial<PmSuryaGharDocument> | undefined;
  const service = new PmSuryaGharService(
    applications as never,
    documents as never,
    items as never,
    users as never,
    cloudinary as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    for (const method of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
    ] as const) {
      queryBuilder[method].mockReturnValue(queryBuilder);
    }
    applications.createQueryBuilder.mockReturnValue(queryBuilder);
    users.findOne.mockResolvedValue({
      id: staff.sub,
      role: UserRole.STAFF,
      isActive: true,
    });
    applications.create.mockImplementation(
      (value: Partial<PmSuryaGharApplication>) => value,
    );
    applications.save.mockImplementation(
      (value: Partial<PmSuryaGharApplication>) =>
        Promise.resolve({
          id: 'application-1',
          createdAt: now,
          updatedAt: now,
          ...value,
        } as PmSuryaGharApplication),
    );
    applications.manager.transaction.mockImplementation(
      (work: (manager: typeof transactionManager) => Promise<unknown>) =>
        work(transactionManager),
    );
    transactionManager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === PmSuryaGharDocument) return documentRepository;
      if (entity === PmSuryaGharItem) return itemRepository;
      throw new Error('Unexpected repository request');
    });
    transactionManager.save.mockImplementation(
      (value: PmSuryaGharApplication) => Promise.resolve(value),
    );
    lastCreatedDocument = undefined;
    documentRepository.create.mockImplementation(
      (value: Partial<PmSuryaGharDocument>) => {
        lastCreatedDocument = value;
        return value;
      },
    );
    documentRepository.save.mockImplementation(
      (value: Partial<PmSuryaGharDocument>) =>
        Promise.resolve({
          id: 'document-1',
          createdAt: now,
          updatedAt: now,
          ...value,
        } as PmSuryaGharDocument),
    );
    documentRepository.find.mockResolvedValue([]);
    itemRepository.create.mockImplementation(
      (value: Partial<PmSuryaGharItem>) => value,
    );
    itemRepository.save.mockImplementation((value: PmSuryaGharItem) =>
      Promise.resolve(value),
    );
    itemRepository.find.mockResolvedValue([]);
    itemRepository.count.mockResolvedValue(0);
    itemRepository.findOne.mockResolvedValue(null);
    itemRepository.remove.mockResolvedValue(undefined);
    documents.find.mockResolvedValue([]);
    items.find.mockResolvedValue([]);
    cloudinary.removePmSuryaGharPdf.mockResolvedValue(undefined);
  });

  it('creates a draft owned by the authenticated staff member', async () => {
    const created = await service.create(staff, {
      customerName: ' Anil Kumar ',
      customerPhone: '9876543210',
      addressLine1: ' 1 Main Road ',
      city: 'Bengaluru',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      pincode: '560001',
    });

    expect(applications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: staff.sub,
        staffVisible: false,
        customerName: 'Anil Kumar',
        status: PmSuryaGharApplicationStatus.DRAFT,
      }),
    );
    expect(created).toMatchObject({
      id: 'application-1',
      createdBy: staff.sub,
      isSharedWithStaff: false,
      canManage: true,
      status: PmSuryaGharApplicationStatus.DRAFT,
      documents: [],
      items: [],
    });
  });

  it('lists a STAFF member own records and staff-visible ADMIN records only', async () => {
    const own = application();
    const sharedAdmin = application({
      id: 'admin-application',
      createdBy: admin.sub,
      staffVisible: true,
    });
    queryBuilder.getMany.mockResolvedValue([own, sharedAdmin]);

    const result = await service.findAll(staff);

    expect(queryBuilder.where).toHaveBeenCalledWith(
      '(application.created_by = :createdBy OR application.staff_visible = TRUE)',
      { createdBy: staff.sub },
    );
    expect(queryBuilder.leftJoinAndSelect).not.toHaveBeenCalled();
    expect(documents.find).toHaveBeenCalledTimes(1);
    expect(items.find).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({
        id: own.id,
        isSharedWithStaff: false,
        canManage: true,
      }),
      expect.objectContaining({
        id: sharedAdmin.id,
        isSharedWithStaff: true,
        canManage: false,
      }),
    ]);
  });

  it('marks an ADMIN-created draft visible to staff', async () => {
    users.findOne.mockResolvedValueOnce({
      id: admin.sub,
      role: UserRole.ADMIN,
      isActive: true,
    });

    const created = await service.create(admin, {
      customerName: 'Admin customer',
      customerPhone: '9876543210',
      addressLine1: '1 Main Road',
      city: 'Bengaluru',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      pincode: '560001',
    });

    expect(applications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: admin.sub,
        staffVisible: true,
      }),
    );
    expect(created).toMatchObject({
      createdBy: admin.sub,
      isSharedWithStaff: true,
      canManage: true,
    });
  });

  it('allows an ADMIN to list all applications without an owner predicate', async () => {
    queryBuilder.getMany.mockResolvedValue([]);
    users.findOne.mockResolvedValueOnce({
      id: 'admin-1',
      role: UserRole.ADMIN,
      isActive: true,
    });

    await service.findAll(admin);

    expect(queryBuilder.where).not.toHaveBeenCalled();
  });

  it('lets STAFF read full shared ADMIN details and reports them read-only', async () => {
    const sharedAdmin = application({
      id: 'admin-application',
      createdBy: admin.sub,
      staffVisible: true,
      documents: [],
      items: [suppliedItem()],
    });
    queryBuilder.getOne.mockResolvedValue(sharedAdmin);
    items.find.mockResolvedValue([
      suppliedItem({ applicationId: sharedAdmin.id }),
    ]);

    const result = await service.findOne(sharedAdmin.id, staff);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(application.created_by = :createdBy OR application.staff_visible = TRUE)',
      { createdBy: staff.sub },
    );
    expect(documents.find).toHaveBeenCalledTimes(1);
    expect(items.find).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      id: sharedAdmin.id,
      isSharedWithStaff: true,
      canManage: false,
    });
    expect(result).not.toHaveProperty('itemsGrandTotal');
    expect(result.items[0]).not.toHaveProperty('unitPrice');
    expect(result.items[0]).not.toHaveProperty('lineTotal');
  });

  it('does not expose another STAFF member private application or details', async () => {
    queryBuilder.getOne.mockResolvedValue(null);

    await expect(
      service.findOne('other-staff-application', staff),
    ).rejects.toThrow('PM Surya Ghar application not found.');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(application.created_by = :createdBy OR application.staff_visible = TRUE)',
      { createdBy: staff.sub },
    );
    expect(documents.find).not.toHaveBeenCalled();
    expect(items.find).not.toHaveBeenCalled();
  });

  it('lets STAFF generate a secure download for a shared ADMIN document', async () => {
    const sharedAdmin = application({
      id: 'admin-application',
      createdBy: admin.sub,
      staffVisible: true,
    });
    queryBuilder.getOne.mockResolvedValue(sharedAdmin);
    documents.findOne.mockResolvedValue({
      id: 'document-1',
      applicationId: sharedAdmin.id,
      storagePublicId: 'betco/pm-surya-ghar/documents/shared.pdf',
      storageFormat: 'pdf',
    });
    const download = {
      url: 'https://example.test/signed.pdf',
      expiresAt: new Date('2026-08-16T08:05:00.000Z'),
    };
    cloudinary.createPmSuryaGharPdfDownload.mockReturnValue(download);

    await expect(
      service.createDownloadUrl(sharedAdmin.id, 'document-1', staff),
    ).resolves.toEqual(download);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(application.created_by = :createdBy OR application.staff_visible = TRUE)',
      { createdBy: staff.sub },
    );
  });

  it('keeps every shared ADMIN application mutation owner-only for STAFF', async () => {
    const sharedAdmin = application({
      id: 'admin-application',
      createdBy: admin.sub,
      staffVisible: true,
    });
    transactionManager.findOne.mockResolvedValue(null);

    await expect(
      service.update(sharedAdmin.id, staff, { notes: 'Not allowed' }),
    ).rejects.toThrow('PM Surya Ghar application not found.');
    await expect(
      service.createItem(sharedAdmin.id, staff, {
        itemName: 'Inverter',
        unit: PmSuryaGharItemUnit.PIECE,
        quantity: 1,
        unitPrice: 100,
      }),
    ).rejects.toThrow('PM Surya Ghar application not found.');
    await expect(
      service.updateItem(sharedAdmin.id, 'item-1', staff, {
        itemName: 'Changed',
      }),
    ).rejects.toThrow('PM Surya Ghar application not found.');
    await expect(
      service.removeItem(sharedAdmin.id, 'item-1', staff),
    ).rejects.toThrow('PM Surya Ghar application not found.');
    await expect(service.submit(sharedAdmin.id, staff)).rejects.toThrow(
      'PM Surya Ghar application not found.',
    );

    expect(transactionManager.findOne).toHaveBeenCalledWith(
      PmSuryaGharApplication,
      expect.objectContaining({
        where: {
          id: sharedAdmin.id,
          createdBy: staff.sub,
          staffVisible: false,
        },
      }),
    );
    expect(itemRepository.save).not.toHaveBeenCalled();
    expect(itemRepository.remove).not.toHaveBeenCalled();
    expect(transactionManager.count).not.toHaveBeenCalled();
  });

  it('rejects a shared upload before PDF validation or Cloudinary side effects', async () => {
    queryBuilder.getOne.mockResolvedValue(null);

    await expect(
      service.uploadDocument(
        'admin-application',
        staff,
        {
          documentType: PmSuryaGharDocumentType.OTHER,
          title: 'Not allowed',
          pageCount: 1,
        },
        undefined,
      ),
    ).rejects.toThrow('PM Surya Ghar application not found.');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'application.created_by = :createdBy AND application.staff_visible = FALSE',
      { createdBy: staff.sub },
    );
    expect(cloudinary.uploadPmSuryaGharPdf).not.toHaveBeenCalled();
  });

  it('allows an ADMIN to mutate a shared draft regardless of ownership', async () => {
    const sharedAdmin = application({
      id: 'admin-application',
      createdBy: 'another-admin',
      staffVisible: true,
    });
    users.findOne.mockResolvedValueOnce({
      id: admin.sub,
      role: UserRole.ADMIN,
      isActive: true,
    });
    transactionManager.findOne.mockResolvedValue(sharedAdmin);
    queryBuilder.getOne.mockResolvedValue(sharedAdmin);

    const result = await service.update(sharedAdmin.id, admin, {
      notes: 'Administrator update',
    });

    expect(transactionManager.findOne).toHaveBeenCalledWith(
      PmSuryaGharApplication,
      expect.objectContaining({ where: { id: sharedAdmin.id } }),
    );
    expect(sharedAdmin.notes).toBe('Administrator update');
    expect(result).toMatchObject({ canManage: true, isSharedWithStaff: true });
  });

  it('keeps an ADMIN-created record read-only if its creator later becomes STAFF', async () => {
    const formerAdminRecord = application({
      id: 'former-admin-application',
      createdBy: staff.sub,
      staffVisible: true,
    });
    queryBuilder.getOne.mockResolvedValue(formerAdminRecord);

    const readable = await service.findOne(formerAdminRecord.id, staff);
    expect(readable).toMatchObject({
      isSharedWithStaff: true,
      canManage: false,
    });

    transactionManager.findOne.mockResolvedValue(null);
    await expect(
      service.update(formerAdminRecord.id, staff, { notes: 'Not allowed' }),
    ).rejects.toThrow('PM Surya Ghar application not found.');
    expect(transactionManager.findOne).toHaveBeenLastCalledWith(
      PmSuryaGharApplication,
      expect.objectContaining({
        where: {
          id: formerAdminRecord.id,
          createdBy: staff.sub,
          staffVisible: false,
        },
      }),
    );
  });

  it('decodes the PDF, verifies the real page count, and returns no storage key', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const buffer = Buffer.from(await pdf.save());
    const draft = application();
    queryBuilder.getOne.mockResolvedValue(draft);
    transactionManager.findOne.mockResolvedValue(draft);
    cloudinary.uploadPmSuryaGharPdf.mockResolvedValue({
      publicId: 'betco/pm-surya-ghar/documents/private-1',
      format: 'pdf',
      bytes: buffer.length,
    });

    const result = await service.uploadDocument(
      draft.id,
      staff,
      {
        documentType: PmSuryaGharDocumentType.ELECTRICITY_BILL,
        title: 'Electricity bill',
        pageCount: 2,
      },
      {
        originalname: 'bill.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      },
    );

    expect(result).toMatchObject({
      id: 'document-1',
      pageCount: 2,
      fileSizeBytes: buffer.length,
    });
    expect(result).not.toHaveProperty('storagePublicId');
    expect(lastCreatedDocument?.storagePublicId).toBe(
      'betco/pm-surya-ghar/documents/private-1',
    );
    expect(lastCreatedDocument?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a false client page count before uploading anything', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const buffer = Buffer.from(await pdf.save());
    queryBuilder.getOne.mockResolvedValue(application());

    await expect(
      service.uploadDocument(
        'application-1',
        staff,
        {
          documentType: PmSuryaGharDocumentType.OTHER,
          title: 'Other document',
          pageCount: 2,
        },
        {
          originalname: 'other.pdf',
          mimetype: 'application/pdf',
          size: buffer.length,
          buffer,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cloudinary.uploadPmSuryaGharPdf).not.toHaveBeenCalled();
  });

  it('does not allow a READY application to be changed', async () => {
    const ready = application();
    ready.status = PmSuryaGharApplicationStatus.READY;
    transactionManager.findOne.mockResolvedValue(ready);

    await expect(
      service.update(ready.id, staff, { notes: 'Changed later' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows an ADMIN to correct customer details after an application is ready', async () => {
    const ready = application({
      status: PmSuryaGharApplicationStatus.READY,
      createdBy: staff.sub,
    });
    users.findOne.mockResolvedValueOnce({
      id: admin.sub,
      role: UserRole.ADMIN,
      isActive: true,
    });
    transactionManager.findOne.mockResolvedValue(ready);
    queryBuilder.getOne.mockResolvedValue(ready);

    const result = await service.update(ready.id, admin, {
      customerName: 'Corrected customer',
      notes: 'Corrected after review',
    });

    expect(ready.status).toBe(PmSuryaGharApplicationStatus.READY);
    expect(ready.customerName).toBe('Corrected customer');
    expect(ready.notes).toBe('Corrected after review');
    expect(result.canManage).toBe(true);
  });

  it('adds an item under the owner lock without accepting a client total', async () => {
    const draft = application();
    const item = suppliedItem();
    transactionManager.findOne.mockResolvedValue(draft);
    queryBuilder.getOne.mockResolvedValue(draft);
    items.find.mockResolvedValue([item]);

    const result = await service.createItem(draft.id, staff, {
      itemName: ' Copper wire ',
      brand: ' Betco ',
      serialNumber: ' WIRE-1 ',
      unit: PmSuryaGharItemUnit.METER,
      quantity: 15,
      unitPrice: 2.5,
    });

    expect(transactionManager.findOne).toHaveBeenCalledWith(
      PmSuryaGharApplication,
      expect.objectContaining({
        where: { id: draft.id, createdBy: staff.sub, staffVisible: false },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(itemRepository.create).toHaveBeenCalledWith({
      applicationId: draft.id,
      itemName: 'Copper wire',
      brand: 'Betco',
      physicalSerialNumber: 'WIRE-1',
      unit: PmSuryaGharItemUnit.METER,
      quantity: '15.000',
      unitPrice: '2.50',
      displayOrder: 0,
      createdBy: staff.sub,
    });
    expect(result.items).toEqual([
      expect.objectContaining({ quantity: '15.000' }),
    ]);
    expect(result.items[0]).not.toHaveProperty('unitPrice');
    expect(result.items[0]).not.toHaveProperty('lineTotal');
    expect(result).not.toHaveProperty('itemsGrandTotal');
  });

  it('returns fixed-scale item decimals and sums paise without floating-point loss', async () => {
    const draft = application();
    draft.items = [
      suppliedItem({
        id: 'item-2',
        quantity: '1',
        unitPrice: '0.10',
        lineTotal: '0.10',
        displayOrder: 1,
      }),
      suppliedItem({
        id: 'item-1',
        quantity: '2.5',
        unitPrice: '0.08',
        lineTotal: '0.20',
        displayOrder: 0,
      }),
    ];
    queryBuilder.getOne.mockResolvedValue(draft);
    items.find.mockResolvedValue(draft.items);
    users.findOne.mockResolvedValueOnce({
      id: admin.sub,
      role: UserRole.ADMIN,
      isActive: true,
    });

    const result = await service.findOne(draft.id, admin);

    expect(result.items.map((item) => item.id)).toEqual(['item-1', 'item-2']);
    expect(result.items[0]).toMatchObject({
      quantity: '2.500',
      unitPrice: '0.08',
      lineTotal: '0.20',
    });
    expect(result.itemsGrandTotal).toBe('0.30');
  });

  it('normalizes blank optional item fields to null on update', async () => {
    const draft = application();
    const item = suppliedItem({
      brand: 'Old brand',
      physicalSerialNumber: 'OLD-1',
    });
    transactionManager.findOne.mockResolvedValue(draft);
    itemRepository.findOne.mockResolvedValue(item);
    queryBuilder.getOne.mockResolvedValue(draft);
    items.find.mockResolvedValue([item]);

    await service.updateItem(draft.id, item.id, staff, {
      brand: '   ',
      serialNumber: '',
    });

    expect(item.brand).toBeNull();
    expect(item.physicalSerialNumber).toBeNull();
  });

  it('maps duplicate physical serial numbers to a friendly conflict', async () => {
    transactionManager.findOne.mockResolvedValue(application());
    itemRepository.save.mockRejectedValueOnce({
      code: '23505',
      constraint: 'pm_surya_ghar_items_application_serial_unique',
    });

    await expect(
      service.createItem('application-1', staff, {
        itemName: 'Inverter',
        serialNumber: 'INV-1',
        unit: PmSuryaGharItemUnit.PIECE,
        quantity: 1,
        unitPrice: 100,
      }),
    ).rejects.toThrow(
      'This serial number is already assigned to another item in the application.',
    );
  });

  it('limits the number of supplied items in one application', async () => {
    transactionManager.findOne.mockResolvedValue(application());
    itemRepository.count.mockResolvedValue(250);

    await expect(
      service.createItem('application-1', staff, {
        itemName: 'Additional item',
        unit: PmSuryaGharItemUnit.PIECE,
        quantity: 1,
        unitPrice: 10,
      }),
    ).rejects.toThrow('An application can contain up to 250 supplied items.');
    expect(itemRepository.save).not.toHaveBeenCalled();
  });

  it('resequences remaining item display orders after deletion', async () => {
    const draft = application();
    const removed = suppliedItem({ id: 'item-2', displayOrder: 1 });
    const first = suppliedItem({ id: 'item-1', displayOrder: 0 });
    const third = suppliedItem({ id: 'item-3', displayOrder: 2 });
    transactionManager.findOne.mockResolvedValue(draft);
    itemRepository.findOne.mockResolvedValue(removed);
    itemRepository.find.mockResolvedValue([first, third]);
    queryBuilder.getOne.mockResolvedValue(draft);
    items.find.mockResolvedValue([first, { ...third, displayOrder: 1 }]);

    const result = await service.removeItem(draft.id, removed.id, staff);

    expect(itemRepository.remove).toHaveBeenCalledWith(removed);
    expect(itemRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'item-3', displayOrder: 1 }),
    ]);
    expect(result.items.map((item) => item.displayOrder)).toEqual([0, 1]);
  });

  it('does not mark a draft ready until at least one PDF exists', async () => {
    transactionManager.findOne.mockResolvedValue(application());
    transactionManager.count.mockResolvedValue(0);

    await expect(service.submit('application-1', staff)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not mark a draft ready until at least one supplied item exists', async () => {
    transactionManager.findOne.mockResolvedValue(application());
    transactionManager.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(service.submit('application-1', staff)).rejects.toThrow(
      'Add at least one supplied item before marking this application ready.',
    );
  });

  it('rejects a deactivated or demoted account even when its JWT role is stale', async () => {
    users.findOne.mockResolvedValueOnce({
      id: staff.sub,
      role: UserRole.USER,
      isActive: true,
    });

    await expect(service.findAll(staff)).rejects.toThrow(
      'PM Surya Ghar access requires an active administrator or staff account.',
    );
    expect(applications.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rejects PDFs that contain automatic actions', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.obj({}));
    const buffer = Buffer.from(await pdf.save());
    queryBuilder.getOne.mockResolvedValue(application());

    await expect(
      service.uploadDocument(
        'application-1',
        staff,
        {
          documentType: PmSuryaGharDocumentType.OTHER,
          title: 'Active PDF',
          pageCount: 1,
        },
        {
          originalname: 'active.pdf',
          mimetype: 'application/pdf',
          size: buffer.length,
          buffer,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cloudinary.uploadPmSuryaGharPdf).not.toHaveBeenCalled();
  });

  it('cleans up the private upload when the application document cap is reached', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const buffer = Buffer.from(await pdf.save());
    const draft = application();
    queryBuilder.getOne.mockResolvedValue(draft);
    transactionManager.findOne.mockResolvedValue(draft);
    documentRepository.find.mockResolvedValue(
      Array.from(
        { length: 25 },
        (_, index) =>
          ({
            id: `document-${index}`,
            fileSizeBytes: 100,
          }) as PmSuryaGharDocument,
      ),
    );
    cloudinary.uploadPmSuryaGharPdf.mockResolvedValue({
      publicId: 'betco/pm-surya-ghar/documents/over-limit',
      format: 'pdf',
      bytes: buffer.length,
    });

    await expect(
      service.uploadDocument(
        draft.id,
        staff,
        {
          documentType: PmSuryaGharDocumentType.OTHER,
          title: 'One too many',
          pageCount: 1,
        },
        {
          originalname: 'limit.pdf',
          mimetype: 'application/pdf',
          size: buffer.length,
          buffer,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cloudinary.removePmSuryaGharPdf).toHaveBeenCalledWith(
      'betco/pm-surya-ghar/documents/over-limit',
    );
  });
});
