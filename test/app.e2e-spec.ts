import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { appValidationPipe } from '../src/common/pipes/app-validation.pipe';
import { UserRole } from '../src/common/constants/user-role.enum';
import { ProductsController } from '../src/products/products.controller';
import { ProductsService } from '../src/products/products.service';
import { ProfileController } from '../src/profile/profile.controller';
import { ProfileService } from '../src/profile/profile.service';
import { StockController } from '../src/stock/stock.controller';
import { StockService } from '../src/stock/stock.service';
import { AdminOrdersController } from '../src/orders/admin-orders.controller';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';

@Injectable()
class IsolatedJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: { sub: string; role: UserRole };
    }>();
    if (
      request.headers.authorization !== 'Bearer test-token' &&
      request.headers.authorization !== 'Bearer admin-token'
    ) {
      throw new UnauthorizedException();
    }
    request.user = {
      sub:
        request.headers.authorization === 'Bearer admin-token'
          ? 'admin-1'
          : 'dealer-1',
      role:
        request.headers.authorization === 'Bearer admin-token'
          ? UserRole.ADMIN
          : UserRole.USER,
    };
    return true;
  }
}

@Injectable()
class IsolatedRolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { role: UserRole };
    }>();
    const protectedForDealer = [
      'findMyOrders',
      'findMyOrder',
      'createMyOrder',
    ].includes(context.getHandler().name);
    return protectedForDealer
      ? request.user?.role === UserRole.USER
      : request.user?.role === UserRole.ADMIN;
  }
}

