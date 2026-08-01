import { ConflictException, NotFoundException } from '@nestjs/common';

import {
  CashDeclaration,
  CashDeclarationStatus,
} from '../entities/cash-declaration.entity';
import { CashDeclarationsService } from './cash-declarations.service';

describe('CashDeclarationsService', () => {
  const transactionManager = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const declarations = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };
  const dealers = { findOne: jest.fn() };
  const service = new CashDeclarationsService(
    declarations as never,
    dealers as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    declarations.create.mockImplementation((record) => record);
    declarations.save.mockImplementation(async (record) => ({
      id: 'cash-1',
      ...record,
    }));
    declarations.manager.transaction.mockImplementation(
      (work: (manager: typeof transactionManager) => Promise<unknown>) =>
        work(transactionManager),
    );
    transactionManager.save.mockImplementation(async (record) => record);
    dealers.findOne.mockResolvedValue({ id: 'dealer-1', userId: 'dealer-user' });
  });

  it('creates an internal acknowledgement without using any Tally dependency', async () => {
    const record = await service.createForDealer('dealer-user', {
      amount: '5000.50',
      cashGivenAt: '2026-08-01T10:00:00.000Z',
      note: 'Handed to office',
    });

    expect(record).toMatchObject({
      dealerId: 'dealer-1',
      amount: '5000.50',
      status: CashDeclarationStatus.PENDING,
      note: 'Handed to office',
    });
    expect(declarations.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        tallyLedgerId: expect.anything(),
        tallyVoucherGuid: expect.anything(),
      }),
    );
  });

  it('marks a pending record received by the authenticated staff or admin user', async () => {
    const declaration = {
      id: 'cash-1',
      status: CashDeclarationStatus.PENDING,
      receivedBy: null,
      receivedAt: null,
    };
    transactionManager.findOne.mockResolvedValue(declaration);

    const saved = await service.markReceived('cash-1', 'staff-user-1');

    expect(saved).toMatchObject({
      status: CashDeclarationStatus.RECEIVED,
      receivedBy: 'staff-user-1',
    });
    expect(transactionManager.save).toHaveBeenCalledWith(declaration);
  });

  it('does not allow the same record to be marked received twice', async () => {
    transactionManager.findOne.mockResolvedValue({
      id: 'cash-1',
      status: CashDeclarationStatus.RECEIVED,
    });

    await expect(service.markReceived('cash-1', 'admin-user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a cash acknowledgement for an account without a dealer profile', async () => {
    dealers.findOne.mockResolvedValue(null);

    await expect(
      service.createForDealer('staff-user', { amount: '100' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
