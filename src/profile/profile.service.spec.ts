import { ConflictException } from '@nestjs/common';

import { UserRole } from '../common/constants/user-role.enum';
import { Dealer } from '../entities/dealer.entity';
import { User } from '../entities/user.entity';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  const user = {
    id: 'user-1',
    username: 'dealer',
    phone: '9876543210',
    role: UserRole.USER,
    isActive: true,
  } as User;
  const usersRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
  };
  const dealersRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity: typeof User | typeof Dealer) =>
      entity === User ? usersRepository : dealersRepository,
    ),
  };
  const usersService = {
    findActiveById: jest.fn(),
    usersRepository: {
      repository: {
        manager: {
          transaction: jest.fn(
            (callback: (transactionManager: typeof manager) => unknown) =>
              callback(manager),
          ),
        },
      },
    },
  };
  const dealersService = { findByUserId: jest.fn() };
  const service = new ProfileService(
    usersService as never,
    dealersService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    user.username = 'dealer';
    usersService.usersRepository.repository.manager.transaction.mockImplementation(
      (callback: (transactionManager: typeof manager) => unknown) =>
        callback(manager),
    );
    manager.getRepository.mockImplementation(
      (entity: typeof User | typeof Dealer) =>
        entity === User ? usersRepository : dealersRepository,
    );
    usersRepository.findOne.mockResolvedValue(user);
    usersRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    });
    usersRepository.save.mockImplementation((value: User) =>
      Promise.resolve(value),
    );
    dealersRepository.save.mockImplementation((value: Dealer) =>
      Promise.resolve(value),
    );
  });

  it('returns the authenticated user profile only', async () => {
    usersService.findActiveById.mockResolvedValue(user);
    dealersService.findByUserId.mockResolvedValue({
      userId: user.id,
      businessName: 'ABC Electricals',
      shopName: 'ABC Electricals',
      phone: '+91 9876543210',
      contactNumber: '+91 9876543210',
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
  });

  it('creates a missing dealer row while updating a USER profile', async () => {
    const createdDealer = {
      userId: user.id,
      businessName: 'ABC Electricals',
      shopName: 'ABC Electricals',
      phone: '+91 9876543210',
      contactNumber: '+91 9876543210',
      address: 'Main Road',
    } as Dealer;
    dealersRepository.findOne.mockResolvedValue(null);
    dealersRepository.create.mockReturnValue(createdDealer);

    await expect(
      service.updateProfile(user.id, {
        shopName: 'ABC Electricals',
        contactNumber: '+91 9876543210',
        address: 'Main Road',
      }),
    ).resolves.toMatchObject({
      shopName: 'ABC Electricals',
      contactNumber: '+91 9876543210',
      address: 'Main Road',
    });

    expect(dealersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id }),
    );
    expect(dealersRepository.save).toHaveBeenCalledWith(createdDealer);
  });

  it('updates an existing dealer row without creating a duplicate', async () => {
    const existingDealer = {
      userId: user.id,
      businessName: 'Old Shop',
      shopName: 'Old Shop',
      phone: '9876543210',
      contactNumber: '9876543210',
      address: null,
    } as Dealer;
    dealersRepository.findOne.mockResolvedValue(existingDealer);

    await service.updateProfile(user.id, {
      shopName: 'First Shop',
      contactNumber: '+91 9876543210',
    });
    await service.updateProfile(user.id, {
      shopName: 'Second Shop',
      address: 'Main Road',
    });

    expect(dealersRepository.create).not.toHaveBeenCalled();
    expect(dealersRepository.save).toHaveBeenCalledTimes(2);
    expect(existingDealer).toMatchObject({
      userId: user.id,
      shopName: 'Second Shop',
      address: 'Main Road',
    });
  });

  it('rejects a username owned by another account', async () => {
    usersRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'someone-else' }),
    });

    await expect(
      service.updateProfile(user.id, { username: 'taken_name' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
