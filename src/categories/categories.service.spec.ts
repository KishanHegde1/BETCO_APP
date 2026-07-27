import { ConflictException } from '@nestjs/common';

import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const repository = {
    findByNameInsensitive: jest.fn(),
    repository: { create: jest.fn() },
    save: jest.fn(),
    findById: jest.fn(),
    hasProducts: jest.fn(),
    remove: jest.fn(),
  };
  const service = new CategoriesService(repository as never);

  beforeEach(() => jest.resetAllMocks());

  it('rejects a duplicate category name regardless of case', async () => {
    repository.findByNameInsensitive.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createForAdmin({ name: ' batteries ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.repository.create).not.toHaveBeenCalled();
  });

  it('does not delete a category that contains products', async () => {
    repository.findById.mockResolvedValue({ id: 'category-1' });
    repository.hasProducts.mockResolvedValue(true);

    await expect(service.removeForAdmin('category-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
