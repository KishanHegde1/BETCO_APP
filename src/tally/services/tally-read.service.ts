import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, IsNull } from 'typeorm';

import {
  DealerInvoice,
  DealerPayment,
  TallyDealerMapping,
  TallyLedgerMappingStatus,
  TallySyncRunStatus,
} from '../../entities';
import { TallySyncRepository } from '../../repositories/tally-sync.repository';
import {
  CreateTallyMappingDto,
  TallyInvoiceQueryDto,
  TallyLedgerQueryDto,
  TallyPageQueryDto,
  TallyPaymentQueryDto,
  UpdateTallyMappingDto,
} from '../dto/tally-read-query.dto';

@Injectable()
export class TallyReadService {
  constructor(private readonly repository: TallySyncRepository) {}

  async dealerSummary(userId: string) {
    const dealer = await this.requireDealer(userId);
    const ledger = await this.repository.ledgers.findOne({
      where: { dealerId: dealer.id, mappingStatus: TallyLedgerMappingStatus.MAPPED },
      order: { lastSyncedAt: 'DESC' },
    });
    if (!ledger) {
      return {
        dealerId: dealer.id,
        mappingStatus: 'NOT_MAPPED',
        ledgerName: null,
        openingBalance: 0,
        closingBalance: 0,
        totalInvoiceAmount: 0,
        totalPaymentAmount: 0,
        outstandingAmount: 0,
        invoiceCount: 0,
        paymentCount: 0,
        lastInvoice: null,
        lastPayment: null,
        lastSyncedAt: null,
      };
    }
    const [invoiceTotals, paymentTotals, lastInvoice, lastPayment] =
      await Promise.all([
        this.repository.invoices
          .createQueryBuilder('invoice')
          .select('COALESCE(SUM(invoice.invoice_amount), 0)', 'total')
          .addSelect('COUNT(*)', 'count')
          .where('invoice.dealer_id = :dealerId', { dealerId: dealer.id })
          .andWhere('invoice.is_cancelled = false')
          .getRawOne<{ total: string; count: string }>(),
        this.repository.payments
          .createQueryBuilder('payment')
          .select('COALESCE(SUM(payment.amount), 0)', 'total')
          .addSelect('COUNT(*)', 'count')
          .where('payment.dealer_id = :dealerId', { dealerId: dealer.id })
          .getRawOne<{ total: string; count: string }>(),
        this.repository.invoices.findOne({
          where: { dealerId: dealer.id },
          order: { invoiceDate: 'DESC', createdAt: 'DESC' },
        }),
        this.repository.payments.findOne({
          where: { dealerId: dealer.id },
          order: { paymentDate: 'DESC', createdAt: 'DESC' },
        }),
      ]);
    return {
      dealerId: dealer.id,
      mappingStatus: 'MAPPED',
      ledgerName: ledger.tallyLedgerName,
      openingBalance: this.number(ledger.openingBalance),
      closingBalance: this.number(ledger.closingBalance),
      totalInvoiceAmount: this.number(invoiceTotals?.total),
      totalPaymentAmount: this.number(paymentTotals?.total),
      outstandingAmount: this.number(ledger.closingBalance),
      invoiceCount: Number(invoiceTotals?.count ?? 0),
      paymentCount: Number(paymentTotals?.count ?? 0),
      lastInvoice: lastInvoice ? this.invoiceListItem(lastInvoice) : null,
      lastPayment: lastPayment ? this.paymentListItem(lastPayment) : null,
      lastSyncedAt: ledger.lastSyncedAt ?? null,
    };
  }

  async dealerInvoices(userId: string, query: TallyInvoiceQueryDto) {
    const dealer = await this.requireDealer(userId);
    return this.invoicePage(query, dealer.id);
  }

