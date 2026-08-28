import { AccountDeletionRequestStatus } from '../entities/account-deletion-request.entity';
import { LegalService } from './legal.service';

describe('LegalService', () => {
  const deletionRequests = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const service = new LegalService(deletionRequests as never);

  beforeEach(() => jest.clearAllMocks());

  it('stores a pending account-deletion request with trimmed optional details', async () => {
    const created = {
      accountIdentifier: 'dealer-001',
      contact: 'owner@example.com',
      details: 'Please remove my account.',
      status: AccountDeletionRequestStatus.PENDING,
    };
    deletionRequests.create.mockReturnValue(created);
    deletionRequests.save.mockResolvedValue({ id: 'request-1', ...created });

    await expect(
      service.createDeletionRequest({
        accountIdentifier: 'dealer-001',
        contact: 'owner@example.com',
        details: '  Please remove my account.  ',
      }),
    ).resolves.toMatchObject({
      id: 'request-1',
      status: AccountDeletionRequestStatus.PENDING,
    });

    expect(deletionRequests.create).toHaveBeenCalledWith(created);
    expect(deletionRequests.save).toHaveBeenCalledWith(created);
  });
});
