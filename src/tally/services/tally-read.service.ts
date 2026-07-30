import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, EntityManager, IsNull, Repository } from 'typeorm';

import {
  Dealer,
  DealerInvoice,
  DealerPayment,
  TallyDealerMapping,
  TallyLedger,
  TallyLedgerMappingStatus,
  TallySyncRunStatus,
} from '../../entities';
import { formatBusinessDate } from '../../common/utils/business-date.util';
import { TallySyncRepository } from '../../repositories/tally-sync.repository';
import {
  CreateTallyMappingDto,
  TallyInvoiceQueryDto,
  TallyLedgerQueryDto,
  TallyPageQueryDto,
  TallyPaymentQueryDto,
  TallyTodayBillsQueryDto,
  UpdateTallyMappingDto,
} from '../dto/tally-read-query.dto';

@Injectable()
export class TallyReadService {
  private readonly logger = new Logger(TallyReadService.name);

  constructor(private readonly repository: TallySyncRepository) {}

  async dealerSummary(userId: string) {
    const dealer = await this.requireDealer(userId);
    // The mapping table is authoritative.  A ledger can be imported after a
    // mapping is saved, so do not report an active mapping as disconnected
    // merely because a ledger's cached dealer_id has not been refreshed yet.
    const mapping = await this.repository.mappings.findOne({
      where: { dealerId: dealer.id, isActive: true },
      order: { lastSyncedAt: 'DESC' },
    });
    if (!mapping) {
      const summary = {
        dealerId: dealer.id,
        mappingStatus: 'NOT_MAPPED',
        isMapped: false,
        ledgerName: null,
        tallyLedgerName: null,
        openingBalance: 0,
        closingBalance: 0,
        totalInvoiceAmount: 0,
        totalPaymentAmount: 0,
        outstandingAmount: 0,
        outstandingBalance: 0,
        invoiceCount: 0,
        paymentCount: 0,
        totalBills: 0,
        totalPayments: 0,
        lastInvoice: null,
        lastPayment: null,
        lastSyncedAt: null,
      };
      this.logDealerSummary(userId, dealer, null, null, summary);
      return summary;
    }
    const ledger = await this.ledgerForMapping(mapping);
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
    const closingBalance = this.number(
      ledger?.closingBalance ?? mapping.lastClosingBalance,
    );
    const summary = {
      dealerId: dealer.id,
      mappingStatus: 'MAPPED',
      isMapped: true,
      ledgerName: mapping.tallyLedgerName,
      tallyLedgerName: mapping.tallyLedgerName,
      openingBalance: this.number(ledger?.openingBalance),
      closingBalance,
      totalInvoiceAmount: this.number(invoiceTotals?.total),
      totalPaymentAmount: this.number(paymentTotals?.total),
      outstandingAmount: closingBalance,
      outstandingBalance: closingBalance,
      invoiceCount: Number(invoiceTotals?.count ?? 0),
      paymentCount: Number(paymentTotals?.count ?? 0),
      totalBills: Number(invoiceTotals?.count ?? 0),
      totalPayments: Number(paymentTotals?.count ?? 0),
      lastInvoice: lastInvoice ? this.invoiceListItem(lastInvoice) : null,
      lastPayment: lastPayment ? this.paymentListItem(lastPayment) : null,
      lastSyncedAt: ledger?.lastSyncedAt ?? mapping.lastSyncedAt ?? null,
    };
    this.logDealerSummary(userId, dealer, mapping, ledger, summary);
    return summary;
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
    const builder = this.repository.ledgers
      .createQueryBuilder('ledger')
      .leftJoin(Dealer, 'dealer', 'dealer.id = ledger.dealer_id');
    const mappingStatus = (query.mappingStatus ?? query.mapped).toLowerCase();
    if (mappingStatus === 'mapped') builder.andWhere('ledger.mapping_status = :status', { status: TallyLedgerMappingStatus.MAPPED });
    if (mappingStatus === 'unmapped') builder.andWhere('ledger.mapping_status = :status', { status: TallyLedgerMappingStatus.UNMAPPED });
    if (query.active !== undefined) builder.andWhere('ledger.is_active = :active', { active: query.active });
    const search = query.search?.trim();
    if (search) builder.andWhere(new Brackets((nested) => nested.where('ledger.tally_ledger_name ILIKE :search', { search: `%${search}%` }).orWhere('ledger.gstin ILIKE :search', { search: `%${search}%` }).orWhere('ledger.phone ILIKE :search', { search: `%${search}%` })));
    const total = await builder.clone().getCount();
    const rows = await builder
      .select([
        'ledger.id AS "id"',
        'ledger.tally_company_name AS "tallyCompanyName"',
        'ledger.tally_ledger_name AS "tallyLedgerName"',
        'ledger.closing_balance AS "closingBalance"',
        'ledger.last_synced_at AS "lastSyncedAt"',
        'ledger.mapping_status AS "mappingStatus"',
        'ledger.dealer_id AS "mappedDealerId"',
        'dealer.business_name AS "mappedDealerName"',
      ])
      .orderBy('ledger.updated_at', query.sortOrder)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getRawMany<Record<string, unknown>>();
    const items = rows.map((row) => ({
      ...row,
      closingBalance: this.number(row.closingBalance as string | number),
      mappedDealerId: row.mappedDealerId ?? null,
      mappedDealerName: row.mappedDealerName ?? null,
    }));
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      pagination: this.pagination(query, total),
    };
  }

  async adminLedger(id: string) {
    const ledger = await this.repository.ledgers.findOneBy({ id });
    if (!ledger) throw new NotFoundException('Tally ledger not found.');
    return ledger;
  }

  adminInvoices(query: TallyInvoiceQueryDto) { return this.invoicePage(query, query.dealerId); }
  adminPayments(query: TallyPaymentQueryDto) { return this.paymentPage(query, query.dealerId); }

  async adminTodayBills(query: TallyTodayBillsQueryDto) {
    const date = query.date ?? formatBusinessDate(new Date());
    const builder = this.repository.invoices
      .createQueryBuilder('invoice')
      .leftJoin(Dealer, 'dealer', 'dealer.id = invoice.dealer_id')
      .where('invoice.invoice_date = :date', { date });
    const mappingStatus = query.mappingStatus?.toLowerCase() ?? 'all';
    if (mappingStatus === 'mapped') builder.andWhere('invoice.dealer_id IS NOT NULL');
    if (mappingStatus === 'unmapped') builder.andWhere('invoice.dealer_id IS NULL');
    const search = query.search?.trim();
    if (search) builder.andWhere(new Brackets((nested) => nested
      .where('invoice.invoice_number ILIKE :search', { search: `%${search}%` })
      .orWhere('invoice.party_ledger_name ILIKE :search', { search: `%${search}%` })
      .orWhere('dealer.business_name ILIKE :search', { search: `%${search}%` })));
    const totals = await builder.clone()
      .select('COUNT(invoice.id)', 'totalBills')
      .addSelect('COALESCE(SUM(invoice.invoice_amount), 0)', 'totalAmount')
      .addSelect('COUNT(invoice.id) FILTER (WHERE invoice.dealer_id IS NOT NULL)', 'mappedBills')
      .addSelect('COUNT(invoice.id) FILTER (WHERE invoice.dealer_id IS NULL)', 'unmappedBills')
      .getRawOne<Record<string, string | number>>();
    const total = Number(totals?.totalBills ?? 0);
    const rows = await builder
      .select([
        'invoice.id AS "id"',
        'invoice.tally_company_name AS "tallyCompanyName"',
        'invoice.invoice_number AS "invoiceNumber"',
        'invoice.invoice_date AS "invoiceDate"',
        'invoice.party_ledger_name AS "partyLedgerName"',
        'invoice.invoice_amount AS "invoiceAmount"',
        'invoice.dealer_id AS "dealerId"',
        'dealer.business_name AS "dealerName"',
        'invoice.synced_at AS "lastSyncedAt"',
      ])
      .orderBy('invoice.invoice_date', query.sortOrder)
      .addOrderBy('invoice.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getRawMany<Record<string, unknown>>();
    return {
      date,
      totalBills: total,
      totalAmount: this.number(totals?.totalAmount),
      mappedBills: Number(totals?.mappedBills ?? 0),
      unmappedBills: Number(totals?.unmappedBills ?? 0),
      items: rows.map((row) => ({
        ...row,
        voucherDate: row.invoiceDate,
        invoiceAmount: this.number(row.invoiceAmount as string | number),
        dealerId: row.dealerId ?? null,
        dealerName: row.dealerName ?? null,
        mappingStatus: row.dealerId ? 'MAPPED' : 'UNMAPPED',
      })),
      page: query.page,
      limit: query.limit,
      total,
      pagination: this.pagination(query, total),
    };
  }

  async adminInvoice(invoiceId: string) {
    const invoice = await this.repository.invoices.findOneBy({ id: invoiceId });
    if (!invoice) throw new NotFoundException('Tally bill not found.');
    const [dealer, items] = await Promise.all([
      invoice.dealerId
        ? this.repository.dealers.findOneBy({ id: invoice.dealerId })
        : Promise.resolve(null),
      this.repository.invoiceItems.find({
        where: { invoiceId: invoice.id },
        order: { displayOrder: 'ASC' },
      }),
    ]);
    return {
      ...this.invoiceDetail(invoice),
      invoiceDate: invoice.invoiceDate,
      dealer: dealer
        ? { id: dealer.id, businessName: dealer.businessName }
        : null,
      items: items.map((item) => ({
        id: item.id,
        description: item.itemName,
        quantity: this.number(item.quantity),
        rate: this.number(item.rate),
        amount: this.number(item.amount),
        taxAmount: this.number(item.taxAmount),
      })),
    };
  }

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
    const ledger = await this.repository.ledgers.findOneBy({ id: dto.ledgerId });
    if (!ledger) throw new NotFoundException('Tally ledger not found.');
    if (!dto.isActive) {
      throw new BadRequestException('Create a mapping as active, then unmap it when needed.');
    }
    return this.mapDealerToBillingLedger(dto.dealerId, {
      tallyCompanyName: ledger.tallyCompanyName,
      tallyLedgerName: ledger.tallyLedgerName,
    });
  }

  async updateMapping(id: string, dto: UpdateTallyMappingDto) {
    const mapping = await this.repository.mappings.findOneBy({ id });
    if (!mapping) throw new NotFoundException('Tally mapping not found.');
    if (dto.isActive === false) return this.unmapDealer(mapping.dealerId);
    return this.mapDealerToBillingLedger(dto.dealerId ?? mapping.dealerId, {
      tallyCompanyName: mapping.tallyCompanyName,
      tallyLedgerName: mapping.tallyLedgerName,
    });
  }

  /** Returns the authoritative active mapping and its current imported ledger. */
  async dealerMapping(dealerId: string) {
    const mapping = await this.repository.mappings.findOne({
      where: { dealerId, isActive: true },
      order: { lastSyncedAt: 'DESC' },
    });
    if (!mapping) return { isMapped: false };
    const ledger = await this.ledgerForMapping(mapping);
    return {
      isMapped: true,
      tallyCompanyName: mapping.tallyCompanyName,
      tallyLedgerName: mapping.tallyLedgerName,
      closingBalance: this.number(
        ledger?.closingBalance ?? mapping.lastClosingBalance,
      ),
      lastSyncedAt: ledger?.lastSyncedAt ?? mapping.lastSyncedAt ?? null,
      mappingStatus: ledger?.mappingStatus ?? TallyLedgerMappingStatus.MAPPED,
    };
  }

  /**
   * Connects an app dealer to an exact Tally billing name.  The transaction
   * keeps the mapping, ledger cache, and already-imported bills consistent.
   */
  async mapDealerToBillingLedger(
    dealerId: string,
    input: { tallyCompanyName: string; tallyLedgerName: string },
  ) {
    const companyName = input.tallyCompanyName.trim();
    const ledgerName = input.tallyLedgerName.trim();
    if (!companyName || !ledgerName) {
      throw new BadRequestException('Tally company and billing ledger name are required.');
    }
    return this.repository.transaction(async (manager) => {
      const dealer = await manager.getRepository(Dealer).findOneBy({ id: dealerId });
      if (!dealer) throw new NotFoundException('Dealer not found.');
      const ledger = await this.findLedgerByBillingName(
        manager,
        companyName,
        ledgerName,
      );
      if (!ledger) throw new NotFoundException('Tally billing ledger not found. Synchronize Tally first.');

      const mappings = manager.getRepository(TallyDealerMapping);
      const mappingForLedger = await this.mappingForLedgerWithRepository(
        mappings,
        ledger,
      );
      if (mappingForLedger?.isActive && mappingForLedger.dealerId !== dealerId) {
        throw new ConflictException('This Tally billing ledger is already mapped to another dealer.');
      }
      let mapping = await mappings.findOne({
        where: { dealerId, tallyCompanyName: ledger.tallyCompanyName },
      });
      if (!mapping) mapping = mappingForLedger;
      if (!mapping) {
        mapping = mappings.create({
          dealerId,
          tallyCompanyName: ledger.tallyCompanyName,
          tallyLedgerName: ledger.tallyLedgerName,
          mappingMethod: 'MANUAL',
        });
      }

      const previousLedger = await this.findLedgerForMapping(manager, mapping);
      if (previousLedger && previousLedger.id !== ledger.id) {
        previousLedger.dealerId = null;
        previousLedger.mappingStatus = TallyLedgerMappingStatus.UNMAPPED;
        await manager.getRepository(TallyLedger).save(previousLedger);
      }
      mapping.dealerId = dealerId;
      mapping.tallyCompanyName = ledger.tallyCompanyName;
      mapping.tallyLedgerName = ledger.tallyLedgerName;
      mapping.tallyLedgerGuid = ledger.tallyLedgerGuid ?? undefined;
      mapping.mappingMethod = 'MANUAL';
      mapping.lastClosingBalance = ledger.closingBalance;
      mapping.lastSyncedAt = ledger.lastSyncedAt ?? new Date();
      mapping.isActive = true;
      mapping = await mappings.save(mapping);
      await this.applyMappingToLedger(manager, ledger, mapping);
      return {
        dealerId,
        tallyCompanyName: mapping.tallyCompanyName,
        tallyLedgerName: mapping.tallyLedgerName,
        closingBalance: this.number(ledger.closingBalance),
        lastSyncedAt: ledger.lastSyncedAt ?? null,
        mappingStatus: TallyLedgerMappingStatus.MAPPED,
        isMapped: true,
      };
    });
  }

  async unmapDealer(dealerId: string) {
    return this.repository.transaction(async (manager) => {
      const mappings = manager.getRepository(TallyDealerMapping);
      const mapping = await mappings.findOne({
        where: { dealerId, isActive: true },
      });
      if (!mapping) return { dealerId, isMapped: false };
      const ledger = await this.findLedgerForMapping(manager, mapping);
      mapping.isActive = false;
      await mappings.save(mapping);
      if (ledger) {
        ledger.dealerId = null;
        ledger.mappingStatus = TallyLedgerMappingStatus.UNMAPPED;
        await manager.getRepository(TallyLedger).save(ledger);
      }
      // Existing invoices and payments are intentionally retained.  They are
      // historical accounting records and must not be deleted on unmapping.
      return { dealerId, isMapped: false };
    });
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
    const invoiceAmount = this.number(item.invoiceAmount);
    return {
      id: item.id,
      tallyCompanyName: item.tallyCompanyName,
      invoiceNumber: item.invoiceNumber,
      invoiceDate: item.invoiceDate,
      invoiceAmount,
      voucherNumber: item.invoiceNumber,
      voucherDate: item.invoiceDate,
      voucherType: item.voucherType,
      partyLedgerName: item.partyLedgerName,
      totalAmount: invoiceAmount,
      pendingAmount: this.number(item.pendingAmount),
      paidAmount: this.number(item.paidAmount),
      paymentStatus: item.paymentStatus,
      pdfAvailable: item.pdfStatus === 'AVAILABLE' && Boolean(item.pdfUrl),
    };
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

  private async mappingForLedgerWithRepository(
    mappings: Repository<TallyDealerMapping>,
    ledger: {
    tallyCompanyName: string;
    tallyLedgerGuid?: string | null;
    tallyLedgerName: string;
    },
  ): Promise<TallyDealerMapping | null> {
    if (ledger.tallyLedgerGuid) {
      const byGuid = await mappings.findOne({
        where: {
          tallyCompanyName: ledger.tallyCompanyName,
          tallyLedgerGuid: ledger.tallyLedgerGuid,
        },
      });
      if (byGuid) return byGuid;
    }
    const candidates = await mappings.find({
      where: { tallyCompanyName: ledger.tallyCompanyName },
    });
    return candidates.find(
      (candidate) =>
        this.normalizedKey(candidate.tallyLedgerName) ===
        this.normalizedKey(ledger.tallyLedgerName),
    ) ?? null;
  }

  private async ledgerForMapping(mapping: TallyDealerMapping) {
    return this.findLedgerForMapping(this.repository.dealers.manager, mapping);
  }

  private async findLedgerForMapping(
    manager: EntityManager,
    mapping: TallyDealerMapping,
  ) {
    if (mapping.tallyLedgerGuid) {
      const byGuid = await manager.getRepository(TallyLedger).findOne({
        where: {
          tallyCompanyName: mapping.tallyCompanyName,
          tallyLedgerGuid: mapping.tallyLedgerGuid,
        },
      });
      if (byGuid) return byGuid;
    }
    return this.findLedgerByBillingName(
      manager,
      mapping.tallyCompanyName,
      mapping.tallyLedgerName,
    );
  }

  private async findLedgerByBillingName(
    manager: EntityManager,
    companyName: string,
    billingName: string,
  ) {
    const ledgers = await manager.getRepository(TallyLedger).find({
      where: { tallyCompanyName: companyName.trim() },
    });
    const normalized = this.normalizedKey(billingName);
    return ledgers.find(
      (ledger) => this.normalizedKey(ledger.tallyLedgerName) === normalized,
    ) ?? null;
  }

  private async applyMappingToLedger(
    manager: EntityManager,
    ledger: { id: string; tallyCompanyName: string; normalizedLedgerName: string; dealerId?: string | null; mappingStatus: TallyLedgerMappingStatus },
    mapping: TallyDealerMapping,
  ): Promise<void> {
    const mappedDealerId = mapping.isActive ? mapping.dealerId : null;
    ledger.dealerId = mappedDealerId;
    ledger.mappingStatus = mapping.isActive
      ? TallyLedgerMappingStatus.MAPPED
      : TallyLedgerMappingStatus.UNMAPPED;
    await manager.getRepository(TallyLedger).save(ledger);
    await Promise.all([
      manager.getRepository(DealerInvoice)
        .createQueryBuilder()
        .update(DealerInvoice)
        .set({ dealerId: mappedDealerId, tallyLedgerId: mappedDealerId ? ledger.id : null })
        .where('tally_company_name = :companyName', { companyName: ledger.tallyCompanyName })
        .andWhere('normalized_party_ledger_name = :ledgerName', { ledgerName: ledger.normalizedLedgerName })
        .execute(),
      manager.getRepository(DealerPayment)
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

  private normalizedKey(value: string): string {
    return value
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('en-US');
  }

  private logDealerSummary(
    userId: string,
    dealer: Dealer,
    mapping: TallyDealerMapping | null,
    ledger: TallyLedger | null,
    summary: Record<string, unknown>,
  ): void {
    if (process.env.TALLY_DIAGNOSTICS !== 'true') return;
    this.logger.log({
      event: 'tally_dealer_summary',
      userId,
      dealerId: dealer.id,
      dealerName: dealer.businessName,
      mappingFound: Boolean(mapping),
      mappingLedgerName: mapping?.tallyLedgerName ?? null,
      ledgerFound: Boolean(ledger),
      ledgerDealerId: ledger?.dealerId ?? null,
      ledgerMappingStatus: ledger?.mappingStatus ?? null,
      closingBalance: summary.closingBalance,
      lastSyncedAt: summary.lastSyncedAt,
      invoiceCount: summary.invoiceCount,
      paymentCount: summary.paymentCount,
      returnedMappingStatus: summary.mappingStatus,
    });
  }
}
