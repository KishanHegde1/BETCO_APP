import { ConflictException, NotFoundException } from '@nestjs/common';

import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const repository = {
    findActiveCatalogue: jest.fn(),
    findCategoryById: jest.fn(),
    findBySkuInsensitive: jest.fn(),
    repository: { create: jest.fn() },
    save: jest.fn(),
    findById: jest.fn(),
    isReferenced: jest.fn(),
    remove: jest.fn(),
  };
  const service = new ProductsService(repository as never);

  beforeEach(() => jest.resetAllMocks());

  it('rejects products assigned to an inactive category', async () => {
    repository.findCategoryById.mockResolvedValue({
      id: 'category-1',
      isActive: false,
    });

    await expect(
      service.createForAdmin({
        categoryId: 'category-1',
        sku: 'BAT-001',
        name: 'Battery',
        unit: 'PIECE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not delete a missing product', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.removeForAdmin('product-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the active dealer catalogue DTOs from one repository query', async () => {
    repository.findActiveCatalogue.mockResolvedValue([
      {
        id: 'product-1',
        sku: 'ILTT-18060-PRO',
        name: 'ILTT 18060 PRO',
        isActive: true,
        category: { id: 'category-1', name: 'Battery Inverters' },
      },
    ]);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({
        sku: 'ILTT-18060-PRO',
        category: { id: 'category-1', name: 'Battery Inverters' },
      }),
    ]);
    expect(repository.findActiveCatalogue).toHaveBeenCalledTimes(1);
  });
});
