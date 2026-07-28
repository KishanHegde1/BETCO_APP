import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import {
  Brackets,
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { UserRole } from '../common/constants/user-role.enum';
import { Dealer } from '../entities/dealer.entity';
import { User } from '../entities/user.entity';
import { AdminDealerOrdersQueryDto } from './dto/admin-dealer-orders-query.dto';
import { AdminDealersQueryDto } from './dto/admin-dealers-query.dto';
import { CreateAdminDealerDto } from './dto/create-admin-dealer.dto';
import { ResetAdminDealerPasswordDto } from './dto/reset-admin-dealer-password.dto';
import { UpdateAdminDealerDto } from './dto/update-admin-dealer.dto';
import { UpdateAdminDealerStatusDto } from './dto/update-admin-dealer-status.dto';
import {
  BusinessDateRange,
  currentMonthBusinessRange,
  inclusiveBusinessDateRange,
  previousMonthBusinessRange,
} from '../common/utils/business-date.util';
import { AdminDealersRepository } from '../repositories/admin-dealers.repository';
import { OrdersRepository } from '../repositories/orders.repository';

export interface UploadedDealerSpreadsheet {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface ValidatedDealerImportRow {
  rowNumber: number;
  username: string;
  phone: string;
  password: string;
  email: string | null;
  shopName: string | null;
  address: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  errors: string[];
}

interface DealerAccountInput {
  username: string;
  phone: string;
  password: string;
  email?: string | null;
  shopName?: string | null;
  address?: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface DealerImportPreviewRow {
  rowNumber: number;
  username: string;
  phone: string;
  email: string | null;
  shopName: string | null;
  address: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  valid: boolean;
  errors: string[];
}

export interface DealerImportPreview {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: DealerImportPreviewRow[];
}

export interface DealerImportResult extends DealerImportPreview {
  importedRows: number;
  failedRows: DealerImportPreviewRow[];
}

@Injectable()
export class AdminDealersService {
  constructor(
    private readonly dealersRepository: AdminDealersRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly dataSource: DataSource,
  ) {}

  findAll(query: AdminDealersQueryDto) {
    return this.dealersRepository.findPage(
      query,
      currentMonthBusinessRange(),
      previousMonthBusinessRange(),
    );
  }

  async create(dto: CreateAdminDealerDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Password and confirmation must match.');
    }
    const dealerId = await this.dataSource.transaction(async (manager) =>
      this.createDealerAccount(manager, {
        username: dto.username,
        phone: dto.phone,
        password: dto.password,
        email: dto.email,
        shopName: dto.shopName,
        address: dto.address,
        isActive: true,
        mustChangePassword: true,
      }),
    );
    return this.findOne(dealerId);
  }

  async update(dealerId: string, dto: UpdateAdminDealerDto) {
    const profile = await this.requireDealer(dealerId);
    const username = this.normalizeRequired(
      dto.username ?? profile.name,
      'Username',
    );
    const phone = this.normalizePhone(dto.phone ?? profile.contactNumber ?? '');
    await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const dealers = manager.getRepository(Dealer);
      const user = await users.findOneBy({ id: profile.userId });
      if (!user) throw new NotFoundException('Dealer user account not found.');
      const email =
        dto.email === undefined
          ? user.email
          : this.normalizeOptional(dto.email);
      await this.ensureUserFieldsAvailable(
        users,
        { username, phone, email },
        profile.userId,
      );
      await users.update(profile.userId, { username, phone, email });
      const dealer = await dealers.findOneBy({ id: dealerId });
      if (!dealer) throw new NotFoundException('Dealer not found.');
      const shopName =
        this.normalizeOptional(dto.shopName) ??
        dealer.shopName ??
        dealer.businessName;
      dealer.shopName = shopName;
      dealer.businessName = shopName;
      dealer.phone = phone;
      dealer.contactNumber = phone;
      dealer.address = this.normalizeOptional(dto.address) ?? dealer.address;
      await dealers.save(dealer);
    });
    return this.findOne(dealerId);
  }

  async updateStatus(dealerId: string, dto: UpdateAdminDealerStatusDto) {
    const profile = await this.requireDealer(dealerId);
    await this.dataSource.getRepository(User).update(profile.userId, {
      isActive: dto.isActive,
    });
    return this.findOne(dealerId);
  }

  async resetPassword(dealerId: string, dto: ResetAdminDealerPasswordDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Password and confirmation must match.');
    }
    const profile = await this.requireDealer(dealerId);
    await this.dataSource.getRepository(User).update(profile.userId, {
      passwordHash: await bcrypt.hash(dto.password, 12),
      mustChangePassword: true,
    });
    return { id: dealerId, mustChangePassword: true };
  }

  async validateImport(
    file: UploadedDealerSpreadsheet,
  ): Promise<DealerImportPreview> {
    return this.toImportPreview(
      await this.parseAndValidateImport(file),
      file.originalname,
    );
  }

  async import(file: UploadedDealerSpreadsheet): Promise<DealerImportResult> {
    const rows = await this.parseAndValidateImport(file);
    const preview = this.toImportPreview(rows, file.originalname);
    const validRows = rows.filter((row) => row.errors.length === 0);
    if (validRows.length > 0) {
      try {
        await this.dataSource.transaction(async (manager) => {
          for (const row of validRows) {
            await this.createDealerAccount(manager, row);
          }
        });
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new ConflictException(
            'A dealer was added or changed while this file was being imported. Validate the file again before retrying.',
          );
        }
        throw error;
      }
    }
    const failedRows = preview.rows.filter((row) => !row.valid);
    return {
      ...preview,
      importedRows: validRows.length,
      failedRows,
    };
  }

  async findOne(dealerId: string) {
    const details = await this.dealersRepository.findDetails(
      dealerId,
      currentMonthBusinessRange(),
      previousMonthBusinessRange(),
    );
    if (!details) {
      throw new NotFoundException('Dealer not found.');
    }
    return details;
  }

  async findOrders(dealerId: string, query: AdminDealerOrdersQueryDto) {
    await this.requireDealer(dealerId);
    const period = this.resolvePeriod(query);
    const page = await this.ordersRepository.findAdminPage({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      dealerId,
      fromDate: period?.fromDate,
      toDate: period?.toDate,
      sortOrder: 'DESC',
    });
    return {
      items: page.items,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems: page.total,
        totalPages: Math.ceil(page.total / query.limit),
      },
    };
  }

  async findAnalytics(dealerId: string, query: AdminDealerOrdersQueryDto) {
    await this.requireDealer(dealerId);
    const period = this.resolvePeriod(query);
    const analytics = await this.dealersRepository.findAnalytics(
      dealerId,
      period,
    );
    return {
      period: {
        type: query.period,
        fromDate: period?.fromDate ?? null,
        toDate: period?.toDate ?? null,
      },
      ...analytics,
    };
  }

  private async requireDealer(dealerId: string) {
    const dealer = await this.dealersRepository.findById(dealerId);
    if (!dealer) {
      throw new NotFoundException('Dealer not found.');
    }
    return dealer;
  }

  private async createDealerAccount(
    manager: EntityManager,
    input: DealerAccountInput,
  ): Promise<string> {
    const username = this.normalizeRequired(input.username, 'Username');
    const phone = this.normalizePhone(input.phone);
    const email = this.normalizeOptional(input.email);
    const users = manager.getRepository(User);
    await this.ensureUserFieldsAvailable(users, { username, phone, email });
    const user = await users.save(
      users.create({
        username,
        phone,
        email,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: UserRole.USER,
        isActive: input.isActive,
        mustChangePassword: input.mustChangePassword,
      }),
    );
    const shopName = this.normalizeOptional(input.shopName) ?? username;
    const dealer = await manager.getRepository(Dealer).save(
      manager.getRepository(Dealer).create({
        userId: user.id,
        businessName: shopName,
        shopName,
        phone,
        contactNumber: phone,
        address: this.normalizeOptional(input.address),
      }),
    );
    return dealer.id;
  }

  private async ensureUserFieldsAvailable(
    users: Repository<User>,
    values: { username: string; phone: string; email: string | null },
    excludedUserId?: string,
  ): Promise<void> {
    const existing = await users
      .createQueryBuilder('user')
      .where(
        new Brackets((builder) => {
          builder
            .where('LOWER(TRIM(user.username)) = LOWER(TRIM(:username))', {
              username: values.username,
            })
            .orWhere('user.phone = :phone', { phone: values.phone })
            .orWhere(
              values.email === null
                ? 'FALSE'
                : 'LOWER(TRIM(user.email)) = LOWER(TRIM(:email))',
              values.email === null ? {} : { email: values.email },
            );
        }),
      )
      .andWhere(excludedUserId ? 'user.id != :excludedUserId' : 'TRUE', {
        excludedUserId,
      })
      .getMany();
    if (existing.length > 0) {
      throw new ConflictException(
        'Username, phone number, or email address is already in use.',
      );
    }
  }

  private async parseAndValidateImport(
    file: UploadedDealerSpreadsheet,
  ): Promise<ValidatedDealerImportRow[]> {
    this.assertSpreadsheet(file);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as never);
    const sheet = workbook.worksheets[0];
    if (!sheet)
      throw new BadRequestException('The Excel file has no worksheet.');
    if (sheet.rowCount > 501) {
      throw new BadRequestException(
        'An Excel import can contain up to 500 rows.',
      );
    }
    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, columnNumber) => {
      const header = cell.text.trim().toLowerCase();
      if (header) columns.set(header, columnNumber);
    });
    for (const required of ['username', 'phone', 'password']) {
      if (!columns.has(required)) {
        throw new BadRequestException(
          `Missing required Excel column: ${required}.`,
        );
      }
    }
    const rows: ValidatedDealerImportRow[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const value = (header: string): string => {
        const column = columns.get(header);
        return column === undefined ? '' : row.getCell(column).text.trim();
      };
      const values = {
        username: value('username'),
        phone: value('phone'),
        password: value('password'),
        email: this.normalizeOptional(value('email')),
        shopName: this.normalizeOptional(value('shop_name')),
        address: this.normalizeOptional(value('address')),
        isActive: this.parseBoolean(value('is_active'), true),
        mustChangePassword: this.parseBoolean(
          value('must_change_password'),
          true,
        ),
      };
      if (Object.values(values).every((item) => item === '' || item === null)) {
        continue;
      }
      const errors: string[] = [];
      if (values.username.length < 3) errors.push('Username is required.');
      if (!/^\d{10,15}$/.test(values.phone))
        errors.push('Phone number must contain 10 to 15 digits.');
      if (values.password.length < 8)
        errors.push('Password must contain at least 8 characters.');
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        errors.push('Email address is invalid.');
      }
      if (values.isActive === null)
        errors.push('is_active must be true or false.');
      if (values.mustChangePassword === null) {
        errors.push('must_change_password must be true or false.');
      }
      rows.push({
        rowNumber,
        username: values.username,
        phone: values.phone,
        password: values.password,
        email: values.email,
        shopName: values.shopName,
        address: values.address,
        isActive: values.isActive ?? true,
        mustChangePassword: values.mustChangePassword ?? true,
        errors,
      });
    }
    if (rows.length === 0)
      throw new BadRequestException('The Excel file has no dealer rows.');
    this.addDuplicateRowErrors(rows);
    await this.addExistingAccountErrors(rows);
    return rows;
  }

  private async addExistingAccountErrors(rows: ValidatedDealerImportRow[]) {
    const usernames = [
      ...new Set(rows.map((row) => row.username.toLowerCase()).filter(Boolean)),
    ];
    const phones = [...new Set(rows.map((row) => row.phone).filter(Boolean))];
    const emails = [
      ...new Set(
        rows
          .map((row) => row.email?.toLowerCase())
          .filter((email): email is string => Boolean(email)),
      ),
    ];
    const users = this.dataSource.getRepository(User);
    const query = users
      .createQueryBuilder('user')
      .select(['user.username', 'user.phone', 'user.email']);
    query.where('FALSE');
    if (usernames.length > 0)
      query.orWhere('LOWER(TRIM(user.username)) IN (:...usernames)', {
        usernames,
      });
    if (phones.length > 0)
      query.orWhere('user.phone IN (:...phones)', { phones });
    if (emails.length > 0)
      query.orWhere('LOWER(TRIM(user.email)) IN (:...emails)', { emails });
    const existing = await query.getMany();
    const existingUsernames = new Set(
      existing.map((user) => user.username.trim().toLowerCase()),
    );
    const existingPhones = new Set(existing.map((user) => user.phone));
    const existingEmails = new Set(
      existing
        .map((user) => user.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    );
    for (const row of rows) {
      if (existingUsernames.has(row.username.toLowerCase()))
        row.errors.push('Username already exists.');
      if (existingPhones.has(row.phone))
        row.errors.push('Phone number already exists.');
      if (row.email && existingEmails.has(row.email.toLowerCase()))
        row.errors.push('Email address already exists.');
    }
  }

  private addDuplicateRowErrors(rows: ValidatedDealerImportRow[]): void {
    const seenUsernames = new Set<string>();
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();
    for (const row of rows) {
      const username = row.username.toLowerCase();
      if (username && seenUsernames.has(username))
        row.errors.push('Duplicate username in this file.');
      if (row.phone && seenPhones.has(row.phone))
        row.errors.push('Duplicate phone number in this file.');
      if (row.email && seenEmails.has(row.email.toLowerCase())) {
        row.errors.push('Duplicate email address in this file.');
      }
      seenUsernames.add(username);
      seenPhones.add(row.phone);
      if (row.email) seenEmails.add(row.email.toLowerCase());
    }
  }

  private toImportPreview(
    rows: ValidatedDealerImportRow[],
    fileName = '',
  ): DealerImportPreview {
    const previewRows = rows.map((row) => ({
      rowNumber: row.rowNumber,
      username: row.username,
      phone: row.phone,
      email: row.email,
      shopName: row.shopName,
      address: row.address,
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
      valid: row.errors.length === 0,
      errors: row.errors,
    }));
    return {
      fileName,
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.valid).length,
      invalidRows: previewRows.filter((row) => !row.valid).length,
      duplicateRows: previewRows.filter((row) =>
        row.errors.some((error) => error.startsWith('Duplicate')),
      ).length,
      rows: previewRows,
    };
  }

  private assertSpreadsheet(file: UploadedDealerSpreadsheet): void {
    if (!file?.buffer?.length)
      throw new BadRequestException('Select an Excel file to import.');
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Only .xlsx Excel files are supported.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Excel files must be 5 MB or smaller.');
    }
  }

  private parseBoolean(value: string, fallback: boolean): boolean | null {
    if (!value) return fallback;
    if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
    if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
    return null;
  }

  private normalizeRequired(value: string, field: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${field} is required.`);
    return normalized;
  }

  private normalizePhone(value: string): string {
    const normalized = value.trim();
    if (!/^\d{10,15}$/.test(normalized)) {
      throw new BadRequestException(
        'Phone number must contain 10 to 15 digits.',
      );
    }
    return normalized;
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as unknown;
    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      (driverError as { code?: unknown }).code === '23505'
    );
  }

  private resolvePeriod(
    query: AdminDealerOrdersQueryDto,
  ): BusinessDateRange | undefined {
    switch (query.period) {
      case 'all':
        return undefined;
      case 'this_month':
        return currentMonthBusinessRange();
      case 'last_month':
        return previousMonthBusinessRange();
      case 'custom': {
        if (!query.fromDate || !query.toDate) {
          throw new BadRequestException(
            'Both fromDate and toDate are required for a custom range.',
          );
        }
        if (query.fromDate > query.toDate) {
          throw new BadRequestException('From date cannot be after to date.');
        }
        const range = inclusiveBusinessDateRange(query.fromDate, query.toDate);
        const maximumRangeInDays = 366;
        const rangeInDays = Math.ceil(
          (range.toExclusive.getTime() - range.from.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (rangeInDays > maximumRangeInDays) {
          throw new BadRequestException(
            'A custom range can include up to 366 days.',
          );
        }
        return range;
      }
    }
  }
}
