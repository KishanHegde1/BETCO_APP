import { ConflictException } from '@nestjs/common';

import { UserRole } from '../common/constants/user-role.enum';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  const usersService = {
    findActiveById: jest.fn(),
    findByUsername: jest.fn(),
    save: jest.fn(),
  };
  const dealersService = {
    findByUserId: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const service = new ProfileService(
    usersService as never,
    dealersService as never,
  );
  const user = {
    id: 'user-1',
    username: 'dealer',
    phone: '9876543210',
    role: UserRole.USER,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    user.username = 'dealer';
  });

  it('returns dealer fields for the authenticated user only', async () => {
    usersService.findActiveById.mockResolvedValue(user);
    dealersService.findByUserId.mockResolvedValue({
      userId: user.id,
      businessName: 'ABC Electricals',
      phone: '+91 9876543210',
      address: 'Main Road',
    });

    await expect(service.getProfile(user.id)).resolves.toEqual({
      id: user.id,
      username: 'dealer',
      role: UserRole.USER,
      shopName: 'ABC Electricals',
      contactNumber: '+91 9876543210',
      address: 'Main Road',
    });
    expect(usersService.findActiveById).toHaveBeenCalledWith(user.id);
  });

  it('persists editable dealer fields without changing protected user fields', async () => {
    const dealer = {
      userId: user.id,
      businessName: 'Old Shop',
      phone: '9876543210',
      address: null,
    };
    usersService.findActiveById.mockResolvedValue(user);
    usersService.findByUsername.mockResolvedValue(null);
    usersService.save.mockResolvedValue(user);
    dealersService.findByUserId
      .mockResolvedValueOnce(dealer)
      .mockResolvedValueOnce(dealer);
    dealersService.save.mockResolvedValue(dealer);

    await expect(
      service.updateProfile(user.id, {
        username: 'updated_dealer',
        shopName: 'ABC Electricals',
        contactNumber: '+91 9876543210',
        address: 'Main Road',
      }),
    ).resolves.toMatchObject({
      username: 'updated_dealer',
      shopName: 'ABC Electricals',
      contactNumber: '+91 9876543210',
      address: 'Main Road',
    });
    expect(dealersService.save).toHaveBeenCalledWith(dealer);
    expect(user).toEqual({
      ...user,
      username: 'updated_dealer',
    });
  });

  it('rejects a username owned by another account', async () => {
    usersService.findActiveById.mockResolvedValue(user);
    usersService.findByUsername.mockResolvedValue({ id: 'someone-else' });

    await expect(
      service.updateProfile(user.id, { username: 'taken_name' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
