import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';

import { formatBusinessDate } from '../../common/utils/business-date.util';
import {
  DealerInvoice,
  DealerInvoiceItem,
  DealerPayment,
  TallyDealerMapping,
  TallyLedger,
  TallyLedgerMappingStatus,
  TallySyncCheckpoint,
  TallySyncRun,
  TallySyncRunStatus,
} from '../../entities';
import { TallySyncRepository } from '../../repositories/tally-sync.repository';
import {
  TallyInvoiceSyncDto,
  TallyLedgerSyncDto,
  TallyPaymentSyncDto,
  TallySyncRequestDto,
} from '../dto/tally-sync-request.dto';

export interface TallySyncResult {
  syncRunId: string;
  checkpointToken?: string;
  ledgersProcessed: number;
  invoicesProcessed: number;
  paymentsProcessed: number;
  unmatchedRecords: number;
  mappedRecords: number;
  ledgersInserted: number;
  ledgersUpdated: number;
  invoicesInserted: number;
  invoicesUpdated: number;
  paymentsInserted: number;
  paymentsUpdated: number;
  received: TallySyncRecordCounts;
  inserted: TallySyncRecordCounts;
  updated: TallySyncRecordCounts;
  unchanged: TallySyncRecordCounts;
  skipped: number;
}

export interface TallySyncRecordCounts {
  ledgers: number;
  invoices: number;
  payments: number;
  total: number;
}

export interface DealerLedgerSummary {
  previousOutstanding: number;
  todayBillAmount: number;
  todayPaymentAmount: number;
  currentOutstanding: number;
  lastSyncedAt: Date | null;
  source: 'TALLY' | 'NOT_SYNCED';
}

@Injectable()
export class TallyConnectorService {
  private readonly logger = new Logger(TallyConnectorService.name);

  constructor(
    private readonly repository: TallySyncRepository,
    private readonly configService: ConfigService,
  ) {}

