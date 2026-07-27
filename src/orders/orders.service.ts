import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LessThanOrEqual, Repository } from 'typeorm';

import { DailyStock } from '../entities/daily-stock.entity';
import { Dealer } from '../entities/dealer.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { DealersRepository } from '../repositories/dealers.repository';
import {
  AdminOrderDetailsRow,
  AdminOrderSummaryRow,
  OrdersRepository,
} from '../repositories/orders.repository';
import { UsersService } from '../users/users.service';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import {
  ApprovedOrderItemDto,
  UpdateOrderStatusDto,
} from './dto/update-order-status.dto';

export interface OrderHistoryResponse {
  id: string;
  status: OrderStatus;
  createdAt: Date;
  totalItems: number;
  totalQuantity: number;
  totalApprovedQuantity: number | null;
}

export interface CreatedOrderResponse extends OrderHistoryResponse {
  remarks: string | null;
  dealer: {
    id: string;
    businessName: string;
    shopName: string;
  };
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    requestedQuantity: number;
    approvedQuantity: number | null;
    unit: string;
  }>;
}

export type AdminOrderSummaryResponse = AdminOrderSummaryRow;

export type AdminOrderDetailsResponse = AdminOrderDetailsRow;

export type DealerOrderDetailsResponse = AdminOrderDetailsRow;

