import { BadRequestException } from '@nestjs/common';

import { StockService } from './stock.service';

describe('StockService', () => {
  const repository = {
    transaction: jest.fn(),
    findAdminStockForDate: jest.fn(),
    findCatalogueStockForDate: jest.fn(),
  };
  const service = new StockService(repository as never);

  beforeEach(() => jest.resetAllMocks());

  it('rejects duplicate products in one bulk stock update', async () => {
    await expect(
      service.setAdminStockForDate('2026-07-26', {
        items: [
          { productId: 'product-1', quantity: 1 },
          { productId: 'product-1', quantity: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('reads stock as of the current application date through the catalogue repository query', async () => {
    repository.findCatalogueStockForDate.mockResolvedValue([]);

    await expect(service.getTodayStock()).resolves.toEqual([]);
    expect(repository.findCatalogueStockForDate).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('passes an explicitly requested historical date to the catalogue repository query', async () => {
    repository.findCatalogueStockForDate.mockResolvedValue([]);

    await expect(service.getTodayStock('2026-07-27')).resolves.toEqual([]);

    expect(repository.findCatalogueStockForDate).toHaveBeenCalledWith(
      '2026-07-27',
    );
  });

  it('returns availability without exact quantities for a dealer', async () => {
    repository.findCatalogueStockForDate.mockResolvedValue([
      {
        productId: 'product-1',
        productName: 'Battery',
        sku: 'BAT-1',
        unit: 'PIECE',
        unitPrice: '12500.00',
        categoryId: 'category-1',
        categoryName: 'Battery',
        quantity: 48,
        stockDate: '2026-07-31',
        sourceStockDate: '2026-07-31',
        isCarriedForward: false,
        isAvailable: true,
        stockUpdatedAt: new Date('2026-07-31T10:00:00.000Z'),
      },
    ]);

    const items = await service.getDealerStockAvailability('2026-07-31');
    expect(items).toEqual([
      expect.objectContaining({
        productId: 'product-1',
        isAvailable: true,
      }),
    ]);
    const [item] = items;
    expect(item).not.toHaveProperty('quantity');
    expect(item).not.toHaveProperty('unitPrice');
  });

  it('rejects a non-ISO stock-as-of date', () => {
    expect(() => service.getTodayStock('27-07-2026')).toThrow(
      BadRequestException,
    );
    expect(repository.findCatalogueStockForDate).not.toHaveBeenCalled();
  });

  it('rejects a zero staff stock reduction before starting a transaction', async () => {
    await expect(
      service.reduceStockForStaff('staff-1', {
        productId: 'product-1',
        quantityToReduce: 0,
        stockDate: '2026-08-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.transaction).not.toHaveBeenCalled();
  });
});