  async sync(payload: TallySyncRequestDto): Promise<TallySyncResult> {
    this.logger.log(
      `Tally sync received: ${payload.ledgers.length} ledgers, ${payload.invoices.length} invoices, ${payload.payments.length} payments.`,
    );
    const run = await this.repository.syncRuns.save(
      this.repository.syncRuns.create({
        connectorId: payload.connectorId,
        tallyCompanyName: payload.company.name.trim(),
        status: TallySyncRunStatus.RUNNING,
        startedAt: new Date(payload.syncStartedAt),
      }),
    );

    try {
      const result = await this.repository.transaction(async (manager) => {
        const companyName = payload.company.name.trim();
        const mappings = await manager.getRepository(TallyDealerMapping).find({
          where: { tallyCompanyName: companyName, isActive: true },
        });
        const mappingsByLedgerKey = new Map<string, TallyDealerMapping>();
        for (const mapping of mappings) {
          if (mapping.tallyLedgerGuid) {
            mappingsByLedgerKey.set(mapping.tallyLedgerGuid, mapping);
          }
          mappingsByLedgerKey.set(
            this.normalizedKey(mapping.tallyLedgerName),
            mapping,
          );
        }

        let unmatchedRecords = 0;
        let mappedRecords = 0;
        let ledgersInserted = 0;
        let ledgersUpdated = 0;
        let invoicesInserted = 0;
        let invoicesUpdated = 0;
        let paymentsInserted = 0;
        let paymentsUpdated = 0;
        const mappingForLedger = new Map<string, TallyDealerMapping>();
        const persistedLedgers = new Map<string, TallyLedger>();
        for (const ledger of payload.ledgers) {
          const mapping = await this.resolveLedgerMapping(
            manager,
            companyName,
            ledger,
            mappingsByLedgerKey,
          );
          if (mapping) {
            mappingForLedger.set(ledger.sourceKey, mapping);
            if (ledger.guid) mappingForLedger.set(ledger.guid, mapping);
            mappingForLedger.set(this.normalizedKey(ledger.name), mapping);
            mappedRecords += 1;
          }
          const persisted = await this.upsertLedger(
            manager,
            companyName,
            ledger,
            mapping,
          );
          if (persisted.inserted) ledgersInserted += 1;
          else ledgersUpdated += 1;
          persistedLedgers.set(ledger.sourceKey, persisted.ledger);
          if (ledger.guid) persistedLedgers.set(ledger.guid, persisted.ledger);
          persistedLedgers.set(this.normalizedKey(ledger.name), persisted.ledger);
        }

        for (const invoice of payload.invoices) {
          const mapping = await this.resolveVoucherMapping(
            manager,
            companyName,
            invoice,
            mappingForLedger,
            mappingsByLedgerKey,
          );
          const ledger =
            (invoice.partyLedgerGuid
              ? persistedLedgers.get(invoice.partyLedgerGuid)
              : undefined) ??
            persistedLedgers.get(this.normalizedKey(invoice.partyLedgerName));
          if (!mapping) unmatchedRecords += 1;
          else mappedRecords += 1;
          const inserted = await this.upsertInvoice(
            manager,
            companyName,
            mapping,
            ledger,
            invoice,
          );
          if (inserted) invoicesInserted += 1;
          else invoicesUpdated += 1;
        }

        for (const payment of payload.payments) {
          const mapping = await this.resolveVoucherMapping(
            manager,
            companyName,
            payment,
            mappingForLedger,
            mappingsByLedgerKey,
          );
          const ledger =
            (payment.partyLedgerGuid
              ? persistedLedgers.get(payment.partyLedgerGuid)
              : undefined) ??
            persistedLedgers.get(this.normalizedKey(payment.partyLedgerName));
          if (!mapping) unmatchedRecords += 1;
          else mappedRecords += 1;
          const inserted = await this.upsertPayment(
            manager,
            companyName,
            mapping,
            ledger,
            payment,
          );
          if (inserted) paymentsInserted += 1;
          else paymentsUpdated += 1;
        }

        const checkpoints = manager.getRepository(TallySyncCheckpoint);
        let checkpoint = await checkpoints.findOneBy({
          connectorId: payload.connectorId,
          tallyCompanyName: companyName,
        });
        if (!checkpoint) {
          checkpoint = checkpoints.create({
            connectorId: payload.connectorId,
            tallyCompanyName: companyName,
          });
        }
        checkpoint.checkpointToken =
          payload.checkpointToken?.trim() || undefined;
        checkpoint.lastSuccessfulSyncAt = new Date(payload.syncCompletedAt);
        await checkpoints.save(checkpoint);

        return {
          checkpointToken: checkpoint.checkpointToken,
          unmatchedRecords,
          mappedRecords,
          ledgersInserted,
          ledgersUpdated,
          invoicesInserted,
          invoicesUpdated,
          paymentsInserted,
          paymentsUpdated,
        };
      });

      run.status = TallySyncRunStatus.SUCCEEDED;
      run.finishedAt = new Date(payload.syncCompletedAt);
      run.ledgerCount = payload.ledgers.length;
      run.invoiceCount = payload.invoices.length;
      run.paymentCount = payload.payments.length;
      run.unmatchedCount = result.unmatchedRecords;
      run.mappedCount = result.mappedRecords;
      run.ledgerInsertedCount = result.ledgersInserted;
      run.ledgerUpdatedCount = result.ledgersUpdated;
      run.invoiceInsertedCount = result.invoicesInserted;
      run.invoiceUpdatedCount = result.invoicesUpdated;
      run.paymentInsertedCount = result.paymentsInserted;
      run.paymentUpdatedCount = result.paymentsUpdated;
      await this.repository.syncRuns.save(run);
      this.logger.log(
        `Read-only Tally sync ${run.id} completed: ${payload.ledgers.length} ledgers, ${payload.invoices.length} invoices, ${payload.payments.length} payments.`,
      );
      const received = this.recordCounts(
        payload.ledgers.length,
        payload.invoices.length,
        payload.payments.length,
      );
      const inserted = this.recordCounts(
        result.ledgersInserted,
        result.invoicesInserted,
        result.paymentsInserted,
      );
      const updated = this.recordCounts(
        result.ledgersUpdated,
        result.invoicesUpdated,
        result.paymentsUpdated,
      );
      // The agent sends only its changed checkpoint records. A received
      // record therefore resolves to inserted or updated in this service.
      const unchanged = this.recordCounts(0, 0, 0);
      const response = {
        syncRunId: run.id,
        checkpointToken: result.checkpointToken,
        ledgersProcessed: payload.ledgers.length,
        invoicesProcessed: payload.invoices.length,
        paymentsProcessed: payload.payments.length,
        unmatchedRecords: result.unmatchedRecords,
        mappedRecords: result.mappedRecords,
        ledgersInserted: result.ledgersInserted,
        ledgersUpdated: result.ledgersUpdated,
        invoicesInserted: result.invoicesInserted,
        invoicesUpdated: result.invoicesUpdated,
        paymentsInserted: result.paymentsInserted,
        paymentsUpdated: result.paymentsUpdated,
        received,
        inserted,
        updated,
        unchanged,
        skipped: unchanged.total,
      };
      this.logger.log(
        `Tally sync ${run.id} result: received ${received.total}; inserted ${inserted.total}; updated ${updated.total}; unchanged ${unchanged.total}; unmatched ${result.unmatchedRecords}.`,
      );
      return response;
    } catch (error) {
      run.status = TallySyncRunStatus.FAILED;
      run.finishedAt = new Date();
      run.errorMessage = this.safeErrorMessage(error);
      await this.repository.syncRuns.save(run);
      this.logger.error(
        `Read-only Tally sync ${run.id} failed: ${run.errorMessage}`,
      );
      throw error;
    }
  }

