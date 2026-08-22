import { PriceListItemMatchStatus } from '../entities/price-list-item.entity';
import { Product } from '../entities/product.entity';
import { PreviewPriceListDto } from './dto/price-list.dto';
import { PriceListsService } from './price-lists.service';

describe('PriceListsService', () => {
  const priceLists = { findOne: jest.fn() };
  const priceListItems = { find: jest.fn() };
  const products = { find: jest.fn(), save: jest.fn() };
  const service = new PriceListsService(
    priceLists as never,
    priceListItems as never,
    products as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('matches product names only after exact trim, whitespace, and case normalization', async () => {
    products.find.mockResolvedValue([
      { id: 'product-1', name: '  Sun   Lite X  ' } satisfies Pick<
        Product,
        'id' | 'name'
      >,
      { id: 'product-2', name: 'RC PRO 25000' } satisfies Pick<
        Product,
        'id' | 'name'
      >,
    ]);
    priceLists.findOne.mockResolvedValue(null);

    const result = await service.preview({
      name: 'August supplier list',
      effectiveDate: '2026-08-22',
      items: [
        { modelName: 'sun lite x', gstIncludedPrice: 12500 },
        { modelName: 'RC 25000', gstIncludedPrice: 9000 },
      ],
    } satisfies PreviewPriceListDto);

    expect(result.rows[0]).toMatchObject({
      productId: 'product-1',
      productName: '  Sun   Lite X  ',
      matchStatus: PriceListItemMatchStatus.MATCHED,
      status: 'MATCHED',
    });
    expect(result.rows[1]).toMatchObject({
      productId: null,
      matchStatus: PriceListItemMatchStatus.UNMATCHED,
      status: 'UNMATCHED',
    });
    expect(products.save).not.toHaveBeenCalled();
  });

  it('shows changed and unchanged GST-included prices against the active list', async () => {
    products.find.mockResolvedValue([
      { id: 'product-1', name: 'Inverter One' } satisfies Pick<
        Product,
        'id' | 'name'
      >,
      { id: 'product-2', name: 'Inverter Two' } satisfies Pick<
        Product,
        'id' | 'name'
      >,
    ]);
    priceLists.findOne.mockResolvedValue({ id: 'active-list' });
    priceListItems.find.mockResolvedValue([
      {
        productId: 'product-1',
        gstIncludedPrice: '10000.00',
      },
      {
        productId: 'product-2',
        gstIncludedPrice: '12000.00',
      },
    ]);

    const result = await service.preview({
      name: 'September supplier list',
      effectiveDate: '2026-09-01',
      items: [
        { modelName: ' inverter one ', gstIncludedPrice: 10000 },
        { modelName: 'INVERTER TWO', gstIncludedPrice: 12500 },
      ],
    } satisfies PreviewPriceListDto);

    expect(result.unchangedCount).toBe(1);
    expect(result.priceChangedCount).toBe(1);
    expect(result.rows.map((row) => row.status)).toEqual([
      'UNCHANGED',
      'PRICE_CHANGED',
    ]);
    expect(result.rows[1]).toMatchObject({
      oldGstIncludedPrice: '12000.00',
      gstIncludedPrice: '12500.00',
    });
  });
});
