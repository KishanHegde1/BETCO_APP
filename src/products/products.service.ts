import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { QueryFailedError } from 'typeorm';

import { Category } from '../entities/category.entity';
import { Product, ProductUnit } from '../entities/product.entity';
import {
  AdminProductRow,
  DealerProductRow,
  ProductsRepository,
} from '../repositories/products.repository';
import {
  AdminProductListQueryDto,
  CreateAdminProductDto,
  UpdateAdminProductDto,
} from './dto/admin-product.dto';

export interface AdminProductResponse extends AdminProductRow {
  unit: ProductUnit;
  category: { id: string; name: string };
}

export interface PaginatedProductsResponse {
  items: AdminProductResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export type DealerProductResponse = DealerProductRow;

export interface UploadedProductSpreadsheet {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface ValidatedProductImportRow {
  rowNumber: number;
  sku: string;
  name: string;
  categoryName: string;
  categoryId: string | null;
  description: string | null;
  imageUrl: string | null;
  unit: ProductUnit;
  displayOrder: number;
  isActive: boolean;
  errors: string[];
}

export interface ProductImportPreviewRow {
  rowNumber: number;
  sku: string;
  name: string;
  categoryName: string;
  unit: ProductUnit;
  isActive: boolean;
  valid: boolean;
  errors: string[];
}

export interface ProductImportPreview {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: ProductImportPreviewRow[];
}

export interface ProductImportResult extends ProductImportPreview {
  importedRows: number;
  failedRows: ProductImportPreviewRow[];
}

@Injectable()
export class ProductsService {
  constructor(readonly productsRepository: ProductsRepository) {}

  async findAll(): Promise<DealerProductResponse[]> {
    return this.productsRepository.findActiveCatalogue();
  }

  async findAllForAdmin(
    query: AdminProductListQueryDto,
  ): Promise<PaginatedProductsResponse> {
    const page = await this.productsRepository.findPage(query);
    return {
      items: page.items.map((product) => this.toResponse(product)),
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems: page.total,
        totalPages: Math.ceil(page.total / query.limit),
      },
    };
  }

  async findOneForAdmin(id: string): Promise<AdminProductResponse> {
    const product = await this.productsRepository.findAdminById(id);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return this.toResponse(product);
  }

  async createForAdmin(
    dto: CreateAdminProductDto,
  ): Promise<AdminProductResponse> {
    const category = await this.requireActiveCategory(dto.categoryId);
    const sku = dto.sku.trim().toUpperCase();
    await this.assertSkuAvailable(sku);
    const product = await this.productsRepository.save(
      this.productsRepository.repository.create({
        categoryId: category.id,
        name: dto.name.trim(),
        sku,
        description: this.normalizedNullable(dto.description),
        imageUrl: this.normalizedNullable(dto.imageUrl),
        unit: dto.unit,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      }),
    );
    return this.findOneForAdmin(product.id);
  }

  async validateImport(
    file: UploadedProductSpreadsheet,
  ): Promise<ProductImportPreview> {
    return this.toImportPreview(
      await this.parseAndValidateImport(file),
      file.originalname,
    );
  }

  async import(file: UploadedProductSpreadsheet): Promise<ProductImportResult> {
    const rows = await this.parseAndValidateImport(file);
    const preview = this.toImportPreview(rows, file.originalname);
    const validRows = rows.filter((row) => row.errors.length === 0);

    if (validRows.length > 0) {
      try {
        await this.productsRepository.repository.manager.transaction(
          async (manager) => {
            const products = manager.getRepository(Product);
            for (const row of validRows) {
              await products.save(
                products.create({
                  categoryId: row.categoryId!,
                  name: row.name,
                  sku: row.sku,
                  description: row.description,
                  imageUrl: row.imageUrl,
                  unit: row.unit,
                  displayOrder: row.displayOrder,
                  isActive: row.isActive,
                }),
              );
            }
          },
        );
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new ConflictException(
            'A product was added or changed while this file was being imported. Validate the file again before retrying.',
          );
        }
        throw error;
      }
    }

