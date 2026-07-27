import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { DailyStock } from '../entities/daily-stock.entity';
import { Dealer } from '../entities/dealer.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { NotificationType } from '../entities/notification.entity';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const manager = { getRepository: jest.fn() };
  const ordersRepository = {
    transaction: jest.fn(),
    findByDealerId: jest.fn(),
    findItemTotals: jest.fn(),
    findAdminPage: jest.fn(),
    findAdminById: jest.fn(),
    findDealerById: jest.fn(),
  };
  const dealersRepository = { findByUserId: jest.fn() };
  const usersService = { findActiveById: jest.fn() };
  const notificationsService = { create: jest.fn() };
  const dealerRepository = {
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const productRepository = { findOneBy: jest.fn() };
  const stockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const findOrder = jest.fn();
  const orderRepository = {
    create: jest.fn(),
    findOne: findOrder,
    save: jest.fn(),
  };
  const orderItemsRepository = {
    create: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  const service = new OrdersService(
    ordersRepository as never,
    dealersRepository as never,
    usersService as never,
    notificationsService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    manager.getRepository.mockImplementation((entity) => {
      if (entity === Dealer) return dealerRepository;
      if (entity === Product) return productRepository;
      if (entity === DailyStock) return stockRepository;
      if (entity === Order) return orderRepository;
      if (entity === OrderItem) return orderItemsRepository;
      return undefined;
    });
    ordersRepository.transaction.mockImplementation(
      (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
        callback(manager),
    );
    usersService.findActiveById.mockResolvedValue({
      id: 'user-1',
      username: 'dealer-user',
      phone: '9000000000',
    });
    dealerRepository.findOneBy.mockResolvedValue({
      id: 'dealer-1',
      userId: 'dealer-user-1',
    });
    notificationsService.create.mockResolvedValue({ id: 'notification-1' });
    productRepository.findOneBy.mockResolvedValue({
      id: 'product-1',
      name: 'ILTT 18060 PRO',
      sku: 'ILTT-18060-PRO',
      unit: 'PIECE',
      isActive: true,
    });
    stockRepository.findOne.mockResolvedValue({ quantity: 8 });
    stockRepository.create.mockImplementation(
      (stock: Record<string, unknown>) => stock,
    );
    stockRepository.save.mockImplementation((stock) => Promise.resolve(stock));
    orderRepository.create.mockImplementation(
      (order: Record<string, unknown>) => order,
    );
    orderRepository.save.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      createdAt: new Date('2026-07-26T10:00:00.000Z'),
    });
    orderItemsRepository.create.mockImplementation(
      (item: Record<string, unknown>) => item,
    );
    orderItemsRepository.save.mockResolvedValue([]);
  });

  it('rejects duplicate products before starting a transaction', async () => {
    await expect(
      service.createMyOrder('user-1', {
        items: [
          { productId: 'product-1', quantity: 1 },
          { productId: 'product-1', quantity: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ordersRepository.transaction).not.toHaveBeenCalled();
  });

  it('persists one pending order and its items without reducing stock', async () => {
    await expect(
      service.createMyOrder('user-1', {
        items: [{ productId: 'product-1', quantity: 3 }],
      }),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: OrderStatus.PENDING,
      totalItems: 1,
      totalQuantity: 3,
      items: [
        {
          productId: 'product-1',
          productName: 'ILTT 18060 PRO',
          sku: 'ILTT-18060-PRO',
          requestedQuantity: 3,
          approvedQuantity: null,
          unit: 'PIECE',
        },
      ],
    });

    expect(stockRepository.findOne).toHaveBeenCalledTimes(1);
    expect(stockRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { stockDate: 'DESC' },
      }),
    );
    expect(stockRepository.save).not.toHaveBeenCalled();
    expect(orderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ dealerId: 'dealer-1' }),
    );
    expect(orderItemsRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        orderId: 'order-1',
        productId: 'product-1',
        quantity: 3,
      }),
    ]);
  });

  it('returns a conflict when preliminary stock cannot satisfy the order', async () => {
    stockRepository.findOne.mockResolvedValue({ quantity: 2 });

    await expect(
      service.createMyOrder('user-1', {
        items: [{ productId: 'product-1', quantity: 3 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(orderItemsRepository.save).not.toHaveBeenCalled();
  });

  it('rejects an account without a linked dealer profile', async () => {
    dealerRepository.findOneBy.mockResolvedValue(null);

    await expect(
      service.createMyOrder('user-1', {
        items: [{ productId: 'product-1', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(dealerRepository.create).not.toHaveBeenCalled();
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('approves a pending order atomically and reduces each stock row once', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    const orderItems = [
      { orderId: 'order-1', productId: 'product-1', quantity: 3 },
    ];
    const stock = { productId: 'product-1', quantity: 8 };
    findOrder.mockResolvedValue(order);
    orderItemsRepository.find.mockResolvedValue(orderItems);
    stockRepository.findOne.mockResolvedValue(stock);
    ordersRepository.findAdminById.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.APPROVED,
      items: [],
    });

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.APPROVED,
      }),
    ).resolves.toMatchObject({ status: OrderStatus.APPROVED });

    expect(stockRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(stock.quantity).toBe(5);
    expect(orderItems[0]).toMatchObject({ approvedQuantity: 3 });
    expect(stockRepository.save).toHaveBeenCalledWith([stock]);
    expect(stockRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(orderItemsRepository.save).toHaveBeenCalledWith(orderItems);
    expect(orderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.APPROVED }),
    );
  });

  it('creates an approval-date balance from earlier stock without changing history', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    const orderItems = [
      { orderId: 'order-1', productId: 'product-1', quantity: 4 },
    ];
    const historicalStock = {
      productId: 'product-1',
      stockDate: '2026-07-26',
      quantity: 10,
    };
    findOrder.mockResolvedValue(order);
    orderItemsRepository.find.mockResolvedValue(orderItems);
    stockRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(historicalStock)
      .mockResolvedValueOnce(null);
    stockRepository.create.mockImplementation(
      (stock: Record<string, unknown>) => ({ ...stock }),
    );
    ordersRepository.findAdminById.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.APPROVED,
      items: [],
    });

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.APPROVED,
      }),
    ).resolves.toMatchObject({ status: OrderStatus.APPROVED });

    expect(historicalStock.quantity).toBe(10);
    expect(stockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'product-1', quantity: 10 }),
    );
    expect(stockRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ productId: 'product-1', quantity: 6 }),
    ]);
  });

  it('keeps a pending order and all stock unchanged when approval conflicts', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    const orderItems = [
      { orderId: 'order-1', productId: 'product-1', quantity: 3 },
      { orderId: 'order-1', productId: 'product-2', quantity: 2 },
    ];
    const firstStock = { productId: 'product-1', quantity: 8 };
    const secondStock = { productId: 'product-2', quantity: 1 };
    findOrder.mockResolvedValue(order);
    orderItemsRepository.find.mockResolvedValue(orderItems);
    stockRepository.findOne
      .mockResolvedValueOnce(firstStock)
      .mockResolvedValueOnce(secondStock);
    productRepository.findOneBy.mockResolvedValue({ name: 'Product two' });

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(firstStock.quantity).toBe(8);
    expect(secondStock.quantity).toBe(1);
    expect(stockRepository.save).not.toHaveBeenCalled();
    expect(orderItemsRepository.save).not.toHaveBeenCalled();
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a second approval before attempting another stock reduction', async () => {
    findOrder.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.APPROVED,
    });

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(orderItemsRepository.find).not.toHaveBeenCalled();
    expect(stockRepository.save).not.toHaveBeenCalled();
  });

  it('partially fulfils an order by deducting only approved quantities', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    const orderItems = [
      { orderId: 'order-1', productId: 'product-1', quantity: 10 },
      { orderId: 'order-1', productId: 'product-2', quantity: 4 },
    ];
    const firstStock = { productId: 'product-1', quantity: 8 };
    const secondStock = { productId: 'product-2', quantity: 3 };
    findOrder.mockResolvedValue(order);
    orderItemsRepository.find.mockResolvedValue(orderItems);
    stockRepository.findOne.mockResolvedValue(firstStock);
    ordersRepository.findAdminById.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PARTIALLY_FULFILLED,
      items: [],
    });

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.PARTIALLY_FULFILLED,
        items: [
          { productId: 'product-1', approvedQuantity: 6 },
          { productId: 'product-2', approvedQuantity: 0 },
        ],
      }),
    ).resolves.toMatchObject({ status: OrderStatus.PARTIALLY_FULFILLED });

    expect(firstStock.quantity).toBe(2);
    expect(secondStock.quantity).toBe(3);
    expect(orderItems).toEqual([
      expect.objectContaining({ approvedQuantity: 6 }),
      expect.objectContaining({ approvedQuantity: 0 }),
    ]);
    expect(stockRepository.save).toHaveBeenCalledWith([firstStock]);
    expect(order.status).toBe(OrderStatus.PARTIALLY_FULFILLED);
  });

  it('rejects partial quantities above the request before stock is changed', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    const orderItems = [
      { orderId: 'order-1', productId: 'product-1', quantity: 3 },
    ];
    findOrder.mockResolvedValue(order);
    orderItemsRepository.find.mockResolvedValue(orderItems);

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.PARTIALLY_FULFILLED,
        items: [{ productId: 'product-1', approvedQuantity: 4 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(stockRepository.findOne).not.toHaveBeenCalled();
    expect(stockRepository.save).not.toHaveBeenCalled();
  });

  it('keeps stock unchanged when a partial quantity exceeds current availability', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    const orderItems = [
      { orderId: 'order-1', productId: 'product-1', quantity: 10 },
    ];
    const stock = { productId: 'product-1', quantity: 3 };
    findOrder.mockResolvedValue(order);
    orderItemsRepository.find.mockResolvedValue(orderItems);
    stockRepository.findOne.mockResolvedValue(stock);
    productRepository.findOneBy.mockResolvedValue({ name: 'ILTT 18060 PRO' });

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.PARTIALLY_FULFILLED,
        items: [{ productId: 'product-1', approvedQuantity: 4 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(stock.quantity).toBe(3);
    expect(stockRepository.save).not.toHaveBeenCalled();
    expect(orderItemsRepository.save).not.toHaveBeenCalled();
  });

  it('rejects an all-zero partial fulfilment without changing stock', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    const orderItems = [
      { orderId: 'order-1', productId: 'product-1', quantity: 3 },
    ];
    findOrder.mockResolvedValue(order);
    orderItemsRepository.find.mockResolvedValue(orderItems);

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.PARTIALLY_FULFILLED,
        items: [{ productId: 'product-1', approvedQuantity: 0 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(stockRepository.save).not.toHaveBeenCalled();
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('marks an updated order approved when every approved quantity is full', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    const orderItems = [
      { orderId: 'order-1', productId: 'product-1', quantity: 3 },
    ];
    const stock = { productId: 'product-1', quantity: 5 };
    findOrder.mockResolvedValue(order);
    orderItemsRepository.find.mockResolvedValue(orderItems);
    stockRepository.findOne.mockResolvedValue(stock);
    ordersRepository.findAdminById.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.APPROVED,
      items: [],
    });

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.PARTIALLY_FULFILLED,
        items: [{ productId: 'product-1', approvedQuantity: 3 }],
        adminRemarks: 'Verified full stock.',
      }),
    ).resolves.toMatchObject({ status: OrderStatus.APPROVED });

    expect(order).toMatchObject({
      status: OrderStatus.APPROVED,
      adminRemarks: 'Verified full stock.',
    });
  });

  it('rejects a pending order without reducing stock', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    findOrder.mockResolvedValue(order);
    ordersRepository.findAdminById.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.REJECTED,
      items: [],
    });

    await expect(
      service.updateStatusForAdmin('order-1', { status: OrderStatus.REJECTED }),
    ).resolves.toMatchObject({ status: OrderStatus.REJECTED });

    expect(order.status).toBe(OrderStatus.REJECTED);
    expect(stockRepository.findOne).not.toHaveBeenCalled();
    expect(stockRepository.save).not.toHaveBeenCalled();
  });

  it('requires and stores a cancellation reason without reducing stock', async () => {
    const order = { id: 'order-1', status: OrderStatus.PENDING };
    findOrder.mockResolvedValue(order);
    ordersRepository.findAdminById.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.CANCELLED,
      items: [],
    });

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.CANCELLED,
        cancellationReason: 'Product unavailable',
      }),
    ).resolves.toMatchObject({ status: OrderStatus.CANCELLED });

    expect(order).toMatchObject({
      status: OrderStatus.CANCELLED,
      cancellationReason: 'Product unavailable',
    });
    expect(stockRepository.save).not.toHaveBeenCalled();
  });

  it("does not reveal another dealer's order", async () => {
    dealersRepository.findByUserId.mockResolvedValue({ id: 'dealer-1' });
    ordersRepository.findDealerById.mockResolvedValue(null);

    await expect(
      service.findOneForDealer('user-1', 'order-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ordersRepository.findDealerById).toHaveBeenCalledWith(
      'order-2',
      'dealer-1',
    );
  });

  it('does not allow a rejected order to be approved later', async () => {
    findOrder.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.REJECTED,
    });

    await expect(
      service.updateStatusForAdmin('order-1', {
        status: OrderStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(stockRepository.save).not.toHaveBeenCalled();
  });

  it('does not create an order when one selected product is missing', async () => {
    productRepository.findOneBy.mockResolvedValue(null);

    await expect(
      service.createMyOrder('user-1', {
        items: [{ productId: 'product-1', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('does not create an order for an inactive product', async () => {
    productRepository.findOneBy.mockResolvedValue({
      id: 'product-1',
      isActive: false,
    });

    await expect(
      service.createMyOrder('user-1', {
        items: [{ productId: 'product-1', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(orderItemsRepository.save).not.toHaveBeenCalled();
  });

  it('returns the repository pagination result for administrators', async () => {
    const query = { page: 2, limit: 10, sortOrder: 'DESC' as const };
    ordersRepository.findAdminPage.mockResolvedValue({
      items: [],
      total: 13,
    });

    await expect(service.findAllForAdmin(query)).resolves.toEqual({
      items: [],
      pagination: { page: 2, limit: 10, totalItems: 13, totalPages: 2 },
    });
    expect(ordersRepository.findAdminPage).toHaveBeenCalledWith(query);
  });

  it('marks an approved order billed and notifies its dealer after Tally confirmation', async () => {
    const order = {
      id: 'order-1',
      dealerId: 'dealer-1',
      status: OrderStatus.APPROVED,
      billGenerated: false,
      billGeneratedAt: undefined as Date | undefined,
    };
    findOrder.mockResolvedValue(order);

    await expect(
      service.generateBillForStaff('order-1', 'staff-user-1'),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: OrderStatus.BILLED,
      billGenerated: true,
      billGeneratedBy: 'staff-user-1',
    });

    expect(order).toMatchObject({
      status: OrderStatus.BILLED,
      billGenerated: true,
      billGeneratedBy: 'staff-user-1',
    });
    expect(order.billGeneratedAt).toBeInstanceOf(Date);
    expect(notificationsService.create).toHaveBeenCalledWith(
      {
        userId: 'dealer-user-1',
        type: NotificationType.BILL_GENERATED,
        title: 'Bill Generated',
        body: 'Your bill has been generated in Tally.',
      },
      manager,
    );
  });

  it('does not allow an order to be billed twice', async () => {
    findOrder.mockResolvedValue({
      id: 'order-1',
      dealerId: 'dealer-1',
      status: OrderStatus.BILLED,
    });

    await expect(
      service.generateBillForStaff('order-1', 'staff-user-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('does not allow a cancelled order to be billed', async () => {
    findOrder.mockResolvedValue({
      id: 'order-1',
      dealerId: 'dealer-1',
      status: OrderStatus.CANCELLED,
    });

    await expect(
      service.generateBillForStaff('order-1', 'staff-user-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });
});
