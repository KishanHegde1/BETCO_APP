import { NotFoundException } from '@nestjs/common';

import { TallyReadService } from './tally-read.service';

function rawOneQuery(result: Record<string, string>) {
  const query = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    getRawOne: jest.fn().mockResolvedValue(result),
  };
  for (const method of [
    query.select,
    query.addSelect,
    query.where,
    query.andWhere,
  ]) {
    method.mockReturnValue(query);
  }
  return query;
}

function invoicePageQuery(items: Record<string, unknown>[]) {
  const countQuery = { getCount: jest.fn().mockResolvedValue(items.length) };
  const query = {
    where: jest.fn(),
    andWhere: jest.fn(),
    clone: jest.fn().mockReturnValue(countQuery),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn().mockResolvedValue(items),
  };
  for (const method of [
    query.where,
    query.andWhere,
    query.orderBy,
    query.addOrderBy,
    query.skip,
    query.take,
  ]) {
    method.mockReturnValue(query);
  }
  return query;
}

function todayBillsQuery() {
  const totals = {
    select: jest.fn(),
    addSelect: jest.fn(),
    getRawOne: jest.fn().mockResolvedValue({
      totalBills: '1',
      totalAmount: '0',
      mappedBills: '1',
      unmappedBills: '0',
    }),
  };
  for (const method of [totals.select, totals.addSelect]) {
    method.mockReturnValue(totals);
  }
  const query = {
    leftJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    clone: jest.fn().mockReturnValue(totals),
    select: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue([
      {
        id: 'invoice-zero',
        tallyCompanyName: 'BETCO AQUA TRADERS',
        invoiceNumber: '2026-27-1384',
        invoiceDate: '2026-07-30',
        partyLedgerName: 'Maruti Electrical Stores',
        invoiceAmount: '0',
        dealerId: 'dealer-a',
        dealerName: 'Maruti Electrical Stores',
      },
    ]),
  };
  for (const method of [
    query.leftJoin,
    query.where,
    query.andWhere,
    query.select,
    query.orderBy,
    query.addOrderBy,
    query.skip,
    query.take,
  ]) {
    method.mockReturnValue(query);
  }
  return query;
}

describe('TallyReadService dealer isolation', () => {
  const ledgerRepository = { findOne: jest.fn() };
  const repository = {
    dealers: {
      findOneBy: jest.fn(),
      manager: { getRepository: jest.fn().mockReturnValue(ledgerRepository) },
    },
    mappings: { findOne: jest.fn() },
    ledgers: { findOne: jest.fn() },
    invoices: {
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    },
    payments: { findOne: jest.fn(), createQueryBuilder: jest.fn() },
    invoiceItems: { find: jest.fn() },
  };
  const service = new TallyReadService(repository as never);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.dealers.findOneBy.mockResolvedValue({
      id: 'dealer-a',
      businessName: 'Maruti Electrical Stores',
    });
    repository.mappings.findOne.mockResolvedValue(null);
  });

  it('returns an explicit not-mapped summary without attempting to infer a dealer', async () => {
    await expect(service.dealerSummary('user-a')).resolves.toMatchObject({
      dealerId: 'dealer-a',
      mappingStatus: 'NOT_MAPPED',
      isMapped: false,
      outstandingAmount: 0,
    });
    expect(repository.dealers.findOneBy).toHaveBeenCalledWith({ userId: 'user-a' });
  });

  it('uses the active dealer mapping for the real ledger balance, not the user id', async () => {
    repository.mappings.findOne.mockResolvedValue({
      dealerId: 'dealer-a',
      isActive: true,
      tallyCompanyName: 'BETCO AQUA TRADERS',
      tallyLedgerGuid: 'ledger-guid',
      tallyLedgerName: 'Maruti Electrical Stores',
      lastClosingBalance: '0',
      lastSyncedAt: new Date('2026-07-30T13:41:46.000Z'),
    });
    ledgerRepository.findOne.mockResolvedValue({
      id: 'ledger-a',
      dealerId: 'dealer-a',
      mappingStatus: 'MAPPED',
      openingBalance: '0',
      closingBalance: '360617',
      lastSyncedAt: new Date('2026-07-30T13:41:46.000Z'),
    });
    const invoiceTotals = rawOneQuery({ total: '0', count: '1' });
    const paymentTotals = rawOneQuery({ total: '0', count: '0' });
    repository.invoices.createQueryBuilder.mockReturnValue(invoiceTotals);
    repository.payments.createQueryBuilder.mockReturnValue(paymentTotals);
    repository.invoices.findOne.mockResolvedValue(null);
    repository.payments.findOne.mockResolvedValue(null);

    await expect(service.dealerSummary('user-a')).resolves.toMatchObject({
      dealerId: 'dealer-a',
      isMapped: true,
      tallyLedgerName: 'Maruti Electrical Stores',
      closingBalance: 360617,
      outstandingBalance: 360617,
      totalBills: 1,
      totalPayments: 0,
    });
    expect(invoiceTotals.where).toHaveBeenCalledWith(
      'invoice.dealer_id = :dealerId',
      { dealerId: 'dealer-a' },
    );
  });

  it('returns a zero-value invoice when it belongs to the resolved dealer', async () => {
    const page = invoicePageQuery([
      {
        id: 'invoice-zero',
        tallyCompanyName: 'BETCO AQUA TRADERS',
        invoiceNumber: '2026-27-1384',
        invoiceDate: '2026-07-30',
        voucherType: 'GST Sales',
        partyLedgerName: 'Maruti Electrical Stores',
        invoiceAmount: '0',
        pendingAmount: '0',
        paidAmount: '0',
        paymentStatus: 'UNKNOWN',
        pdfStatus: 'NOT_AVAILABLE',
      },
    ]);
    repository.invoices.createQueryBuilder.mockReturnValue(page);

    const result = await service.dealerInvoices('user-a', {
      page: 1,
      limit: 20,
      sortBy: 'voucherDate',
      sortOrder: 'DESC',
    } as never);

    expect(page.where).toHaveBeenCalledWith('invoice.dealer_id = :dealerId', {
      dealerId: 'dealer-a',
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        invoiceNumber: '2026-27-1384',
        invoiceAmount: 0,
        totalAmount: 0,
      }),
    ]);
  });

  it('uses the Asia/Kolkata business date when reading today’s bills', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T19:00:00.000Z'));
    const query = todayBillsQuery();
    repository.invoices.createQueryBuilder.mockReturnValue(query);

    const result = await service.adminTodayBills({
      page: 1,
      limit: 20,
      sortOrder: 'DESC',
    } as never);

    expect(query.where).toHaveBeenCalledWith('invoice.invoice_date = :date', {
      date: '2026-07-30',
    });
    expect(result).toMatchObject({
      date: '2026-07-30',
      totalBills: 1,
      totalAmount: 0,
      items: [expect.objectContaining({ invoiceNumber: '2026-27-1384', invoiceAmount: 0 })],
    });
    jest.useRealTimers();
  });

  it('always scopes an invoice detail lookup to the signed-in dealer', async () => {
    repository.invoices.findOneBy.mockResolvedValue(null);

    await expect(service.dealerInvoice('user-a', 'invoice-b')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.invoices.findOneBy).toHaveBeenCalledWith({
      id: 'invoice-b',
      dealerId: 'dealer-a',
    });
  });
});