describe('Dealer user API (e2e)', () => {
  let app: INestApplication<App>;
  const productService = { findAll: jest.fn() };
  const stockService = { getTodayStock: jest.fn() };
  const profileService = {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  };
  const ordersService = {
    findMyOrders: jest.fn(),
    findOneForDealer: jest.fn(),
    createMyOrder: jest.fn(),
    findAllForAdmin: jest.fn(),
    findOneForAdmin: jest.fn(),
    updateStatusForAdmin: jest.fn(),
  };
  const token = { Authorization: 'Bearer test-token' };
  const adminToken = { Authorization: 'Bearer admin-token' };

  beforeEach(async () => {
    jest.resetAllMocks();
    productService.findAll.mockResolvedValue([
      {
        id: 'product-1',
        sku: 'ILTT-18060-PRO',
        name: 'ILTT 18060 PRO',
        isActive: true,
        category: { id: 'category-1', name: 'Battery Inverters' },
      },
    ]);
    stockService.getTodayStock.mockResolvedValue([
      {
        productId: 'product-1',
        sku: 'ILTT-18060-PRO',
        productName: 'ILTT 18060 PRO',
        categoryId: 'category-1',
        categoryName: 'Battery Inverters',
        sourceStockDate: '2026-07-26',
        quantity: 25,
        isCarriedForward: true,
        isAvailable: true,
      },
      {
        productId: 'product-2',
        sku: 'OPTIMUS-1250',
        productName: 'OPTIMUS 1250+',
        categoryId: 'category-1',
        categoryName: 'Battery Inverters',
        sourceStockDate: null,
        quantity: 0,
        isCarriedForward: false,
        isAvailable: false,
      },
    ]);
    profileService.getProfile.mockResolvedValue({
      id: 'dealer-1',
      username: 'dealer',
      role: UserRole.USER,
      shopName: 'ABC Electricals',
      contactNumber: '9876543210',
      address: 'Main Road',
    });
    profileService.updateProfile.mockImplementation(
      (userId: string, dto: Record<string, string>) =>
        Promise.resolve({
          id: userId,
          username: dto.username ?? 'dealer',
          role: UserRole.USER,
          shopName: dto.shopName ?? null,
          contactNumber: dto.contactNumber ?? null,
          address: dto.address ?? null,
        }),
    );
    ordersService.findMyOrders.mockResolvedValue([]);
    ordersService.createMyOrder.mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      status: 'PENDING',
      createdAt: '2026-07-26T10:00:00.000Z',
      totalItems: 1,
      totalQuantity: 2,
      items: [],
    });
    ordersService.findOneForDealer.mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      status: 'PENDING',
      items: [],
    });
    ordersService.findAllForAdmin.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
    });
    ordersService.findOneForAdmin.mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      items: [],
    });
    ordersService.updateStatusForAdmin.mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      status: 'APPROVED',
      items: [],
    });

    const moduleFixture = await Test.createTestingModule({
      controllers: [
        ProductsController,
        StockController,
        ProfileController,
        OrdersController,
        AdminOrdersController,
      ],
      providers: [
        { provide: ProductsService, useValue: productService },
        { provide: StockService, useValue: stockService },
        { provide: ProfileService, useValue: profileService },
        { provide: OrdersService, useValue: ordersService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(IsolatedJwtGuard)
      .overrideGuard(RolesGuard)
      .useClass(IsolatedRolesGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(appValidationPipe);
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires authentication for dealer profile access', async () => {
    await request(app.getHttpServer()).get('/v1/profile').expect(401);
  });

  it('returns active products with their category for an authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/products')
      .set(token)
      .expect(200);

    expect(responseData(response)).toEqual([
      expect.objectContaining({
        sku: 'ILTT-18060-PRO',
        category: { id: 'category-1', name: 'Battery Inverters' },
      }),
    ]);
  });

  it('returns available and yet-to-come stock for an authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/daily-stock/today')
      .set(token)
      .expect(200);

    expect(responseData(response)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quantity: 25, isAvailable: true }),
        expect.objectContaining({ quantity: 0, isAvailable: false }),
      ]),
    );
  });

  it('passes an optional stock-as-of date to the stock service', async () => {
    await request(app.getHttpServer())
      .get('/v1/daily-stock/today?date=2026-07-27')
      .set(token)
      .expect(200);

    expect(stockService.getTodayStock).toHaveBeenCalledWith('2026-07-27');
  });

  it('reads and updates only the current user profile', async () => {
    await request(app.getHttpServer())
      .get('/v1/profile')
      .set(token)
      .expect(200);
    expect(profileService.getProfile).toHaveBeenCalledWith('dealer-1');

    const response = await request(app.getHttpServer())
      .patch('/v1/profile')
      .set(token)
      .send({
        username: 'updated_dealer',
        shopName: 'Updated Electricals',
        contactNumber: '+91 9876543210',
        address: 'Updated Main Road',
      })
      .expect(200);

    expect(profileService.updateProfile).toHaveBeenCalledWith(
      'dealer-1',
      expect.objectContaining({ shopName: 'Updated Electricals' }),
    );
    expect(responseData(response)).toMatchObject({
      username: 'updated_dealer',
      shopName: 'Updated Electricals',
    });
  });

  it('rejects protected fields and invalid dealer profile input', async () => {
    await request(app.getHttpServer())
      .patch('/v1/profile')
      .set(token)
      .send({ role: 'ADMIN' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/v1/profile')
      .set(token)
      .send({ contactNumber: 'not-a-phone!' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/v1/profile')
      .set(token)
      .send({ address: 'a'.repeat(501) })
      .expect(400);
    expect(profileService.updateProfile).not.toHaveBeenCalled();
  });

  it('allows a dealer to place an order using only their JWT identity', async () => {
    await request(app.getHttpServer())
      .post('/v1/orders')
      .set(token)
      .send({
        items: [
          { productId: '11111111-1111-4111-8111-111111111111', quantity: 2 },
        ],
      })
      .expect(201);

    expect(ordersService.createMyOrder).toHaveBeenCalledWith(
      'dealer-1',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            productId: '11111111-1111-4111-8111-111111111111',
            quantity: 2,
          }),
        ],
      }),
    );
  });

  it('requires authentication before an order can be placed', async () => {
    await request(app.getHttpServer())
      .post('/v1/orders')
      .send({
        items: [
          { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
        ],
      })
      .expect(401);
  });

  it('gets one dealer order using only the dealer JWT identity', async () => {
    const orderId = '44444444-4444-4444-4444-444444444444';
    await request(app.getHttpServer())
      .get(`/v1/orders/my-orders/${orderId}`)
      .set(token)
      .expect(200);

    expect(ordersService.findOneForDealer).toHaveBeenCalledWith(
      'dealer-1',
      orderId,
    );
  });

  it('rejects invalid order quantities before the order service is called', async () => {
    await request(app.getHttpServer())
      .post('/v1/orders')
      .set(token)
      .send({
        items: [
          { productId: '11111111-1111-4111-8111-111111111111', quantity: 0 },
        ],
      })
      .expect(400);

    expect(ordersService.createMyOrder).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post('/v1/orders')
      .set(token)
      .send({
        items: [
          { productId: '11111111-1111-4111-8111-111111111111', quantity: -1 },
        ],
      })
      .expect(400);

    expect(ordersService.createMyOrder).not.toHaveBeenCalled();
  });

  it('keeps dealer booking and admin order APIs separated by role', async () => {
    await request(app.getHttpServer())
      .post('/v1/orders')
      .set(adminToken)
      .send({
        items: [
          { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
        ],
      })
      .expect(403);

    await request(app.getHttpServer())
      .get('/v1/admin/orders')
      .set(token)
      .expect(403);

    await request(app.getHttpServer())
      .get('/v1/admin/orders?page=1&limit=20')
      .set(adminToken)
      .expect(200);

    await request(app.getHttpServer())
      .get('/v1/admin/orders/44444444-4444-4444-4444-444444444444')
      .set(adminToken)
      .expect(200);

    expect(ordersService.findAllForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
    expect(ordersService.findOneForAdmin).toHaveBeenCalledWith(
      '44444444-4444-4444-4444-444444444444',
    );
  });

  it('allows only an administrator to approve a pending order', async () => {
    const orderId = '44444444-4444-4444-4444-444444444444';

    await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${orderId}/status`)
      .set(token)
      .send({ status: 'APPROVED' })
      .expect(403);

    const response = await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${orderId}/status`)
      .set(adminToken)
      .send({ status: 'APPROVED' })
      .expect(200);

    expect(ordersService.updateStatusForAdmin).toHaveBeenCalledWith(orderId, {
      status: 'APPROVED',
    });
    expect(responseData(response)).toMatchObject({ status: 'APPROVED' });
  });

  it('accepts partial fulfilment and cancellation with the existing status enum', async () => {
    const orderId = '44444444-4444-4444-4444-444444444444';

    await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${orderId}/status`)
      .set(adminToken)
      .send({
        status: 'PARTIALLY_FULFILLED',
        items: [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            approvedQuantity: 1,
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${orderId}/status`)
      .set(adminToken)
      .send({
        status: 'CANCELLED',
        cancellationReason: 'Product unavailable',
      })
      .expect(200);

    expect(ordersService.updateStatusForAdmin).toHaveBeenLastCalledWith(
      orderId,
      {
        status: 'CANCELLED',
        cancellationReason: 'Product unavailable',
      },
    );
  });

  it('requires a cancellation reason before the order service is called', async () => {
    await request(app.getHttpServer())
      .patch('/v1/admin/orders/44444444-4444-4444-4444-444444444444/status')
      .set(adminToken)
      .send({ status: 'CANCELLED' })
      .expect(400);

    expect(ordersService.updateStatusForAdmin).not.toHaveBeenCalled();
  });

  it('rejects unsupported admin order status values before the service is called', async () => {
    await request(app.getHttpServer())
      .patch('/v1/admin/orders/44444444-4444-4444-4444-444444444444/status')
      .set(adminToken)
      .send({ status: 'INVALID_STATUS' })
      .expect(400);

    expect(ordersService.updateStatusForAdmin).not.toHaveBeenCalled();
  });
});

function responseData(response: { body: unknown }): unknown {
  if (
    response.body === null ||
    typeof response.body !== 'object' ||
    !('data' in response.body)
  ) {
    throw new Error('Expected a standard API response envelope.');
  }
  return response.body.data;
}