  async dealerInvoice(userId: string, id: string) {
    const dealer = await this.requireDealer(userId);
    const invoice = await this.repository.invoices.findOneBy({ id, dealerId: dealer.id });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    const items = await this.repository.invoiceItems.find({
      where: { invoiceId: invoice.id },
      order: { displayOrder: 'ASC' },
    });
    return {
      ...this.invoiceDetail(invoice),
      items: items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        sku: item.sku ?? null,
        quantity: this.number(item.quantity),
        rate: this.number(item.rate),
        amount: this.number(item.amount),
        discountAmount: this.number(item.discountAmount),
        taxAmount: this.number(item.taxAmount),
        unit: item.unit ?? null,
      })),
    };
  }

  async dealerPayments(userId: string, query: TallyPaymentQueryDto) {
    const dealer = await this.requireDealer(userId);
    return this.paymentPage(query, dealer.id);
  }

  async dealerPayment(userId: string, id: string) {
    const dealer = await this.requireDealer(userId);
    const payment = await this.repository.payments.findOneBy({ id, dealerId: dealer.id });
    if (!payment) throw new NotFoundException('Payment not found.');
    return this.paymentDetail(payment);
  }

  async dealerStatement(userId: string, query: TallyPageQueryDto) {
    const dealer = await this.requireDealer(userId);
    this.validateDates(query);
    const [invoices, payments] = await Promise.all([
      this.repository.invoices.find({ where: { dealerId: dealer.id }, order: { invoiceDate: 'ASC', createdAt: 'ASC' } }),
      this.repository.payments.find({ where: { dealerId: dealer.id }, order: { paymentDate: 'ASC', createdAt: 'ASC' } }),
    ]);
    const entries = [
      ...invoices.filter((item) => !item.isCancelled).map((item) => ({
        type: 'INVOICE' as const,
        date: item.invoiceDate,
        voucherNumber: item.invoiceNumber,
        description: item.voucherType,
        debit: this.number(item.invoiceAmount),
        credit: 0,
      })),
      ...payments.map((item) => ({
        type: 'PAYMENT' as const,
        date: item.paymentDate,
        voucherNumber: item.voucherNumber ?? null,
        description: item.voucherType,
        debit: 0,
        credit: this.number(item.amount),
      })),
    ]
      .sort((left, right) => left.date.localeCompare(right.date) || left.type.localeCompare(right.type));
    let balance = 0;
    const statement = entries.map((entry) => {
      balance += entry.debit - entry.credit;
      return { ...entry, runningBalance: balance };
    }).filter((entry) => (!query.fromDate || entry.date >= query.fromDate) && (!query.toDate || entry.date <= query.toDate));
    const start = (query.page - 1) * query.limit;
    return {
      items: statement.slice(start, start + query.limit),
      pagination: this.pagination(query, statement.length),
    };
  }

  async adminDashboard() {
    const [totalLedgers, mappedLedgers, totalInvoices, totalPayments, latest, failed] = await Promise.all([
      this.repository.ledgers.count(),
      this.repository.ledgers.count({ where: { mappingStatus: TallyLedgerMappingStatus.MAPPED } }),
      this.repository.invoices.count(),
      this.repository.payments.count(),
      this.repository.syncRuns.findOne({ order: { startedAt: 'DESC' } }),
      this.repository.syncRuns.findOne({ where: { status: TallySyncRunStatus.FAILED }, order: { startedAt: 'DESC' } }),
    ]);
    return {
      totalLedgers,
      mappedLedgers,
      unmappedLedgers: totalLedgers - mappedLedgers,
      totalInvoices,
      totalPayments,
      lastSuccessfulSync: (await this.repository.syncRuns.findOne({ where: { status: TallySyncRunStatus.SUCCEEDED }, order: { finishedAt: 'DESC' } }))?.finishedAt ?? null,
      lastFailedSync: failed?.finishedAt ?? null,
      latestSyncStatus: latest?.status ?? null,
    };
  }

  async adminLedgers(query: TallyLedgerQueryDto) {
    const builder = this.repository.ledgers.createQueryBuilder('ledger');
    if (query.mapped === 'mapped') builder.andWhere('ledger.mapping_status = :status', { status: TallyLedgerMappingStatus.MAPPED });
    if (query.mapped === 'unmapped') builder.andWhere('ledger.mapping_status = :status', { status: TallyLedgerMappingStatus.UNMAPPED });
    if (query.active !== undefined) builder.andWhere('ledger.is_active = :active', { active: query.active });
    const search = query.search?.trim();
    if (search) builder.andWhere(new Brackets((nested) => nested.where('ledger.tally_ledger_name ILIKE :search', { search: `%${search}%` }).orWhere('ledger.gstin ILIKE :search', { search: `%${search}%` }).orWhere('ledger.phone ILIKE :search', { search: `%${search}%` })));
    const total = await builder.clone().getCount();
    const items = await builder.orderBy('ledger.updated_at', query.sortOrder).skip((query.page - 1) * query.limit).take(query.limit).getMany();
    return { items, pagination: this.pagination(query, total) };
  }

  async adminLedger(id: string) {
    const ledger = await this.repository.ledgers.findOneBy({ id });
    if (!ledger) throw new NotFoundException('Tally ledger not found.');
    return ledger;
  }

  adminInvoices(query: TallyInvoiceQueryDto) { return this.invoicePage(query, query.dealerId); }
  adminPayments(query: TallyPaymentQueryDto) { return this.paymentPage(query, query.dealerId); }

  async unmatchedRecords(query: TallyPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const [ledgerPage, invoicePage, paymentPage] = await Promise.all([
      this.repository.ledgers.findAndCount({ where: { mappingStatus: TallyLedgerMappingStatus.UNMAPPED }, order: { updatedAt: 'DESC' }, skip, take: query.limit }),
      this.repository.invoices.findAndCount({ where: { dealerId: IsNull() }, order: { invoiceDate: 'DESC' }, skip, take: query.limit }),
      this.repository.payments.findAndCount({ where: { dealerId: IsNull() }, order: { paymentDate: 'DESC' }, skip, take: query.limit }),
    ]);
    return {
      ledgers: { items: ledgerPage[0], pagination: this.pagination(query, ledgerPage[1]) },
      invoices: { items: invoicePage[0].map((item) => this.invoiceListItem(item)), pagination: this.pagination(query, invoicePage[1]) },
      payments: { items: paymentPage[0].map((item) => this.paymentListItem(item)), pagination: this.pagination(query, paymentPage[1]) },
    };
  }

  async findSyncRuns(query: TallyPageQueryDto) {
    const [items, total] = await this.repository.syncRuns.findAndCount({
      order: { startedAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, pagination: this.pagination(query, total) };
  }

  async createMapping(dto: CreateTallyMappingDto) {
    const [dealer, ledger] = await Promise.all([
      this.repository.dealers.findOneBy({ id: dto.dealerId }),
      this.repository.ledgers.findOneBy({ id: dto.ledgerId }),
    ]);
    if (!dealer) throw new NotFoundException('Dealer not found.');
    if (!ledger) throw new NotFoundException('Tally ledger not found.');
    let mapping = await this.mappingForLedger(ledger);
    if (mapping?.isActive && mapping.dealerId !== dealer.id) {
      throw new ConflictException('This active Tally ledger is already mapped to another dealer.');
    }
    if (!mapping) {
      mapping = await this.repository.mappings.findOne({
        where: { dealerId: dealer.id, tallyCompanyName: ledger.tallyCompanyName },
      });
      if (mapping?.isActive && mapping.tallyLedgerName !== ledger.tallyLedgerName) {
        throw new ConflictException('This dealer already has an active Tally ledger mapping for this company.');
      }
    }
    if (!mapping) mapping = this.repository.mappings.create({ dealerId: dealer.id, tallyCompanyName: ledger.tallyCompanyName, tallyLedgerName: ledger.tallyLedgerName, mappingMethod: 'MANUAL' });
    mapping.tallyLedgerName = ledger.tallyLedgerName;
    mapping.tallyLedgerGuid = ledger.tallyLedgerGuid ?? undefined;
    mapping.lastClosingBalance = ledger.closingBalance;
    mapping.lastSyncedAt = ledger.lastSyncedAt ?? new Date();
    mapping.isActive = dto.isActive;
    mapping = await this.repository.mappings.save(mapping);
    await this.applyMappingToLedger(ledger, mapping);
    return mapping;
  }

  async updateMapping(id: string, dto: UpdateTallyMappingDto) {
    const mapping = await this.repository.mappings.findOneBy({ id });
    if (!mapping) throw new NotFoundException('Tally mapping not found.');
    if (dto.dealerId) {
      const dealer = await this.repository.dealers.findOneBy({ id: dto.dealerId });
      if (!dealer) throw new NotFoundException('Dealer not found.');
      if (mapping.isActive) {
        const conflict = await this.repository.mappings.findOne({
          where: {
            dealerId: dealer.id,
            tallyCompanyName: mapping.tallyCompanyName,
            isActive: true,
          },
        });
        if (conflict && conflict.id !== mapping.id) {
          throw new ConflictException('This dealer already has an active Tally ledger mapping for this company.');
        }
      }
      mapping.dealerId = dealer.id;
    }
    if (dto.isActive !== undefined) mapping.isActive = dto.isActive;
    const saved = await this.repository.mappings.save(mapping);
    const ledger = await this.ledgerForMapping(saved);
    if (ledger) await this.applyMappingToLedger(ledger, saved);
    return saved;
  }

  private async invoicePage(query: TallyInvoiceQueryDto, dealerId?: string) {
    this.validateDates(query);
    const builder = this.repository.invoices.createQueryBuilder('invoice');
    if (dealerId) builder.where('invoice.dealer_id = :dealerId', { dealerId });
    if (query.fromDate) builder.andWhere('invoice.invoice_date >= :fromDate', { fromDate: query.fromDate });
    if (query.toDate) builder.andWhere('invoice.invoice_date <= :toDate', { toDate: query.toDate });
    if (query.status) builder.andWhere('invoice.payment_status = :status', { status: query.status });
    const search = query.search?.trim();
    if (search) builder.andWhere(new Brackets((nested) => nested.where('invoice.invoice_number ILIKE :search', { search: `%${search}%` }).orWhere('invoice.voucher_type ILIKE :search', { search: `%${search}%` }).orWhere('invoice.source_metadata ->> \'referenceNumber\' ILIKE :search', { search: `%${search}%` })));
    const total = await builder.clone().getCount();
    const sort = query.sortBy === 'amount' ? 'invoice.invoice_amount' : query.sortBy === 'createdAt' ? 'invoice.created_at' : 'invoice.invoice_date';
    const items = await builder.orderBy(sort, query.sortOrder).addOrderBy('invoice.created_at', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getMany();
    return { items: items.map((item) => this.invoiceListItem(item)), pagination: this.pagination(query, total) };
  }

  private async paymentPage(query: TallyPaymentQueryDto, dealerId?: string) {
    this.validateDates(query);
    const builder = this.repository.payments.createQueryBuilder('payment');
    if (dealerId) builder.where('payment.dealer_id = :dealerId', { dealerId });
    if (query.fromDate) builder.andWhere('payment.payment_date >= :fromDate', { fromDate: query.fromDate });
    if (query.toDate) builder.andWhere('payment.payment_date <= :toDate', { toDate: query.toDate });
    if (query.paymentMode?.trim()) builder.andWhere('payment.payment_mode ILIKE :mode', { mode: `%${query.paymentMode.trim()}%` });
    const search = query.search?.trim();
    if (search) builder.andWhere(new Brackets((nested) => nested.where('payment.voucher_number ILIKE :search', { search: `%${search}%` }).orWhere('payment.reference_number ILIKE :search', { search: `%${search}%` }).orWhere('payment.voucher_type ILIKE :search', { search: `%${search}%` })));
    const total = await builder.clone().getCount();
    const sort = query.sortBy === 'amount' ? 'payment.amount' : query.sortBy === 'createdAt' ? 'payment.created_at' : 'payment.payment_date';
    const items = await builder.orderBy(sort, query.sortOrder).addOrderBy('payment.created_at', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getMany();
    return { items: items.map((item) => this.paymentListItem(item)), pagination: this.pagination(query, total) };
  }

  private invoiceListItem(item: DealerInvoice) {
    return { id: item.id, voucherNumber: item.invoiceNumber, voucherDate: item.invoiceDate, voucherType: item.voucherType, partyLedgerName: item.partyLedgerName, totalAmount: this.number(item.invoiceAmount), pendingAmount: this.number(item.pendingAmount), paidAmount: this.number(item.paidAmount), paymentStatus: item.paymentStatus, pdfAvailable: item.pdfStatus === 'AVAILABLE' && Boolean(item.pdfUrl) };
  }

  private invoiceDetail(item: DealerInvoice) {
    return { ...this.invoiceListItem(item), taxAmount: this.number(item.taxAmount), discountAmount: this.number(item.discountAmount), isCancelled: item.isCancelled, narration: item.narration ?? null, referenceNumber: item.sourceMetadata?.referenceNumber ?? null, pdfUrl: item.pdfStatus === 'AVAILABLE' ? item.pdfUrl ?? null : null, pdfStatus: item.pdfStatus, lastSyncedAt: item.syncedAt };
  }

  private paymentListItem(item: DealerPayment) {
    return { id: item.id, voucherNumber: item.voucherNumber ?? null, voucherDate: item.paymentDate, voucherType: item.voucherType, partyLedgerName: item.partyLedgerName, amount: this.number(item.amount), paymentMode: item.paymentMode ?? null, referenceNumber: item.referenceNumber ?? null };
  }

  private paymentDetail(item: DealerPayment) {
    return { ...this.paymentListItem(item), narration: item.narration ?? null, lastSyncedAt: item.syncedAt };
  }

  private async requireDealer(userId: string) {
    const dealer = await this.repository.dealers.findOneBy({ userId });
    if (!dealer) throw new NotFoundException('Dealer profile not found.');
    return dealer;
  }

  private async mappingForLedger(ledger: {
    tallyCompanyName: string;
    tallyLedgerGuid?: string | null;
    tallyLedgerName: string;
  }): Promise<TallyDealerMapping | null> {
    if (ledger.tallyLedgerGuid) {
      const byGuid = await this.repository.mappings.findOne({
        where: {
          tallyCompanyName: ledger.tallyCompanyName,
          tallyLedgerGuid: ledger.tallyLedgerGuid,
        },
      });
      if (byGuid) return byGuid;
    }
    return this.repository.mappings.findOne({
      where: {
        tallyCompanyName: ledger.tallyCompanyName,
        tallyLedgerName: ledger.tallyLedgerName,
      },
    });
  }

  private async ledgerForMapping(mapping: TallyDealerMapping) {
    if (mapping.tallyLedgerGuid) {
      const byGuid = await this.repository.ledgers.findOne({
        where: {
          tallyCompanyName: mapping.tallyCompanyName,
          tallyLedgerGuid: mapping.tallyLedgerGuid,
        },
      });
      if (byGuid) return byGuid;
    }
    return this.repository.ledgers.findOne({
      where: {
        tallyCompanyName: mapping.tallyCompanyName,
        tallyLedgerName: mapping.tallyLedgerName,
      },
    });
  }

  private async applyMappingToLedger(
    ledger: { id: string; tallyCompanyName: string; normalizedLedgerName: string; dealerId?: string | null; mappingStatus: TallyLedgerMappingStatus },
    mapping: TallyDealerMapping,
  ): Promise<void> {
    const mappedDealerId = mapping.isActive ? mapping.dealerId : null;
    ledger.dealerId = mappedDealerId;
    ledger.mappingStatus = mapping.isActive
      ? TallyLedgerMappingStatus.MAPPED
      : TallyLedgerMappingStatus.UNMAPPED;
    await this.repository.ledgers.save(ledger);
    await Promise.all([
      this.repository.invoices
        .createQueryBuilder()
        .update(DealerInvoice)
        .set({ dealerId: mappedDealerId, tallyLedgerId: mappedDealerId ? ledger.id : null })
        .where('tally_company_name = :companyName', { companyName: ledger.tallyCompanyName })
        .andWhere('normalized_party_ledger_name = :ledgerName', { ledgerName: ledger.normalizedLedgerName })
        .execute(),
      this.repository.payments
        .createQueryBuilder()
        .update(DealerPayment)
        .set({ dealerId: mappedDealerId, tallyLedgerId: mappedDealerId ? ledger.id : null })
        .where('tally_company_name = :companyName', { companyName: ledger.tallyCompanyName })
        .andWhere('normalized_party_ledger_name = :ledgerName', { ledgerName: ledger.normalizedLedgerName })
        .execute(),
    ]);
  }

  private validateDates(query: TallyPageQueryDto): void {
    if (query.fromDate && query.toDate && query.fromDate > query.toDate) throw new BadRequestException('fromDate must be on or before toDate.');
  }

  private pagination(query: TallyPageQueryDto, totalItems: number) {
    return { page: query.page, limit: query.limit, totalItems, totalPages: Math.ceil(totalItems / query.limit) };
  }

  private number(value: string | number | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  }
}
