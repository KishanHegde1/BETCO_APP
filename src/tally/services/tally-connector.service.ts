import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';

import { formatBusinessDate } from '../../common/utils/business-date.util';
import {
  Dealer,
  DealerInvoice,
  DealerInvoiceItem,
  DealerPayment,
  TallyDealerMapping,
  TallyMappingMethod,
  TallySyncCheckpoint,
  TallySyncRun,
  TallySyncRunStatus,
  User,
} from '../../entities';
import { TallySyncRepository } from '../../repositories/tally-sync.repository';
import {
  TallyInvoiceSyncDto,
  TallyLedgerSyncDto,
  TallyPaymentSyncDto,
  TallySyncRequestDto,
} from '../dto/tally-sync-request.dto';

type MappingPriority = Exclude<TallyMappingMethod, 'MANUAL'>;

export interface TallySyncResult {
  syncRunId: string;
  checkpointToken?: string;
  ledgersProcessed: number;
  invoicesProcessed: number;
  paymentsProcessed: number;
  unmatchedRecords: number;
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
  constructor(
    private readonly repository: TallySyncRepository,
    private readonly configService: ConfigService,
  ) {}

  async sync(payload: TallySyncRequestDto): Promise<TallySyncResult> {
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
          where: { tallyCompanyName: companyName },
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
        const mappingForLedger = new Map<string, TallyDealerMapping>();
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
          }
        }

        for (const invoice of payload.invoices) {
          const mapping = await this.resolveVoucherMapping(
            manager,
            companyName,
            invoice,
            mappingForLedger,
            mappingsByLedgerKey,
          );
          if (!mapping) {
            unmatchedRecords += 1;
            continue;
          }
          await this.upsertInvoice(manager, companyName, mapping, invoice);
        }

        for (const payment of payload.payments) {
          const mapping = await this.resolveVoucherMapping(
            manager,
            companyName,
            payment,
            mappingForLedger,
            mappingsByLedgerKey,
          );
          if (!mapping) {
            unmatchedRecords += 1;
            continue;
          }
          await this.upsertPayment(manager, companyName, mapping, payment);
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
        };
      });

      run.status = TallySyncRunStatus.SUCCEEDED;
      run.finishedAt = new Date(payload.syncCompletedAt);
      run.ledgerCount = payload.ledgers.length;
      run.invoiceCount = payload.invoices.length;
      run.paymentCount = payload.payments.length;
      run.unmatchedCount = result.unmatchedRecords;
      await this.repository.syncRuns.save(run);
      return {
        syncRunId: run.id,
        checkpointToken: result.checkpointToken,
        ledgersProcessed: payload.ledgers.length,
        invoicesProcessed: payload.invoices.length,
        paymentsProcessed: payload.payments.length,
        unmatchedRecords: result.unmatchedRecords,
      };
    } catch (error) {
      run.status = TallySyncRunStatus.FAILED;
      run.finishedAt = new Date();
      run.errorMessage = this.safeErrorMessage(error);
      await this.repository.syncRuns.save(run);
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

    const match = await this.findDealerMatch(manager, ledger);
    if (!match) return undefined;
    const mappings = manager.getRepository(TallyDealerMapping);
    const mapping = await mappings.save(
      mappings.create({
        dealerId: match.dealerId,
        tallyCompanyName: companyName,
        tallyLedgerGuid: ledger.guid?.trim() || undefined,
        tallyLedgerName: ledger.name.trim(),
        mappingMethod: match.method,
        lastClosingBalance: this.money(ledger.closingBalance),
        lastSyncedAt: new Date(),
      }),
    );
    cache.set(this.normalizedKey(ledger.name), mapping);
    if (ledger.guid) cache.set(ledger.guid, mapping);
    return mapping;
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

  private async findDealerMatch(
    manager: EntityManager,
    ledger: Pick<TallyLedgerSyncDto, 'gstin' | 'dealerCode' | 'phone' | 'name'>,
  ): Promise<{ dealerId: string; method: MappingPriority } | undefined> {
    for (const method of this.mappingPriority()) {
      const value = this.valueForMethod(ledger, method);
      if (!value) continue;
      const query = manager
        .getRepository(Dealer)
        .createQueryBuilder('dealer')
        .innerJoin(User, 'appUser', 'appUser.id = dealer.user_id')
        .select('dealer.id', 'dealerId');
      switch (method) {
        case 'GSTIN':
          query.where('UPPER(TRIM(dealer.gstin)) = UPPER(TRIM(:value))', {
            value,
          });
          break;
        case 'DEALER_CODE':
          query.where('LOWER(TRIM(dealer.dealer_code)) = LOWER(TRIM(:value))', {
            value,
          });
          break;
        case 'PHONE':
          query.where(
            '(dealer.phone = :value OR dealer.contact_number = :value OR appUser.phone = :value)',
            { value },
          );
          break;
        case 'NAME':
          query.where(
            "(LOWER(TRIM(dealer.business_name)) = LOWER(TRIM(:value)) OR LOWER(TRIM(COALESCE(dealer.shop_name, ''))) = LOWER(TRIM(:value)) OR LOWER(TRIM(appUser.username)) = LOWER(TRIM(:value)))",
            { value },
          );
          break;
      }
      const candidates = await query.getRawMany<{ dealerId: string }>();
      if (candidates.length === 1) {
        return { dealerId: candidates[0].dealerId, method };
      }
    }
    return undefined;
  }

  private async upsertInvoice(
    manager: EntityManager,
    companyName: string,
    mapping: TallyDealerMapping,
    input: TallyInvoiceSyncDto,
  ): Promise<void> {
    const invoices = manager.getRepository(DealerInvoice);
    let invoice = await invoices.findOneBy({
      tallyCompanyName: companyName,
      tallyVoucherGuid: input.guid,
    });
    if (!invoice) {
      invoice = invoices.create({
        tallyCompanyName: companyName,
        tallyVoucherGuid: input.guid,
        dealerId: mapping.dealerId,
        invoiceNumber: input.voucherNumber.trim(),
        invoiceDate: input.voucherDate,
        voucherType: input.voucherType.trim(),
        partyLedgerName: input.partyLedgerName.trim(),
        invoiceAmount: '0.00',
        pendingAmount: '0.00',
        discountAmount: '0.00',
        taxAmount: '0.00',
        syncedAt: new Date(),
      });
    }
    invoice.dealerId = mapping.dealerId;
    invoice.invoiceNumber = input.voucherNumber.trim();
    invoice.invoiceDate = input.voucherDate;
    invoice.tallyMasterId = input.masterId?.trim() || undefined;
    invoice.tallyAlterId = input.alterId?.trim() || undefined;
    invoice.voucherType = input.voucherType.trim();
    invoice.partyLedgerName = input.partyLedgerName.trim();
    invoice.invoiceAmount = this.money(input.amount);
    invoice.pendingAmount = this.money(input.pendingAmount);
    invoice.discountAmount = this.money(input.discountAmount);
    invoice.taxAmount = this.money(input.taxAmount);
    invoice.isCancelled = input.isCancelled ?? false;
    invoice.syncedAt = new Date();
    invoice.sourceMetadata = {
      sourceKey: input.sourceKey,
      ...(input.invoicePdfMetadata
        ? { invoicePdfMetadata: input.invoicePdfMetadata }
        : {}),
    };
    invoice = await invoices.save(invoice);

    const items = manager.getRepository(DealerInvoiceItem);
    await items.delete({ invoiceId: invoice.id });
    if (input.items.length > 0) {
      await items.save(
        input.items.map((item, index) =>
          items.create({
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
          }),
        ),
      );
    }
  }

  private async upsertPayment(
    manager: EntityManager,
    companyName: string,
    mapping: TallyDealerMapping,
    input: TallyPaymentSyncDto,
  ): Promise<void> {
    const payments = manager.getRepository(DealerPayment);
    let payment = await payments.findOneBy({
      tallyCompanyName: companyName,
      tallyVoucherGuid: input.guid,
    });
    if (!payment) {
      payment = payments.create({
        dealerId: mapping.dealerId,
        tallyCompanyName: companyName,
        tallyVoucherGuid: input.guid,
        paymentDate: input.voucherDate,
        voucherType: input.voucherType.trim(),
        partyLedgerName: input.partyLedgerName.trim(),
        amount: '0.00',
        syncedAt: new Date(),
      });
    }
    payment.dealerId = mapping.dealerId;
    payment.paymentDate = input.voucherDate;
    payment.tallyMasterId = input.masterId?.trim() || undefined;
    payment.tallyAlterId = input.alterId?.trim() || undefined;
    payment.voucherNumber = input.voucherNumber.trim();
    payment.voucherType = input.voucherType.trim();
    payment.partyLedgerName = input.partyLedgerName.trim();
    payment.referenceNumber = input.referenceNumber?.trim() || undefined;
    payment.amount = this.money(input.amount);
    payment.syncedAt = new Date();
    payment.sourceMetadata = { sourceKey: input.sourceKey };
    await payments.save(payment);
  }

  private mappingPriority(): MappingPriority[] {
    const configured = this.configService
      .get<string>('tally.mappingPriority')
      ?.split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(
        (value): value is MappingPriority =>
          value === 'GSTIN' ||
          value === 'DEALER_CODE' ||
          value === 'PHONE' ||
          value === 'NAME',
      );
    return configured?.length
      ? configured
      : ['GSTIN', 'DEALER_CODE', 'PHONE', 'NAME'];
  }

  private valueForMethod(
    ledger: Pick<TallyLedgerSyncDto, 'gstin' | 'dealerCode' | 'phone' | 'name'>,
    method: MappingPriority,
  ): string | undefined {
    switch (method) {
      case 'GSTIN':
        return ledger.gstin?.trim();
      case 'DEALER_CODE':
        return ledger.dealerCode?.trim();
      case 'PHONE':
        return ledger.phone?.trim();
      case 'NAME':
        return ledger.name.trim();
    }
  }

  private money(value: number): string {
    return Math.abs(value).toFixed(2);
  }

  private quantity(value: number): string {
    return Math.abs(value).toFixed(3);
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  }

  private normalizedKey(value: string): string {
    return value.trim().toLocaleLowerCase('en-US');
  }

  private safeErrorMessage(error: unknown): string {
    const message =
      error instanceof Error ? error.message : 'Unknown sync error';
    return message.slice(0, 2000);
  }
}
