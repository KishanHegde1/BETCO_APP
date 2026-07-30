import { NotFoundException } from '@nestjs/common';

import { TallyReadService } from './tally-read.service';

describe('TallyReadService dealer isolation', () => {
  const repository = {
    dealers: { findOneBy: jest.fn() },
    ledgers: { findOne: jest.fn() },
    invoices: { findOneBy: jest.fn() },
    payments: { findOneBy: jest.fn() },
  };
  const service = new TallyReadService(repository as never);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.dealers.findOneBy.mockResolvedValue({ id: 'dealer-a' });
  });

  it('returns an explicit not-mapped summary without attempting to infer a dealer', async () => {
    repository.ledgers.findOne.mockResolvedValue(null);

    await expect(service.dealerSummary('user-a')).resolves.toMatchObject({
      dealerId: 'dealer-a',
      mappingStatus: 'NOT_MAPPED',
      outstandingAmount: 0,
    });
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
