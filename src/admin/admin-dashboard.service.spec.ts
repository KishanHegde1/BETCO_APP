import { AdminDashboardService } from './admin-dashboard.service';

type RawResult = Record<string, string>;

function queryReturning(result: RawResult) {
  const query = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    setParameter: jest.fn(),
    getRawOne: jest.fn().mockResolvedValue(result),
  };
  for (const method of [
    query.select,
    query.addSelect,
    query.where,
    query.andWhere,
    query.innerJoin,
    query.leftJoin,
    query.setParameter,
  ]) {
    method.mockReturnValue(query);
  }
  return query;
}

describe('AdminDashboardService', () => {
  it('summarises the latest stock balance and approved quantities', async () => {
    const categoryQuery = queryReturning({ count: '6' });
    const productCountQuery = queryReturning({
      activeCount: '10',
      inactiveCount: '2',
    });
    const liveStockQuery = queryReturning({
      withStock: '8',
      withoutStock: '2',
      available: '470',
    });
    const orderQuery = queryReturning({ todayCount: '4', pendingCount: '1' });
    const bookedQuery = queryReturning({ quantity: '30' });
    const categories = {
      createQueryBuilder: jest.fn().mockReturnValue(categoryQuery),
    };
    const products = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(productCountQuery)
        .mockReturnValueOnce(liveStockQuery),
    };
    const orders = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(orderQuery)
        .mockReturnValueOnce(bookedQuery),
    };
    const service = new AdminDashboardService(
      categories as never,
      products as never,
      orders as never,
    );

    await expect(service.getSummary()).resolves.toEqual({
      activeCategoryCount: 6,
      activeProductCount: 10,
      inactiveProductCount: 2,
      productsWithStockToday: 8,
      activeProductsWithoutStockToday: 2,
      totalAvailableQuantityToday: 470,
      totalBookedQuantityToday: 30,
      dealerOrdersToday: 4,
      pendingOrderCount: 1,
    });

    expect(liveStockQuery.leftJoin).toHaveBeenCalledTimes(1);
    expect(liveStockQuery.setParameter).toHaveBeenCalledWith(
      'stockDate',
      expect.any(String),
    );
    expect(bookedQuery.andWhere).toHaveBeenCalledWith(
      'order.status IN (:...stockDeductedStatuses)',
      {
        stockDeductedStatuses: [
          'APPROVED',
          'PARTIALLY_FULFILLED',
          'BILLED',
          'COMPLETED',
        ],
      },
    );
  });
});
