import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LessThanOrEqual, Repository } from 'typeorm';

import { DailyStock } from '../entities/daily-stock.entity';
import {
  ApiErrorException,
  dealerProfileMissing,
  insufficientStock,
  orderNotFound,
  productInactive,
  productNotFound,
} from '../common/exceptions/api-error.exception';
import { Dealer } from '../entities/dealer.entity';
import {
  OrderActivity,
  OrderActivityType,
} from '../entities/order-activity.entity';
import { NotificationType } from '../entities/notification.entity';
import { DeliveryStatus, Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { User } from '../entities/user.entity';
import { UserRole } from '../common/constants/user-role.enum';
import { DealersRepository } from '../repositories/dealers.repository';
import {
  AdminOrderDetailsRow,
  AdminOrderSummaryRow,
  OrdersRepository,
  StaffBillingQueueOrderRow,
} from '../repositories/orders.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import {
  ApprovedOrderItemDto,
  UpdateOrderStatusDto,
} from './dto/update-order-status.dto';
import { StaffBillingQueueQueryDto } from './dto/staff-billing-queue-query.dto';

export interface OrderHistoryResponse {
  id: string;
  orderId: string;
  /** Existing orders use the UUID as their stable customer-facing reference. */
  orderNumber: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  cancellationReason: string | null;
  billGenerated: boolean;
  billGeneratedAt: Date | null;
  deliveryStatus: DeliveryStatus;
  shippedAt: Date | null;
  receivedAt: Date | null;
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

export type StaffBillingQueueOrder = StaffBillingQueueOrderRow;

export interface BillGenerationResponse {
  id: string;
  status: OrderStatus.BILLED;
  billGenerated: true;
  billGeneratedAt: Date;
  billGeneratedBy: string;
}

export interface ShipmentResponse {
  id: string;
  deliveryStatus: DeliveryStatus.SHIPPED;
  shippedAt: Date;
  shippedBy: string;
}

export interface ReceiptConfirmationResponse {
  id: string;
  deliveryStatus: DeliveryStatus.RECEIVED;
  receivedAt: Date;
  receivedBy: string;
}

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
    private readonly notificationsService: NotificationsService,
  ) {}

  async findMyOrders(userId: string): Promise<OrderHistoryResponse[]> {
    const dealer = await this.dealersRepository.findByUserId(userId);
    if (!dealer) {
      // A USER can exist before their dealer profile is completed. There are
      // simply no orders to return until the profile is created.
      return [];
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
      orderId: order.id,
      orderNumber: order.id,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      cancellationReason: order.cancellationReason ?? null,
      billGenerated: order.billGenerated,
      billGeneratedAt: order.billGeneratedAt ?? null,
      deliveryStatus: order.deliveryStatus ?? DeliveryStatus.NOT_READY,
      shippedAt: order.shippedAt ?? null,
      receivedAt: order.receivedAt ?? null,
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
      throw orderNotFound();
    }
    const order = await this.ordersRepository.findDealerById(id, dealer.id);
    if (!order) {
      throw orderNotFound();
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
        throw dealerProfileMissing();
      }

      const stockRepository = manager.getRepository(DailyStock);
      const productRepository = manager.getRepository(Product);
      const bookedItems: CreatedOrderResponse['items'] = [];
      for (const item of items) {
        const product = await productRepository.findOneBy({
          id: item.productId,
        });
        if (!product) {
          throw productNotFound();
        }
        if (!product.isActive) {
          throw productInactive();
        }

        const stock = await this.findStockAsOf(
          stockRepository,
          item.productId,
          orderDate,
        );
        if (!stock || stock.quantity < item.quantity) {
          throw insufficientStock();
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
      await this.recordActivity(manager, {
        orderId: order.id,
        activityType: OrderActivityType.ORDER_PLACED,
        title: 'Order placed',
        description: 'The dealer submitted this order.',
        performedBy: userId,
      });

      return {
        id: order.id,
        orderId: order.id,
        orderNumber: order.id,
        status: order.status,
        updatedAt: order.updatedAt,
        cancellationReason: order.cancellationReason ?? null,
        billGenerated: order.billGenerated,
        billGeneratedAt: order.billGeneratedAt ?? null,
        deliveryStatus: order.deliveryStatus ?? DeliveryStatus.NOT_READY,
        shippedAt: null,
        receivedAt: null,
        remarks: order.remarks ?? null,
        dealer: {
          id: dealer.id,
          businessName: dealer.businessName,
          shopName: dealer.shopName ?? dealer.businessName,
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

  /** The staff detail route deliberately reuses the same complete safe view. */
  findOneForStaff(id: string): Promise<AdminOrderDetailsResponse> {
    return this.findOneForAdmin(id);
  }

  findBillingQueue(
    query: StaffBillingQueueQueryDto,
  ): Promise<StaffBillingQueueOrder[]> {
    return this.ordersRepository.findStaffBillingQueue(query);
  }

  async generateBillForStaff(
    id: string,
    staffUserId: string,
  ): Promise<BillGenerationResponse> {
    return this.ordersRepository.transaction(async (manager) => {
      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw orderNotFound();
      }
      if (order.status === OrderStatus.BILLED) {
        throw new ApiErrorException(
          409,
          'ORDER_ALREADY_BILLED',
          'This order has already been marked billed.',
        );
      }
      if (
        order.status !== OrderStatus.APPROVED &&
        order.status !== OrderStatus.PARTIALLY_FULFILLED
      ) {
        throw new ApiErrorException(
          409,
          'ORDER_NOT_READY_FOR_BILLING',
          'Only approved or partially fulfilled orders can be marked billed.',
        );
      }

      const dealer = await manager.getRepository(Dealer).findOneBy({
        id: order.dealerId,
      });
      if (!dealer) {
        throw new NotFoundException('Dealer profile not found for this order.');
      }

      const generatedAt = new Date();
      order.status = OrderStatus.BILLED;
      order.billGenerated = true;
      order.billGeneratedAt = generatedAt;
      order.billGeneratedBy = staffUserId;
      order.deliveryStatus = DeliveryStatus.READY_FOR_DISPATCH;
      await orderRepository.save(order);

      await this.recordActivity(manager, {
        orderId: order.id,
        activityType: OrderActivityType.BILL_GENERATED,
        title: 'Bill generated in Tally',
        description: 'Staff confirmed that the bill was generated in Tally.',
        performedBy: staffUserId,
      });

      await this.notificationsService.create(
        {
          userId: dealer.userId,
          orderId: order.id,
          type: NotificationType.BILL_GENERATED,
          title: 'Bill Generated',
          body: 'Your bill has been generated in Tally.',
        },
        manager,
      );

      return {
        id: order.id,
        status: OrderStatus.BILLED,
        billGenerated: true,
        billGeneratedAt: generatedAt,
        billGeneratedBy: staffUserId,
      };
    });
  }

  findBilledOrdersForStaff(
    query: StaffBillingQueueQueryDto,
  ): Promise<StaffBillingQueueOrder[]> {
    return this.ordersRepository.findStaffBilledOrders(query);
  }

  async markShipped(
    id: string,
    staffUserId: string,
  ): Promise<ShipmentResponse> {
    return this.ordersRepository.transaction(async (manager) => {
      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw orderNotFound();
      if (order.deliveryStatus === DeliveryStatus.RECEIVED) {
        throw new ApiErrorException(
          409,
          'ORDER_ALREADY_RECEIVED',
          'This order has already been received.',
        );
      }
      if (order.deliveryStatus === DeliveryStatus.SHIPPED) {
        throw new ApiErrorException(
          409,
          'ORDER_ALREADY_SHIPPED',
          'This order has already been shipped.',
        );
      }
      if (
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.REJECTED ||
        order.status !== OrderStatus.BILLED ||
        !order.billGenerated
      ) {
        throw new ApiErrorException(
          409,
          'ORDER_NOT_READY_FOR_SHIPMENT',
          'Only billed, active orders can be marked as shipped.',
        );
      }

      const dealer = await manager.getRepository(Dealer).findOneBy({
        id: order.dealerId,
      });
      if (!dealer)
        throw new NotFoundException('Dealer profile not found for this order.');
      const shippedAt = new Date();
      order.deliveryStatus = DeliveryStatus.SHIPPED;
      order.shippedAt = shippedAt;
      order.shippedBy = staffUserId;
      await orderRepository.save(order);
      await this.recordActivity(manager, {
        orderId: order.id,
        activityType: OrderActivityType.ORDER_SHIPPED,
        title: 'Order shipped',
        description: `Order ${order.id} was marked as shipped.`,
        performedBy: staffUserId,
      });
      await this.notificationsService.create(
        {
          userId: dealer.userId,
          orderId: order.id,
          type: NotificationType.ORDER_SHIPPED,
          title: 'Order Shipped',
          body: `Your order ${order.id} has been shipped.`,
        },
        manager,
      );
      await this.notifyAdministrators(manager, {
        orderId: order.id,
        type: NotificationType.ORDER_SHIPPED,
        title: 'Order Shipped',
        body: `${dealer.shopName ?? dealer.businessName} order ${order.id} was shipped.`,
      });
      return {
        id: order.id,
        deliveryStatus: DeliveryStatus.SHIPPED,
        shippedAt,
        shippedBy: staffUserId,
      };
    });
  }

  async confirmReceived(
    id: string,
    dealerUserId: string,
  ): Promise<ReceiptConfirmationResponse> {
    const dealer = await this.dealersRepository.findByUserId(dealerUserId);
    if (!dealer) throw orderNotFound();
    return this.ordersRepository.transaction(async (manager) => {
      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOne({
        where: { id, dealerId: dealer.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw orderNotFound();
      if (order.deliveryStatus === DeliveryStatus.RECEIVED) {
        throw new ApiErrorException(
          409,
          'ORDER_ALREADY_RECEIVED',
          'This order has already been received.',
        );
      }
      if (order.deliveryStatus !== DeliveryStatus.SHIPPED) {
        throw new ApiErrorException(
          409,
          'ORDER_NOT_SHIPPED',
          'Only shipped orders can be confirmed as received.',
        );
      }
      const receivedAt = new Date();
      order.deliveryStatus = DeliveryStatus.RECEIVED;
      order.receivedAt = receivedAt;
      order.receivedBy = dealerUserId;
      await orderRepository.save(order);
      await this.recordActivity(manager, {
        orderId: order.id,
        activityType: OrderActivityType.ORDER_RECEIVED,
        title: 'Order received',
        description: `${dealer.shopName ?? dealer.businessName} confirmed receipt of order ${order.id}.`,
        performedBy: dealerUserId,
      });
      await this.notifyAdministrators(manager, {
        orderId: order.id,
        type: NotificationType.ORDER_RECEIVED,
        title: 'Order Received',
        body: `${dealer.shopName ?? dealer.businessName} received Order ${order.id} on ${receivedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
      });
      return {
        id: order.id,
        deliveryStatus: DeliveryStatus.RECEIVED,
        receivedAt,
        receivedBy: dealerUserId,
      };
    });
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
      await this.recordActivity(manager, {
        orderId: order.id,
        activityType:
          order.status === OrderStatus.APPROVED
            ? OrderActivityType.ORDER_APPROVED
            : OrderActivityType.ORDER_PARTIALLY_APPROVED,
        title:
          order.status === OrderStatus.APPROVED
            ? 'Order approved'
            : 'Order partially approved',
        description: order.adminRemarks ?? null,
      });
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
      await this.recordActivity(manager, {
        orderId: order.id,
        activityType: OrderActivityType.ORDER_CANCELLED,
        title:
          status === OrderStatus.CANCELLED
            ? 'Order cancelled'
            : 'Order rejected',
        description: order.cancellationReason ?? order.adminRemarks ?? null,
      });
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

  private async recordActivity(
    manager: import('typeorm').EntityManager,
    input: {
      orderId: string;
      activityType: OrderActivityType;
      title: string;
      description?: string | null;
      performedBy?: string | null;
    },
  ): Promise<void> {
    // The guard keeps older isolated unit-test transaction doubles compatible;
    // a real TypeORM entity manager always supplies this repository.
    const repository = manager.getRepository(OrderActivity) as
      Repository<OrderActivity> | undefined;
    if (!repository) return;
    await repository.save(repository.create(input));
  }

  private async notifyAdministrators(
    manager: import('typeorm').EntityManager,
    input: Omit<
      import('../notifications/notifications.service').CreateNotificationInput,
      'userId'
    >,
  ): Promise<void> {
    const admins = await manager.getRepository(User).find({
      where: { role: UserRole.ADMIN, isActive: true },
    });
    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.create(
          { ...input, userId: admin.id },
          manager,
        ),
      ),
    );
  }
}