  async getDealerSummary(userId: string): Promise<DealerLedgerSummary> {
    const dealer = await this.repository.dealers.findOneBy({ userId });
    if (!dealer) {
      throw new NotFoundException('Dealer profile not found.');
    }
    const mapping = await this.repository.mappings.findOne({
      where: { dealerId: dealer.id },
      order: { lastSyncedAt: 'DESC' },
    });
    if (!mapping) {
      return {
        previousOutstanding: 0,
        todayBillAmount: 0,
        todayPaymentAmount: 0,
        currentOutstanding: 0,
        lastSyncedAt: null,
        source: 'NOT_SYNCED',
      };
    }

    const today = formatBusinessDate(new Date());
    const [invoiceRow, paymentRow] = await Promise.all([
      this.repository.invoices
        .createQueryBuilder('invoice')
        .select('COALESCE(SUM(invoice.invoice_amount), 0)', 'total')
        .where('invoice.dealer_id = :dealerId', { dealerId: dealer.id })
        .andWhere('invoice.invoice_date = :today', { today })
        .andWhere('invoice.is_cancelled = false')
        .getRawOne<{ total: string }>(),
      this.repository.payments
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)', 'total')
        .where('payment.dealer_id = :dealerId', { dealerId: dealer.id })
        .andWhere('payment.payment_date = :today', { today })
        .getRawOne<{ total: string }>(),
    ]);
    const todayBillAmount = this.toNumber(invoiceRow?.total);
    const todayPaymentAmount = this.toNumber(paymentRow?.total);
    const currentOutstanding = this.toNumber(mapping.lastClosingBalance);
    return {
      previousOutstanding: Math.max(
        0,
        currentOutstanding - todayBillAmount + todayPaymentAmount,
      ),
      todayBillAmount,
      todayPaymentAmount,
      currentOutstanding,
      lastSyncedAt: mapping.lastSyncedAt ?? null,
      source: 'TALLY',
    };
  }

  findRecentRuns(limit = 50): Promise<TallySyncRun[]> {
    return this.repository.syncRuns.find({
      order: { startedAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  private async resolveLedgerMapping(
    manager: EntityManager,
    companyName: string,
    ledger: TallyLedgerSyncDto,
    cache: Map<string, TallyDealerMapping>,
  ): Promise<TallyDealerMapping | undefined> {
    const existing =
      (ledger.guid && cache.get(ledger.guid)) ??
      cache.get(this.normalizedKey(ledger.name));
    if (existing) {
      existing.tallyLedgerName = ledger.name.trim();
      existing.tallyLedgerGuid =
        ledger.guid?.trim() || existing.tallyLedgerGuid;
      existing.lastClosingBalance = this.money(ledger.closingBalance);
      existing.lastSyncedAt = new Date();
      const saved = await manager
        .getRepository(TallyDealerMapping)
        .save(existing);
      cache.set(this.normalizedKey(ledger.name), saved);
      if (ledger.guid) cache.set(ledger.guid, saved);
      return saved;
    }

    // A dealer association is authoritative only when an administrator has
    // created an active tally_dealer_mappings record.  New or renamed Tally
    // ledgers deliberately remain unmapped so that sync never assigns a
    // customer based on a fuzzy name, phone, GSTIN or dealer-code match.
    return undefined;
  }

  private async resolveVoucherMapping(
    manager: EntityManager,
    companyName: string,
    voucher: TallyInvoiceSyncDto | TallyPaymentSyncDto,
    mappings: Map<string, TallyDealerMapping>,
    mappingCache: Map<string, TallyDealerMapping>,
  ): Promise<TallyDealerMapping | undefined> {
    const known =
      (voucher.partyLedgerGuid && mappings.get(voucher.partyLedgerGuid)) ??
      mappings.get(this.normalizedKey(voucher.partyLedgerName)) ??
      (voucher.partyLedgerGuid && mappingCache.get(voucher.partyLedgerGuid)) ??
      mappingCache.get(this.normalizedKey(voucher.partyLedgerName));
    if (known) return known;

    return this.resolveLedgerMapping(
      manager,
      companyName,
      {
        sourceKey: voucher.partyLedgerGuid ?? voucher.partyLedgerName,
        guid: voucher.partyLedgerGuid,
        name: voucher.partyLedgerName,
        gstin: voucher.partyGstin,
        phone: voucher.partyPhone,
        dealerCode: voucher.dealerCode,
        openingBalance: 0,
        closingBalance: 0,
      },
      mappingCache,
    );
  }

  private async upsertInvoice(
    manager: EntityManager,
    companyName: string,
    mapping: TallyDealerMapping | undefined,
    ledger: TallyLedger | undefined,
    input: TallyInvoiceSyncDto,
  ): Promise<boolean> {
    const invoices = manager.getRepository(DealerInvoice);
    const sourceKey = this.sourceKey(input, 'invoice');
    let invoice = await invoices.findOneBy({
      tallyCompanyName: companyName,
      sourceKey,
    });
    const inserted = !invoice;
    if (!invoice) {
      invoice = invoices.create({
        tallyCompanyName: companyName,
        sourceKey,
        tallyVoucherGuid: input.guid?.trim() || sourceKey,
        dealerId: mapping?.dealerId ?? null,
        tallyLedgerId: ledger?.id ?? null,
        invoiceNumber: input.voucherNumber.trim(),
        invoiceDate: input.voucherDate,
        voucherType: input.voucherType.trim(),
        partyLedgerName: input.partyLedgerName.trim(),
        normalizedPartyLedgerName: this.normalizedKey(input.partyLedgerName),
        invoiceAmount: '0.00',
        pendingAmount: '0.00',
        discountAmount: '0.00',
        taxAmount: '0.00',
        syncedAt: new Date(),
      });
    }
    invoice.dealerId = mapping?.dealerId ?? null;
    invoice.tallyLedgerId = ledger?.id ?? null;
    invoice.invoiceNumber = input.voucherNumber.trim();
    invoice.invoiceDate = input.voucherDate;
    invoice.tallyMasterId = input.masterId?.trim() || undefined;
    invoice.tallyAlterId = input.alterId?.trim() || undefined;
    invoice.voucherType = input.voucherType.trim();
    invoice.partyLedgerName = input.partyLedgerName.trim();
    invoice.normalizedPartyLedgerName = this.normalizedKey(
      input.partyLedgerName,
    );
    invoice.invoiceAmount = this.money(input.amount);
    invoice.pendingAmount = this.money(input.pendingAmount);
    invoice.paidAmount = this.paidAmount(input.amount, input.pendingAmount);
    invoice.paymentStatus = this.paymentStatus(input.amount, input.pendingAmount);
    invoice.discountAmount = this.money(input.discountAmount);
    invoice.taxAmount = this.money(input.taxAmount);
    invoice.isCancelled = input.isCancelled ?? false;
    invoice.syncedAt = new Date();
    invoice.pdfUrl = this.safePdfUrl(input.invoicePdfMetadata);
    invoice.pdfStatus = invoice.pdfUrl ? 'AVAILABLE' : 'NOT_AVAILABLE';
    invoice.sourceMetadata = {
      sourceKey,
      ...(input.invoicePdfMetadata
        ? { invoicePdfMetadata: input.invoicePdfMetadata }
        : {}),
    };
    invoice.rawPayload = input as unknown as Record<string, unknown>;
    invoice = await invoices.save(invoice);

    const items = manager.getRepository(DealerInvoiceItem);
    if (input.items.length > 0) {
      const existingItems = await items.find({ where: { invoiceId: invoice.id } });
      const byDisplayOrder = new Map(
        existingItems.map((item) => [item.displayOrder, item]),
      );
      await items.save(
        input.items.map((item, index) => {
          const row = byDisplayOrder.get(index) ?? items.create({ invoiceId: invoice.id });
          Object.assign(row, {
            invoiceId: invoice.id,
            itemName: item.itemName.trim(),
            sku: item.sku?.trim() || undefined,
            quantity: this.quantity(item.quantity),
            rate: this.money(item.rate),
            amount: this.money(item.amount),
            discountAmount: this.money(item.discountAmount),
            taxAmount: this.money(item.taxAmount),
            unit: item.unit?.trim() || undefined,
            displayOrder: index,
          });
          return row;
        }),
      );
    }
    return inserted;
  }

  private async upsertPayment(
    manager: EntityManager,
    companyName: string,
    mapping: TallyDealerMapping | undefined,
    ledger: TallyLedger | undefined,
    input: TallyPaymentSyncDto,
  ): Promise<boolean> {
    const payments = manager.getRepository(DealerPayment);
    const sourceKey = this.sourceKey(input, 'payment');
    let payment = await payments.findOneBy({
      tallyCompanyName: companyName,
      sourceKey,
    });
    const inserted = !payment;
    if (!payment) {
      payment = payments.create({
        sourceKey,
        dealerId: mapping?.dealerId ?? null,
        tallyLedgerId: ledger?.id ?? null,
        tallyCompanyName: companyName,
        tallyVoucherGuid: input.guid?.trim() || sourceKey,
        paymentDate: input.voucherDate,
        voucherType: input.voucherType.trim(),
        partyLedgerName: input.partyLedgerName.trim(),
        normalizedPartyLedgerName: this.normalizedKey(input.partyLedgerName),
        amount: '0.00',
        syncedAt: new Date(),
      });
    }
    payment.dealerId = mapping?.dealerId ?? null;
    payment.tallyLedgerId = ledger?.id ?? null;
    payment.paymentDate = input.voucherDate;
    payment.tallyMasterId = input.masterId?.trim() || undefined;
    payment.tallyAlterId = input.alterId?.trim() || undefined;
    payment.voucherNumber = input.voucherNumber.trim();
    payment.voucherType = input.voucherType.trim();
    payment.partyLedgerName = input.partyLedgerName.trim();
    payment.normalizedPartyLedgerName = this.normalizedKey(
      input.partyLedgerName,
    );
    payment.referenceNumber = input.referenceNumber?.trim() || undefined;
    payment.amount = this.money(input.amount);
    payment.syncedAt = new Date();
    payment.sourceMetadata = { sourceKey };
    payment.rawPayload = input as unknown as Record<string, unknown>;
    await payments.save(payment);
    return inserted;
  }

  private async upsertLedger(
    manager: EntityManager,
    companyName: string,
    input: TallyLedgerSyncDto,
    mapping?: TallyDealerMapping,
  ): Promise<{ ledger: TallyLedger; inserted: boolean }> {
    const ledgers = manager.getRepository(TallyLedger);
    const sourceKey = this.sourceKey(input, 'ledger');
    let ledger = await ledgers.findOneBy({ tallyCompanyName: companyName, sourceKey });
    const inserted = !ledger;
    if (!ledger) {
      ledger = ledgers.create({ tallyCompanyName: companyName, sourceKey });
    }
    ledger.tallyLedgerGuid = input.guid?.trim() || null;
    ledger.tallyLedgerName = input.name.trim();
    ledger.normalizedLedgerName = this.normalizedKey(input.name);
    ledger.parentGroup = input.parent?.trim() || null;
    ledger.phone = input.phone?.trim() || null;
    ledger.gstin = input.gstin?.trim() || null;
    ledger.openingBalance = this.money(input.openingBalance);
    ledger.closingBalance = this.money(input.closingBalance);
    ledger.dealerId = mapping?.dealerId ?? null;
    ledger.mappingStatus = mapping
      ? TallyLedgerMappingStatus.MAPPED
      : TallyLedgerMappingStatus.UNMAPPED;
    ledger.isActive = true;
    ledger.lastSyncedAt = new Date();
    const saved = await ledgers.save(ledger);
    if (mapping) {
      mapping.lastClosingBalance = saved.closingBalance;
      mapping.lastSyncedAt = saved.lastSyncedAt ?? new Date();
      await manager.getRepository(TallyDealerMapping).save(mapping);
    }
    return { ledger: saved, inserted };
  }

  private money(value: number): string {
    return Math.abs(value).toFixed(2);
  }

  private quantity(value: number): string {
    return Math.abs(value).toFixed(3);
  }

  private paidAmount(total: number, pending: number): string {
    // pendingAmount is a required Tally-agent value. It permits a safe amount
    // calculation, but we never try to allocate individual Receipt vouchers.
    if (total > 0 && pending >= 0 && pending <= total) {
      return this.money(total - pending);
    }
    return '0.00';
  }

  private paymentStatus(total: number, pending: number): string {
    if (total <= 0 || pending < 0) return 'UNKNOWN';
    if (pending === 0) return 'PAID';
    if (pending >= total) return 'PENDING';
    return 'PARTIALLY_PAID';
  }

  private safePdfUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  private sourceKey(
    input: { sourceKey?: string; guid?: string; voucherNumber?: string; voucherDate?: string; name?: string },
    kind: string,
  ): string {
    const supplied = input.sourceKey?.trim();
    if (supplied) return supplied;
    const stable = [
      kind,
      input.guid?.trim() ?? '',
      input.voucherNumber?.trim() ?? input.name?.trim() ?? '',
      input.voucherDate ?? '',
    ].join('|');
    return `${kind}:${createHash('sha256').update(stable).digest('hex')}`;
  }

  private toNumber(value: string | number | null | undefined): number {
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

  private safeErrorMessage(error: unknown): string {
    const message =
      error instanceof Error ? error.message : 'Unknown sync error';
    return message.slice(0, 2000);
  }

  private recordCounts(
    ledgers: number,
    invoices: number,
    payments: number,
  ): TallySyncRecordCounts {
    return {
      ledgers,
      invoices,
      payments,
      total: ledgers + invoices + payments,
    };
  }
}
