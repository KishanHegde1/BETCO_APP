import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import pdfParse from 'pdf-parse';
import { EntityManager, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import {
  PriceListItem,
  PriceListItemMatchStatus,
} from '../entities/price-list-item.entity';
import { PriceList } from '../entities/price-list.entity';
import { Product } from '../entities/product.entity';
import {
  ImportPriceListDto,
  PreviewPriceListDto,
  PriceListItemInputDto,
} from './dto/price-list.dto';
import { normalizeModelName } from './model-name-normalizer';

export type PriceListPreviewStatus =
  'MATCHED' | 'UNMATCHED' | 'PRICE_CHANGED' | 'UNCHANGED';

export interface PriceListResponse {
  id: string;
  name: string;
  supplier: string | null;
  effectiveDate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  matchedCount: number;
  unmatchedCount: number;
  totalItems: number;
}

export interface PriceListItemResponse {
  id: string;
  productId: string | null;
  productName: string | null;
  modelName: string;
  normalizedModelName: string;
  netEffectivePrice: string | null;
  gstRate: string | null;
  gstAmount: string | null;
  gstIncludedPrice: string;
  mrp: string | null;
  matchStatus: PriceListItemMatchStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceListDetailResponse extends PriceListResponse {
  items: PriceListItemResponse[];
}

export interface PriceListPreviewRow {
  rowNumber: number;
  modelName: string;
  normalizedModelName: string;
  productId: string | null;
  productName: string | null;
  oldGstIncludedPrice: string | null;
  gstIncludedPrice: string;
  matchStatus: PriceListItemMatchStatus;
  status: PriceListPreviewStatus;
}

export interface PriceListPreviewResponse {
  name: string;
  supplier: string | null;
  effectiveDate: string;
  matchedCount: number;
  unmatchedCount: number;
  priceChangedCount: number;
  unchangedCount: number;
  rows: PriceListPreviewRow[];
}

export interface UploadedPriceListPdf {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface ExtractedPriceListPdfRow {
  rowNumber: number;
  modelName: string;
  gstIncludedPrice: number;
}

export interface PriceListPdfExtractionResponse {
  fileName: string;
  pageCount: number;
  rows: ExtractedPriceListPdfRow[];
  warnings: string[];
}

interface PreparedPriceListRow {
  input: PriceListItemInputDto;
  rowNumber: number;
  modelName: string;
  normalizedModelName: string;
}

interface ProductMatch {
  id: string;
  name: string;
}

const MAX_PRICE_LIST_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PRICE_LIST_PDF_PAGES = 50;

@Injectable()
export class PriceListsService {
  constructor(
    @InjectRepository(PriceList)
    private readonly priceLists: Repository<PriceList>,
    @InjectRepository(PriceListItem)
    private readonly priceListItems: Repository<PriceListItem>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  async findAll(): Promise<PriceListResponse[]> {
    const rows = await this.priceLists
      .createQueryBuilder('priceList')
      .leftJoin(PriceListItem, 'item', 'item.price_list_id = priceList.id')
      .select([
        'priceList.id AS "id"',
        'priceList.name AS "name"',
        'priceList.supplier AS "supplier"',
        'priceList.effective_date AS "effectiveDate"',
        'priceList.is_active AS "isActive"',
        'priceList.created_at AS "createdAt"',
        'priceList.updated_at AS "updatedAt"',
        'COUNT(item.id) AS "totalItems"',
        `COUNT(item.id) FILTER (WHERE item.match_status = '${PriceListItemMatchStatus.MATCHED}') AS "matchedCount"`,
        `COUNT(item.id) FILTER (WHERE item.match_status = '${PriceListItemMatchStatus.UNMATCHED}') AS "unmatchedCount"`,
      ])
      .groupBy('priceList.id')
      .orderBy('priceList.is_active', 'DESC')
      .addOrderBy('priceList.effective_date', 'DESC')
      .addOrderBy('priceList.created_at', 'DESC')
      .getRawMany<{
        id: string;
        name: string;
        supplier: string | null;
        effectiveDate: string;
        isActive: boolean | string;
        createdAt: Date;
        updatedAt: Date;
        totalItems: string;
        matchedCount: string;
        unmatchedCount: string;
      }>();
    return rows.map((row) => this.toListResponse(row));
  }

  async findActive(): Promise<PriceListDetailResponse | null> {
    const active = await this.priceLists.findOne({
      where: { isActive: true },
    });
    return active ? this.findOne(active.id) : null;
  }

  async findOne(id: string): Promise<PriceListDetailResponse> {
    const list = await this.priceLists.findOneBy({ id });
    if (!list) throw new NotFoundException('Price List not found.');
    const [summary] = await this.summaryForIds([id]);
    const rows = await this.priceListItems
      .createQueryBuilder('item')
      .leftJoin(Product, 'product', 'product.id = item.product_id')
      .where('item.price_list_id = :id', { id })
      .select([
        'item.id AS "id"',
        'item.product_id AS "productId"',
        'product.name AS "productName"',
        'item.model_name AS "modelName"',
        'item.normalized_model_name AS "normalizedModelName"',
        'item.net_effective_price AS "netEffectivePrice"',
        'item.gst_rate AS "gstRate"',
        'item.gst_amount AS "gstAmount"',
        'item.gst_included_price AS "gstIncludedPrice"',
        'item.mrp AS "mrp"',
        'item.match_status AS "matchStatus"',
        'item.created_at AS "createdAt"',
        'item.updated_at AS "updatedAt"',
      ])
      .orderBy('item.model_name', 'ASC')
      .getRawMany<PriceListItemResponse>();
    return {
      ...(summary ??
        this.toListResponse({
          ...list,
          totalItems: '0',
          matchedCount: '0',
          unmatchedCount: '0',
        })),
      items: rows.map((row) => this.toItemResponse(row)),
    };
  }

  preview(dto: PreviewPriceListDto): Promise<PriceListPreviewResponse> {
    return this.buildPreview(dto);
  }

  /**
   * Reads a supplier's text-based PDF into reviewable rows. It intentionally
   * requires a clearly labelled GST-included column: no other price column is
   * treated as a stock value.
   */
  async extractPdf(
    file: UploadedPriceListPdf | undefined,
  ): Promise<PriceListPdfExtractionResponse> {
    this.assertPriceListPdf(file);
    let parsed: Awaited<ReturnType<typeof pdfParse>>;
    try {
      parsed = await pdfParse(file.buffer, {
        pagerender: (page) => this.renderPdfTablePage(page),
        // The installed package awaits this callback; its legacy type
        // declaration incorrectly limits it to a synchronous string.
      } as never);
    } catch {
      throw new BadRequestException(
        'This PDF could not be read. Use an unlocked, text-based supplier Price List PDF.',
      );
    }
    if (parsed.numpages < 1 || parsed.numpages > MAX_PRICE_LIST_PDF_PAGES) {
      throw new BadRequestException(
        `Price List PDFs must contain between 1 and ${MAX_PRICE_LIST_PDF_PAGES} pages.`,
      );
    }

    const { rows, warnings } = this.parsePdfRows(parsed.text);
    if (rows.length === 0) {
      throw new BadRequestException(
        'No rows with an explicit GST-included price were found. Use a text-based PDF with a GST Included Price column, or add the rows manually.',
      );
    }
    return {
      fileName: file.originalname,
      pageCount: parsed.numpages,
      rows,
      warnings,
    };
  }

  async import(
    dto: ImportPriceListDto,
    createdBy: string,
  ): Promise<PriceListDetailResponse> {
    const list = await this.priceLists.manager.transaction(async (manager) => {
      await this.lockActivation(manager);
      const preview = await this.buildPreview(dto, manager);
      const activate = dto.activate ?? true;
      if (activate) {
        await manager
          .createQueryBuilder()
          .update(PriceList)
          .set({ isActive: false })
          .where('is_active = TRUE')
          .execute();
      }

      const priceList = await manager.getRepository(PriceList).save(
        manager.getRepository(PriceList).create({
          name: dto.name.trim(),
          supplier: this.optionalText(dto.supplier),
          effectiveDate: dto.effectiveDate,
          isActive: activate,
          createdBy,
        }),
      );
      const prepared = this.prepareRows(dto.items);
      const rowsByNumber = new Map(
        preview.rows.map((row) => [row.rowNumber, row]),
      );
      const itemRepository = manager.getRepository(PriceListItem);
      await itemRepository.save(
        prepared.map((row) => {
          const previewRow = rowsByNumber.get(row.rowNumber)!;
          return itemRepository.create({
            priceListId: priceList.id,
            productId: previewRow.productId,
            modelName: row.modelName,
            normalizedModelName: row.normalizedModelName,
            netEffectivePrice: this.money(row.input.netEffectivePrice),
            gstRate: this.rate(row.input.gstRate),
            gstAmount: this.money(row.input.gstAmount),
            gstIncludedPrice: this.money(row.input.gstIncludedPrice)!,
            mrp: this.money(row.input.mrp),
            matchStatus: previewRow.matchStatus,
          });
        }),
      );
      return priceList;
    });
    return this.findOne(list.id);
  }

  async activate(id: string): Promise<PriceListDetailResponse> {
    await this.priceLists.manager.transaction(async (manager) => {
      await this.lockActivation(manager);
      const repository = manager.getRepository(PriceList);
      const list = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!list) throw new NotFoundException('Price List not found.');
      await manager
        .createQueryBuilder()
        .update(PriceList)
        .set({ isActive: false })
        .where('is_active = TRUE AND id != :id', { id })
        .execute();
      if (!list.isActive) {
        list.isActive = true;
        await repository.save(list);
      }
    });
    return this.findOne(id);
  }

  private async buildPreview(
    dto: PreviewPriceListDto,
    manager?: EntityManager,
  ): Promise<PriceListPreviewResponse> {
    const prepared = this.prepareRows(dto.items);
    const productRepository = manager?.getRepository(Product) ?? this.products;
    const listRepository = manager?.getRepository(PriceList) ?? this.priceLists;
    const itemRepository =
      manager?.getRepository(PriceListItem) ?? this.priceListItems;
    const products = await productRepository.find({
      select: { id: true, name: true },
    });
    const productsByModel = new Map<string, ProductMatch[]>();
    for (const product of products) {
      const modelName = normalizeModelName(product.name);
      const matches = productsByModel.get(modelName) ?? [];
      matches.push({ id: product.id, name: product.name });
      productsByModel.set(modelName, matches);
    }
    const activeList = await listRepository.findOne({
      where: { isActive: true },
    });
    const matchedProductIds = prepared
      .map((row) => productsByModel.get(row.normalizedModelName))
      .filter((matches): matches is [ProductMatch] => matches?.length === 1)
      .map(([product]) => product.id);
    const activePrices =
      activeList && matchedProductIds.length > 0
        ? await itemRepository.find({
            where: {
              priceListId: activeList.id,
              productId: In(matchedProductIds),
              matchStatus: PriceListItemMatchStatus.MATCHED,
            },
          })
        : [];
    const oldPriceByProduct = new Map(
      activePrices.map((item) => [item.productId!, item.gstIncludedPrice]),
    );
    const rows = prepared.map((row) => {
      const productMatches = productsByModel.get(row.normalizedModelName) ?? [];
      const product = productMatches.length === 1 ? productMatches[0] : null;
      const oldGstIncludedPrice = product
        ? (oldPriceByProduct.get(product.id) ?? null)
        : null;
      const gstIncludedPrice = this.money(row.input.gstIncludedPrice)!;
      const matchStatus = product
        ? PriceListItemMatchStatus.MATCHED
        : PriceListItemMatchStatus.UNMATCHED;
      const status: PriceListPreviewStatus = !product
        ? 'UNMATCHED'
        : oldGstIncludedPrice === null
          ? 'MATCHED'
          : this.sameMoney(oldGstIncludedPrice, gstIncludedPrice)
            ? 'UNCHANGED'
            : 'PRICE_CHANGED';
      return {
        rowNumber: row.rowNumber,
        modelName: row.modelName,
        normalizedModelName: row.normalizedModelName,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        oldGstIncludedPrice,
        gstIncludedPrice,
        matchStatus,
        status,
      };
    });
    return {
      name: dto.name.trim(),
      supplier: this.optionalText(dto.supplier),
      effectiveDate: dto.effectiveDate,
      matchedCount: rows.filter(
        (row) => row.matchStatus === PriceListItemMatchStatus.MATCHED,
      ).length,
      unmatchedCount: rows.filter(
        (row) => row.matchStatus === PriceListItemMatchStatus.UNMATCHED,
      ).length,
      priceChangedCount: rows.filter((row) => row.status === 'PRICE_CHANGED')
        .length,
      unchangedCount: rows.filter((row) => row.status === 'UNCHANGED').length,
      rows,
    };
  }

  private prepareRows(items: PriceListItemInputDto[]): PreparedPriceListRow[] {
    const normalizedModels = new Set<string>();
    return items.map((input, index) => {
      const modelName = input.modelName.trim().replace(/\s+/g, ' ');
      const normalizedModelName = normalizeModelName(modelName);
      if (!normalizedModelName) {
        throw new BadRequestException(
          'Every Price List model must be present.',
        );
      }
      if (normalizedModels.has(normalizedModelName)) {
        throw new BadRequestException(
          `Duplicate model in Price List: ${modelName}. Keep only one row per exact model.`,
        );
      }
      normalizedModels.add(normalizedModelName);
      return { input, rowNumber: index + 1, modelName, normalizedModelName };
    });
  }

  private async renderPdfTablePage(page: {
    getTextContent: (options: {
      normalizeWhitespace: boolean;
      disableCombineTextItems: boolean;
    }) => Promise<{
      items: Array<{
        str: string;
        transform: number[];
        width?: number;
      }>;
    }>;
  }): Promise<string> {
    const content = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });
    const lines: Array<{
      y: number;
      items: Array<{ text: string; x: number; width: number }>;
    }> = [];

    for (const item of content.items) {
      const text = item.str.trim();
      if (!text) continue;
      const x = item.transform[4] ?? 0;
      const y = item.transform[5] ?? 0;
      const line = lines.find((candidate) => Math.abs(candidate.y - y) < 2);
      const target = line ?? { y, items: [] };
      if (!line) lines.push(target);
      target.items.push({ text, x, width: item.width ?? 0 });
    }

    return lines
      .sort((left, right) => right.y - left.y)
      .map((line) => {
        const cells: string[] = [];
        let lastRight: number | undefined;
        for (const item of line.items.sort((left, right) => left.x - right.x)) {
          if (lastRight !== undefined && item.x - lastRight > 18) {
            cells.push(item.text);
          } else if (cells.length === 0) {
            cells.push(item.text);
          } else {
            cells[cells.length - 1] = `${cells[cells.length - 1]} ${item.text}`;
          }
          lastRight = Math.max(lastRight ?? item.x, item.x + item.width);
        }
        return cells.join('\t');
      })
      .join('\n');
  }

  private parsePdfRows(text: string): {
    rows: ExtractedPriceListPdfRow[];
    warnings: string[];
  } {
    let gstIncludedColumn = -1;
    let modelColumn = -1;
    let foundGstHeader = false;
    const rows: ExtractedPriceListPdfRow[] = [];
    const seenModels = new Set<string>();
    const warnings: string[] = [];

    for (const sourceLine of text.split(/\r?\n/)) {
      const cells = sourceLine
        .split('\t')
        .map((cell) => cell.trim().replace(/\s+/g, ' '))
        .filter(Boolean);
      if (cells.length === 0) continue;

      const header = this.findPdfHeader(cells);
      if (header.gstIncludedColumn >= 0) {
        gstIncludedColumn = header.gstIncludedColumn;
        modelColumn = header.modelColumn;
        foundGstHeader = true;
        continue;
      }
      if (gstIncludedColumn < 0 || this.looksLikePdfHeader(cells)) continue;

      const gstIncludedPrice = this.pdfMoney(cells[gstIncludedColumn]);
      const modelName = this.pdfModelName(
        cells,
        modelColumn,
        gstIncludedColumn,
      );
      if (gstIncludedPrice === null || !modelName) continue;

      const normalized = normalizeModelName(modelName);
      if (seenModels.has(normalized)) {
        warnings.push(`Repeated model skipped: ${modelName}.`);
        continue;
      }
      seenModels.add(normalized);
      rows.push({
        rowNumber: rows.length + 1,
        modelName,
        gstIncludedPrice,
      });
    }

    if (!foundGstHeader) {
      throw new BadRequestException(
        'Could not find a GST Included Price column in this PDF. Prices were not guessed.',
      );
    }
    return { rows, warnings };
  }

  private findPdfHeader(cells: string[]): {
    gstIncludedColumn: number;
    modelColumn: number;
  } {
    const normalizedCells = cells.map((cell) => cell.toUpperCase());
    const gstIncludedColumn = normalizedCells.findIndex(
      (cell) =>
        /\b(GST|TAX)\b/.test(cell) &&
        /\b(INCL(?:UDED|USIVE)?|WITH)\b/.test(cell) &&
        /\b(PRICE|AMOUNT|VALUE)\b/.test(cell),
    );
    const modelColumn = normalizedCells.findIndex((cell) =>
      /\b(MODEL|PRODUCT|ITEM|DESCRIPTION|PARTICULAR)\b/.test(cell),
    );
    return { gstIncludedColumn, modelColumn };
  }

  private looksLikePdfHeader(cells: string[]): boolean {
    const text = cells.join(' ').toUpperCase();
    return (
      /\b(MODEL|PRODUCT|ITEM|DESCRIPTION|PARTICULAR)\b/.test(text) &&
      /\b(PRICE|AMOUNT|MRP|GST|TAX)\b/.test(text)
    );
  }

  private pdfModelName(
    cells: string[],
    modelColumn: number,
    gstIncludedColumn: number,
  ): string | null {
    const selected = modelColumn >= 0 ? cells[modelColumn] : undefined;
    const fallback = cells
      .slice(0, gstIncludedColumn)
      .filter((cell) => !/^\d+[.)]?$/.test(cell))
      .filter((cell) => !this.isPdfNumericValue(cell))
      .filter((cell) => !/^\d+(?:\.\d+)?V$/i.test(cell))
      .filter((cell) => !/^\d+\+\d+\*?$/.test(cell))
      .filter((cell) => !/^\d+(?:\.\d+)?%$/.test(cell))
      .join(' ');
    const useSelectedModel =
      selected != null &&
      !/^\d+(?:\.\d+)?V$/i.test(selected) &&
      !/^\d+\+\d+\*?$/.test(selected) &&
      !/^\d+(?:\.\d+)?%$/.test(selected);
    const modelName = (useSelectedModel ? selected : fallback)
      .replace(/^\d+[.)]?\s*/, '')
      .trim();
    return modelName ? modelName : null;
  }

  private pdfMoney(value: string | undefined): number | null {
    if (!value) return null;
    if (!this.isPdfNumericValue(value)) return null;
    const cleaned = value.replace(/[^0-9.,]/g, '').replace(/,/g, '');
    const amount = Number(cleaned);
    return Number.isFinite(amount) && amount >= 0 && amount <= 9999999999.99
      ? amount
      : null;
  }

  private isPdfNumericValue(value: string): boolean {
    return /^(?:(?:₹|RS\.?|INR)\s*)?\d[\d,]*(?:\.\d{1,2})?$/i.test(
      value.trim(),
    );
  }

  private assertPriceListPdf(
    file: UploadedPriceListPdf | undefined,
  ): asserts file is UploadedPriceListPdf {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Select a non-empty Price List PDF.');
    }
    if (file.buffer.length > MAX_PRICE_LIST_PDF_BYTES) {
      throw new BadRequestException(
        'Price List PDFs must be 10 MiB or smaller.',
      );
    }
    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('The selected file is not a valid PDF.');
    }
  }

  private async summaryForIds(ids: string[]): Promise<PriceListResponse[]> {
    if (ids.length === 0) return [];
    const rows = await this.priceLists
      .createQueryBuilder('priceList')
      .leftJoin(PriceListItem, 'item', 'item.price_list_id = priceList.id')
      .where('priceList.id IN (:...ids)', { ids })
      .select([
        'priceList.id AS "id"',
        'priceList.name AS "name"',
        'priceList.supplier AS "supplier"',
        'priceList.effective_date AS "effectiveDate"',
        'priceList.is_active AS "isActive"',
        'priceList.created_at AS "createdAt"',
        'priceList.updated_at AS "updatedAt"',
        'COUNT(item.id) AS "totalItems"',
        `COUNT(item.id) FILTER (WHERE item.match_status = '${PriceListItemMatchStatus.MATCHED}') AS "matchedCount"`,
        `COUNT(item.id) FILTER (WHERE item.match_status = '${PriceListItemMatchStatus.UNMATCHED}') AS "unmatchedCount"`,
      ])
      .groupBy('priceList.id')
      .getRawMany();
    return rows.map((row) => this.toListResponse(row));
  }

  private toListResponse(row: {
    id: string;
    name: string;
    supplier: string | null;
    effectiveDate: string;
    isActive: boolean | string;
    createdAt: Date;
    updatedAt: Date;
    totalItems: string;
    matchedCount: string;
    unmatchedCount: string;
  }): PriceListResponse {
    return {
      id: row.id,
      name: row.name,
      supplier: row.supplier,
      effectiveDate: row.effectiveDate,
      isActive: row.isActive === true || row.isActive === 'true',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      totalItems: Number(row.totalItems),
      matchedCount: Number(row.matchedCount),
      unmatchedCount: Number(row.unmatchedCount),
    };
  }

  private toItemResponse(row: PriceListItemResponse): PriceListItemResponse {
    return {
      ...row,
      netEffectivePrice: this.decimal(row.netEffectivePrice, 2),
      gstRate: this.decimal(row.gstRate, 3),
      gstAmount: this.decimal(row.gstAmount, 2),
      gstIncludedPrice: this.decimal(row.gstIncludedPrice, 2) ?? '0.00',
      mrp: this.decimal(row.mrp, 2),
    };
  }

  private async lockActivation(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      'betco-price-list-activation',
    ]);
  }

  private optionalText(value: string | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  private money(value: number | undefined): string | null {
    return value === undefined ? null : value.toFixed(2);
  }

  private rate(value: number | undefined): string | null {
    return value === undefined ? null : value.toFixed(3);
  }

  private decimal(value: string | null, scale: number): string | null {
    if (value === null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(scale) : null;
  }

  private sameMoney(left: string, right: string): boolean {
    return Number(left).toFixed(2) === Number(right).toFixed(2);
  }
}