    return {
      ...preview,
      importedRows: validRows.length,
      failedRows: preview.rows.filter((row) => !row.valid),
    };
  }

  async updateForAdmin(
    id: string,
    dto: UpdateAdminProductDto,
  ): Promise<AdminProductResponse> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    if (dto.categoryId !== undefined) {
      product.categoryId = (
        await this.requireActiveCategory(dto.categoryId)
      ).id;
    }
    if (dto.sku !== undefined) {
      const sku = dto.sku.trim().toUpperCase();
      await this.assertSkuAvailable(sku, product.id);
      product.sku = sku;
    }
    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.description !== undefined) {
      product.description = this.normalizedNullable(dto.description);
    }
    if (dto.imageUrl !== undefined) {
      product.imageUrl = this.normalizedNullable(dto.imageUrl);
    }
    if (dto.unit !== undefined) product.unit = dto.unit;
    if (dto.displayOrder !== undefined) product.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) product.isActive = dto.isActive;
    await this.productsRepository.save(product);
    return this.findOneForAdmin(product.id);
  }

  async removeForAdmin(id: string): Promise<void> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    if (await this.productsRepository.isReferenced(id)) {
      throw new ConflictException(
        'This product is referenced by stock or orders and cannot be deleted. Deactivate it instead.',
      );
    }
    await this.productsRepository.remove(product);
  }

  private async requireActiveCategory(categoryId: string) {
    const category = await this.productsRepository.findCategoryById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    if (!category.isActive) {
      throw new ConflictException(
        'An inactive category cannot receive products.',
      );
    }
    return category;
  }

  private async assertSkuAvailable(sku: string, exceptId?: string) {
    const existing = await this.productsRepository.findBySkuInsensitive(sku);
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('A product with this SKU already exists.');
    }
  }

  private normalizedNullable(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private toResponse(product: AdminProductRow): AdminProductResponse {
    return {
      ...product,
      unit: product.unit as ProductUnit,
      category: { id: product.categoryId, name: product.categoryName },
    };
  }

  private async parseAndValidateImport(
    file: UploadedProductSpreadsheet,
  ): Promise<ValidatedProductImportRow[]> {
    this.assertSpreadsheet(file);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('The Excel file has no worksheet.');
    }
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
    for (const required of ['sku', 'name', 'category']) {
      if (!columns.has(required)) {
        throw new BadRequestException(
          `Missing required Excel column: ${required}.`,
        );
      }
    }

    const parsedRows: Omit<ValidatedProductImportRow, 'categoryId'>[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const value = (header: string): string => {
        const column = columns.get(header);
        return column === undefined ? '' : row.getCell(column).text.trim();
      };
      const raw = {
        sku: value('sku').toUpperCase(),
        name: value('name'),
        categoryName: value('category'),
        description: this.normalizedNullable(value('description')),
        imageUrl: this.normalizedNullable(value('image_url')),
        unit: value('unit').toUpperCase(),
        displayOrder: value('display_order'),
        isActive: value('is_active'),
      };
      if (Object.values(raw).every((item) => item === '' || item === null)) {
        continue;
      }

      const errors: string[] = [];
      if (!raw.sku || raw.sku.length > 100) {
        errors.push('SKU is required and can contain up to 100 characters.');
      }
      if (!raw.name || raw.name.length > 255) {
        errors.push(
          'Product name is required and can contain up to 255 characters.',
        );
      }
      if (!raw.categoryName || raw.categoryName.length > 120) {
        errors.push('Category is required.');
      }
      if (raw.description && raw.description.length > 2000) {
        errors.push('Description can contain up to 2000 characters.');
      }
      if (raw.imageUrl && !this.isHttpUrl(raw.imageUrl)) {
        errors.push('image_url must be a valid http or https URL.');
      }
      if (raw.imageUrl && raw.imageUrl.length > 2048) {
        errors.push('image_url can contain up to 2048 characters.');
      }
      const unit = this.parseUnit(raw.unit);
      if (!unit) errors.push('unit must be PIECE, SET, or BOX.');
      const displayOrder = this.parseNonNegativeInteger(raw.displayOrder, 0);
      if (displayOrder === null) {
        errors.push('display_order must be a whole number from 0 to 1000000.');
      }
      const isActive = this.parseBoolean(raw.isActive, true);
      if (isActive === null) errors.push('is_active must be true or false.');

      parsedRows.push({
        rowNumber,
        sku: raw.sku,
        name: raw.name,
        categoryName: raw.categoryName,
        description: raw.description,
        imageUrl: raw.imageUrl,
        unit: unit ?? ProductUnit.PIECE,
        displayOrder: displayOrder ?? 0,
        isActive: isActive ?? true,
        errors,
      });
    }
    if (parsedRows.length === 0) {
      throw new BadRequestException('The Excel file has no product rows.');
    }

    const categories = await this.productsRepository.repository.manager
      .getRepository(Category)
      .find();
    const categoriesByName = new Map(
      categories.map((category) => [
        category.name.trim().toLowerCase(),
        category,
      ]),
    );
    const rows = parsedRows.map((row) => {
      const category = categoriesByName.get(row.categoryName.toLowerCase());
      const errors = [...row.errors];
      if (!category && row.categoryName) {
        errors.push(`Category "${row.categoryName}" does not exist.`);
      } else if (category && !category.isActive) {
        errors.push(`Category "${category.name}" is inactive.`);
      }
      return {
        ...row,
        categoryId: category?.id ?? null,
        errors,
      };
    });
    this.addDuplicateRowErrors(rows);
    await this.addExistingSkuErrors(rows);
    return rows;
  }

  private async addExistingSkuErrors(
    rows: ValidatedProductImportRow[],
  ): Promise<void> {
    const skus = [...new Set(rows.map((row) => row.sku).filter(Boolean))];
    if (skus.length === 0) return;
    const existing = await this.productsRepository.repository
      .createQueryBuilder('product')
      .select('product.sku', 'sku')
      .where('LOWER(BTRIM(product.sku)) IN (:...skus)', {
        skus: skus.map((sku) => sku.toLowerCase()),
      })
      .getRawMany<{ sku: string }>();
    const existingSkus = new Set(
      existing.map((product) => product.sku.trim().toLowerCase()),
    );
    for (const row of rows) {
      if (existingSkus.has(row.sku.toLowerCase())) {
        row.errors.push('SKU already exists.');
      }
    }
  }

  private addDuplicateRowErrors(rows: ValidatedProductImportRow[]): void {
    const seenSkus = new Set<string>();
    for (const row of rows) {
      const sku = row.sku.toLowerCase();
      if (sku && seenSkus.has(sku)) {
        row.errors.push('Duplicate SKU in this file.');
      }
      seenSkus.add(sku);
    }
  }

  private toImportPreview(
    rows: ValidatedProductImportRow[],
    fileName = '',
  ): ProductImportPreview {
    const previewRows = rows.map((row) => ({
      rowNumber: row.rowNumber,
      sku: row.sku,
      name: row.name,
      categoryName: row.categoryName,
      unit: row.unit,
      isActive: row.isActive,
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

  private assertSpreadsheet(file: UploadedProductSpreadsheet): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Select an Excel file to import.');
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Only .xlsx Excel files are supported.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Excel files must be 5 MB or smaller.');
    }
  }

  private parseUnit(value: string): ProductUnit | null {
    if (!value) return ProductUnit.PIECE;
    return Object.values(ProductUnit).includes(value as ProductUnit)
      ? (value as ProductUnit)
      : null;
  }

  private parseNonNegativeInteger(
    value: string,
    fallback: number,
  ): number | null {
    if (!value) return fallback;
    if (!/^\d+$/.test(value)) return null;
    const number = Number(value);
    return number <= 1000000 ? number : null;
  }

  private parseBoolean(value: string, fallback: boolean): boolean | null {
    if (!value) return fallback;
    if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
    if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
    return null;
  }

  private isHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
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
}
