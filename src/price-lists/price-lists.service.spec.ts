import pdfParse from 'pdf-parse';

import { PriceListItemMatchStatus } from '../entities/price-list-item.entity';
import { Product } from '../entities/product.entity';
import { PreviewPriceListDto } from './dto/price-list.dto';
import { PriceListsService } from './price-lists.service';

jest.mock('pdf-parse', () => jest.fn());

describe('PriceListsService', () => {
  const priceLists = { findOne: jest.fn(), findOneBy: jest.fn() };
  const priceListItems = { find: jest.fn(), save: jest.fn() };
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

  it('extracts only the explicitly labelled GST-included price column from a PDF', async () => {
    (pdfParse as jest.Mock).mockResolvedValue({
      numpages: 1,
      text: [
        'Sl No\tModel\tGST Included Price\tMRP',
        '1\tInverter 10036\t10,000.00\t12,000.00',
        '2\tSolar Wire 90m\t5,500.50\t6,000.00',
      ].join('\n'),
    });

    const result = await service.extractPdf({
      buffer: Buffer.from('%PDF-example'),
      originalname: 'supplier-price-list.pdf',
      size: 12,
    });

    expect(result).toMatchObject({
      fileName: 'supplier-price-list.pdf',
      pageCount: 1,
      rows: [
        { rowNumber: 1, modelName: 'Inverter 10036', gstIncludedPrice: 10000 },
        { rowNumber: 2, modelName: 'Solar Wire 90m', gstIncludedPrice: 5500.5 },
      ],
    });
  });

  it('handles PDFs where an inverter range is visually merged into the model column', async () => {
    (pdfParse as jest.Mock).mockResolvedValue({
      numpages: 1,
      text: [
        'Range\tModel\tDC Voltage\tNet Effective Price GST Rate\tTax Amount\tGST Included Price\tMRP',
        'ICON 1100\t12V\t8281\t18%\t1491\t9771\t14500',
        '220 RC 26000 PRO\t24+24*\t15630\t18%\t2813\t18443\t23500',
      ].join('\n'),
    });

    const result = await service.extractPdf({
      buffer: Buffer.from('%PDF-example'),
      originalname: 'luminous-price-list.pdf',
      size: 12,
    });

    expect(result.rows).toEqual([
      { rowNumber: 1, modelName: 'ICON 1100', gstIncludedPrice: 9771 },
      {
        rowNumber: 2,
        modelName: 'RC 26000 PRO',
        gstIncludedPrice: 18443,
      },
    ]);
  });

  it('finds GST Included Price when the PDF prints the heading on separate lines', async () => {
    (pdfParse as jest.Mock).mockResolvedValue({
      numpages: 1,
      text: [
        'GST',
        'Tax',
        'Series\tModel\tDC Voltage\tBasic Price GST Rate\tIncluded MRP',
        'Amount',
        'Price',
        'NXG 850e\t12V\t4591\t18%\t826\t5417\t7,000',
        'NXG PRO Series\tSOLAR S/W UPS NXG PRO e 1KVA/12V\t12V\t9930\t18%\t1787\t11717\t17,500',
      ].join('\n'),
    });

    const result = await service.extractPdf({
      buffer: Buffer.from('%PDF-example'),
      originalname: 'solar-dealer.pdf',
      size: 12,
    });

    expect(result.rows).toEqual([
      { rowNumber: 1, modelName: 'NXG 850e', gstIncludedPrice: 5417 },
      {
        rowNumber: 2,
        modelName: 'SOLAR S/W UPS NXG PRO e 1KVA/12V',
        gstIncludedPrice: 11717,
      },
    ]);
  });

  it('re-checks only unmatched rows after a catalogue product name is corrected', async () => {
    priceLists.findOneBy.mockResolvedValue({ id: 'price-list-1' });
    priceListItems.find.mockResolvedValue([
      {
        id: 'item-1',
        priceListId: 'price-list-1',
        normalizedModelName: 'NXG 850E',
        productId: null,
        matchStatus: PriceListItemMatchStatus.UNMATCHED,
      },
    ]);
    products.find.mockResolvedValue([
      { id: 'product-1', name: 'nxg 850e' } satisfies Pick<
        Product,
        'id' | 'name'
      >,
    ]);
    const detail = { id: 'price-list-1', items: [] };
    jest.spyOn(service, 'findOne').mockResolvedValue(detail as never);

    await expect(service.refreshUnmatchedMatches('price-list-1')).resolves.toBe(
      detail,
    );
    expect(priceListItems.save).toHaveBeenCalledWith([
      expect.objectContaining({
        productId: 'product-1',
        matchStatus: PriceListItemMatchStatus.MATCHED,
      }),
    ]);
  });
});