export interface PaginatedAdminOrdersResponse {
  items: AdminOrderSummaryResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly dealersRepository: DealersRepository,
    private readonly usersService: UsersService,
  ) {}

  async findMyOrders(userId: string): Promise<OrderHistoryResponse[]> {
    const dealer = await this.dealersRepository.findByUserId(userId);
    if (!dealer) {
      throw new NotFoundException('Dealer profile not found for this account.');
    }

    const orders = await this.ordersRepository.findByDealerId(dealer.id);
    const itemTotals = await this.ordersRepository.findItemTotals(
      orders.map((order) => order.id),
    );
    const totalsByOrderId = new Map(
      itemTotals.map((total) => [total.orderId, total]),
    );

    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      totalItems: totalsByOrderId.get(order.id)?.totalItems ?? 0,
      totalQuantity: totalsByOrderId.get(order.id)?.totalQuantity ?? 0,
      totalApprovedQuantity:
        totalsByOrderId.get(order.id)?.totalApprovedQuantity ?? null,
    }));
  }

  async findOneForDealer(
    userId: string,
    id: string,
  ): Promise<DealerOrderDetailsResponse> {
    const dealer = await this.dealersRepository.findByUserId(userId);
    if (!dealer) {
      throw new NotFoundException('Dealer profile not found for this account.');
    }
    const order = await this.ordersRepository.findDealerById(id, dealer.id);
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return order;
  }

  async createMyOrder(
    userId: string,
    createOrderDto: CreateOrderDto,
  ): Promise<CreatedOrderResponse> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }

    this.assertNoDuplicateProducts(createOrderDto.items);
    const items = [...createOrderDto.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    const orderDate = this.getIndianCalendarDate();
    return this.ordersRepository.transaction(async (manager) => {
      const dealerRepository = manager.getRepository(Dealer);
      const dealer = await dealerRepository.findOneBy({ userId });
      if (!dealer) {
        throw new NotFoundException(
          'Dealer profile not found for this account. Please contact Betco.',
        );
      }

      const stockRepository = manager.getRepository(DailyStock);
      const productRepository = manager.getRepository(Product);
      const bookedItems: CreatedOrderResponse['items'] = [];
      for (const item of items) {
        const product = await productRepository.findOneBy({
          id: item.productId,
        });
        if (!product) {
          throw new NotFoundException(
            'One of the selected products was not found.',
          );
        }
        if (!product.isActive) {
          throw new BadRequestException(
            'One of the selected products is inactive.',
          );
        }

        const stock = await this.findStockAsOf(
          stockRepository,
          item.productId,
          orderDate,
        );
        if (!stock || stock.quantity < item.quantity) {
          throw new ConflictException(
            `${product.name} has no saved stock or no longer has enough stock.`,
          );
        }

        bookedItems.push({
          id: '',
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          requestedQuantity: item.quantity,
          approvedQuantity: null,
          unit: product.unit,
        });
      }

      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.save(
        orderRepository.create({
          dealerId: dealer.id,
          status: OrderStatus.PENDING,
          remarks: createOrderDto.remarks?.trim() || undefined,
        }),
      );

      const orderItemsRepository = manager.getRepository(OrderItem);
      const savedItems = await orderItemsRepository.save(
        items.map((item) =>
          orderItemsRepository.create({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
          }),
        ),
      );
      const itemIdByProduct = new Map(
        savedItems.map((item) => [item.productId, item.id]),
      );

      return {
        id: order.id,
        status: order.status,
        remarks: order.remarks ?? null,
        dealer: {
          id: dealer.id,
          businessName: dealer.businessName,
          shopName: dealer.businessName,
        },
        createdAt: order.createdAt,
        totalItems: items.length,
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
        totalApprovedQuantity: null,
        items: bookedItems.map((item) => ({
          ...item,
          id: itemIdByProduct.get(item.productId) ?? '',
        })),
      };
    });
  }

  async findAllForAdmin(
    query: AdminOrdersQueryDto,
  ): Promise<PaginatedAdminOrdersResponse> {
    const page = await this.ordersRepository.findAdminPage(query);
    return {
      items: page.items,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems: page.total,
        totalPages: Math.ceil(page.total / query.limit),
      },
    };
  }

  async findOneForAdmin(id: string): Promise<AdminOrderDetailsResponse> {
    const order = await this.ordersRepository.findAdminById(id);
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return order;
  }

  async updateStatusForAdmin(
    id: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<AdminOrderDetailsResponse> {
    const { status, items, adminRemarks, cancellationReason } =
      updateOrderStatusDto;
    if (status !== OrderStatus.PARTIALLY_FULFILLED && items !== undefined) {
      throw new BadRequestException(
        'Approved quantities may only be provided for partial fulfilment.',
      );
    }

    switch (status) {
      case OrderStatus.APPROVED:
        await this.applyPendingApproval(
          id,
          OrderStatus.APPROVED,
          undefined,
          adminRemarks,
        );
        break;
      case OrderStatus.PARTIALLY_FULFILLED:
        await this.applyPendingApproval(
          id,
          OrderStatus.PARTIALLY_FULFILLED,
          items ?? [],
          adminRemarks,
        );
        break;
      case OrderStatus.REJECTED:
      case OrderStatus.CANCELLED:
        await this.transitionPendingWithoutStock(
          id,
          status,
          cancellationReason,
          adminRemarks,
        );
        break;
      case OrderStatus.COMPLETED:
        await this.completeApprovedOrder(id);
        break;
      default:
        throw new BadRequestException(
          'This order status cannot be set through the administrator workflow.',
        );
    }

    return this.findOneForAdmin(id);
  }

  private async applyPendingApproval(
    id: string,
    status: OrderStatus.APPROVED | OrderStatus.PARTIALLY_FULFILLED,
    partialItems?: ApprovedOrderItemDto[],
    adminRemarks?: string,
  ): Promise<void> {
    await this.ordersRepository.transaction(async (manager) => {
      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found.');
      }
      if (order.status !== OrderStatus.PENDING) {
        throw new ConflictException(
          'Only a pending order can be approved or partially fulfilled.',
        );
      }

      const orderItemsRepository = manager.getRepository(OrderItem);
      const orderItems = await orderItemsRepository.find({
        where: { orderId: order.id },
        order: { productId: 'ASC' },
      });
      if (orderItems.length === 0) {
        throw new ConflictException('This order has no items to process.');
      }

      const approvedByProduct =
        status === OrderStatus.APPROVED
          ? new Map(orderItems.map((item) => [item.productId, item.quantity]))
          : this.validatePartialQuantities(orderItems, partialItems ?? []);
      const approvedTotal = [...approvedByProduct.values()].reduce(
        (total, quantity) => total + quantity,
        0,
      );
      if (approvedTotal === 0) {
        throw new BadRequestException(
          'Approve at least one unit before partially fulfilling this order.',
        );
      }

      const stockRepository = manager.getRepository(DailyStock);
      const productRepository = manager.getRepository(Product);
      const approvalDate = this.getIndianCalendarDate();
      const approvedStocks: Array<{
        stock: DailyStock;
        approvedQuantity: number;
      }> = [];

      for (const item of orderItems) {
        const approvedQuantity = approvedByProduct.get(item.productId) ?? 0;
        if (approvedQuantity === 0) {
          continue;
        }
        const stock = await this.lockApprovalDateStock(
          stockRepository,
          item.productId,
          approvalDate,
        );
        if (!stock || stock.quantity < approvedQuantity) {
          const product = await productRepository.findOneBy({
            id: item.productId,
          });
          const productName = product?.name ?? 'a selected product';
          const availableQuantity = stock?.quantity ?? 0;
          const action =
            status === OrderStatus.APPROVED
              ? 'approved'
              : 'partially fulfilled';
          throw new ConflictException(
            `Order cannot be ${action} because stock is insufficient for ${productName}. Available quantity: ${availableQuantity}.`,
          );
        }
        approvedStocks.push({ stock, approvedQuantity });
      }
      for (const entry of approvedStocks) {
        entry.stock.quantity -= entry.approvedQuantity;
      }
      for (const item of orderItems) {
        item.approvedQuantity = approvedByProduct.get(item.productId) ?? 0;
      }
      if (approvedStocks.length > 0) {
        await stockRepository.save(approvedStocks.map((entry) => entry.stock));
      }
      await orderItemsRepository.save(orderItems);

      order.status = [...approvedByProduct.entries()].every(
        ([productId, approvedQuantity]) =>
          orderItems.find((item) => item.productId === productId)?.quantity ===
          approvedQuantity,
      )
        ? OrderStatus.APPROVED
        : OrderStatus.PARTIALLY_FULFILLED;
      order.adminRemarks = this.normalizeOptionalNote(adminRemarks);
      order.reviewedAt = new Date();
      await orderRepository.save(order);
    });
  }

  private async transitionPendingWithoutStock(
    id: string,
    status: OrderStatus.REJECTED | OrderStatus.CANCELLED,
    cancellationReason?: string,
    adminRemarks?: string,
  ): Promise<void> {
    await this.ordersRepository.transaction(async (manager) => {
      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found.');
      }
      if (order.status !== OrderStatus.PENDING) {
        throw new ConflictException(
          'Only a pending order can be rejected or cancelled.',
        );
      }
      if (status === OrderStatus.CANCELLED) {
        const reason = cancellationReason?.trim();
        if (!reason || reason.length < 3) {
          throw new BadRequestException(
            'Provide a cancellation reason of at least 3 characters.',
          );
        }
        order.cancellationReason = reason;
      }
      order.adminRemarks = this.normalizeOptionalNote(adminRemarks);
      order.reviewedAt = new Date();
      order.status = status;
      await orderRepository.save(order);
    });
  }

  private async completeApprovedOrder(id: string): Promise<void> {
    await this.ordersRepository.transaction(async (manager) => {
      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found.');
      }
      if (
        order.status !== OrderStatus.APPROVED &&
        order.status !== OrderStatus.PARTIALLY_FULFILLED
      ) {
        throw new ConflictException(
          'Only approved or partially fulfilled orders can be completed.',
        );
      }
      order.status = OrderStatus.COMPLETED;
      await orderRepository.save(order);
    });
  }

  private validatePartialQuantities(
    orderItems: OrderItem[],
    partialItems: ApprovedOrderItemDto[],
  ): Map<string, number> {
    if (partialItems.length !== orderItems.length) {
      throw new BadRequestException(
        'Provide an approved quantity for every requested product.',
      );
    }

    const orderProductIds = new Set(orderItems.map((item) => item.productId));
    const approvedByProduct = new Map<string, number>();
    for (const item of partialItems) {
      if (
        approvedByProduct.has(item.productId) ||
        !orderProductIds.has(item.productId)
      ) {
        throw new BadRequestException(
          'Approved quantities must match each requested product exactly once.',
        );
      }
      if (
        !Number.isInteger(item.approvedQuantity) ||
        item.approvedQuantity < 0
      ) {
        throw new BadRequestException(
          'Approved quantities must be whole numbers of zero or more.',
        );
      }
      approvedByProduct.set(item.productId, item.approvedQuantity);
    }

    for (const orderItem of orderItems) {
      const approvedQuantity = approvedByProduct.get(orderItem.productId);
      if (approvedQuantity == null || approvedQuantity > orderItem.quantity) {
        throw new BadRequestException(
          `Approved quantity for ${orderItem.productId} cannot exceed the requested quantity.`,
        );
      }
    }
    return approvedByProduct;
  }

  private assertNoDuplicateProducts(items: OrderItemDto[]): void {
    const productIds = new Set<string>();
    for (const item of items) {
      if (productIds.has(item.productId)) {
        throw new BadRequestException(
          'A product may appear only once in an order.',
        );
      }
      productIds.add(item.productId);
    }
  }

  private normalizeOptionalNote(value?: string): string | undefined {
    const note = value?.trim();
    return note || undefined;
  }

  private findStockAsOf(
    stockRepository: Repository<DailyStock>,
    productId: string,
    date: string,
  ): Promise<DailyStock | null> {
    return stockRepository.findOne({
      where: { productId, stockDate: LessThanOrEqual(date) },
      order: { stockDate: 'DESC' },
    });
  }

  /**
   * Locks the balance that will be changed by an approval. If no exact row
   * exists for the approval date, the prior balance is locked, rechecked for a
   * same-date row, then copied into a new approval-date row. This serializes
   * concurrent approvals for the same product/date without changing history.
   */
  private async lockApprovalDateStock(
    stockRepository: Repository<DailyStock>,
    productId: string,
    approvalDate: string,
  ): Promise<DailyStock | null> {
    let stock = await stockRepository.findOne({
      where: { productId, stockDate: approvalDate },
      lock: { mode: 'pessimistic_write' },
    });
    if (stock) return stock;

    const previousStock = await stockRepository.findOne({
      where: { productId, stockDate: LessThanOrEqual(approvalDate) },
      order: { stockDate: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!previousStock) return null;

    stock = await stockRepository.findOne({
      where: { productId, stockDate: approvalDate },
      lock: { mode: 'pessimistic_write' },
    });
    if (stock) return stock;

    return stockRepository.create({
      productId,
      stockDate: approvalDate,
      quantity: previousStock.quantity,
    });
  }

  private getIndianCalendarDate(): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts();
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
}
