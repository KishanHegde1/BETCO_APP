/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */

import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';

import { UserRole } from '../common/constants/user-role.enum';
import { User } from '../entities/user.entity';
import { AdminDealersService } from './admin-dealers.service';

describe('AdminDealersService', () => {
  const query = {
    select: jest.fn(),
    where: jest.fn(),
    orWhere: jest.fn(),
    andWhere: jest.fn(),
    getMany: jest.fn(),
  };
  const users = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
  const dealers = { create: jest.fn(), save: jest.fn(), findOneBy: jest.fn() };
  const manager = { getRepository: jest.fn() };
  const dataSource = {
    transaction: jest.fn(),
    getRepository: jest.fn(),
  };
  const dealersRepository = {
    findDetails: jest.fn(),
    findById: jest.fn(),
  };
  const service = new AdminDealersService(
    dealersRepository as never,
    {} as never,
    dataSource as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    query.select.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.orWhere.mockReturnValue(query);
    query.andWhere.mockReturnValue(query);
    query.getMany.mockResolvedValue([]);
    users.createQueryBuilder.mockReturnValue(query);
    users.create.mockImplementation((value) => value);
    users.save.mockImplementation(async (value) => ({
      ...value,
      id: 'user-1',
    }));
    users.findOneBy.mockResolvedValue({ id: 'user-1', email: null });
    users.update.mockResolvedValue({});
    dealers.create.mockImplementation((value) => value);
    dealers.save.mockImplementation(async (value) => ({
      ...value,
      id: 'dealer-1',
    }));
    dealers.findOneBy.mockResolvedValue({
      id: 'dealer-1',
      businessName: 'Dealer One',
      shopName: 'Dealer One',
    });
    manager.getRepository.mockImplementation((entity) =>
      entity === User ? users : dealers,
    );
    dataSource.transaction.mockImplementation((work) => work(manager));
    dataSource.getRepository.mockReturnValue(users);
    dealersRepository.findDetails.mockResolvedValue({ id: 'dealer-1' });
    dealersRepository.findById.mockResolvedValue({
      id: 'dealer-1',
      userId: 'user-1',
    });
  });

  it('creates a USER account with a bcrypt password and dealer profile', async () => {
    await service.create({
      username: 'Dealer One',
      phone: '9876543210',
      password: 'Temporary#123',
      confirmPassword: 'Temporary#123',
      email: 'dealer@example.com',
      shopName: 'Dealer One Electricals',
      address: 'Kochi',
    });

    const savedUser = users.save.mock.calls[0][0] as {
      passwordHash: string;
      role: UserRole;
      mustChangePassword: boolean;
    };
    expect(savedUser.role).toBe(UserRole.USER);
    expect(savedUser.mustChangePassword).toBe(true);
    await expect(
      bcrypt.compare('Temporary#123', savedUser.passwordHash),
    ).resolves.toBe(true);
    expect(dealers.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        businessName: 'Dealer One Electricals',
      }),
    );
  });

  it('resets a dealer password as bcrypt and requires a password change', async () => {
    await service.resetPassword('dealer-1', {
      password: 'NewPassword#123',
      confirmPassword: 'NewPassword#123',
    });

    const update = users.update.mock.calls[0][1] as {
      passwordHash: string;
      mustChangePassword: boolean;
    };
    expect(update.mustChangePassword).toBe(true);
    await expect(
      bcrypt.compare('NewPassword#123', update.passwordHash),
    ).resolves.toBe(true);
  });

  it('validates an Excel file without returning passwords in its preview', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Dealers');
    sheet.addRow(['username', 'phone', 'password', 'shop_name']);
    sheet.addRow(['New Dealer', '9876543210', 'Temporary#123', 'New Shop']);
    const workbookBytes = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(workbookBytes);

    const preview = await service.validateImport({
      originalname: 'dealers.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      buffer,
    });

    expect(preview.validRows).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      username: 'New Dealer',
      valid: true,
    });
    expect(JSON.stringify(preview)).not.toContain('Temporary#123');
  });
});
