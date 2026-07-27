import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { BillingModule } from './billing/billing.module';
import { CategoriesModule } from './categories/categories.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import configuration from './config/configuration';
import { validateEnvironment } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { DealersModule } from './dealers/dealers.module';
import { HealthModule } from './health/health.module';
import { LoggerModule } from './logger/logger.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { ProfileModule } from './profile/profile.module';
import { StockModule } from './stock/stock.module';
import { TallyModule } from './tally/tally.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    LoggerModule,
    DatabaseModule,
    AuthModule,
    AdminModule,
    UsersModule,
    DealersModule,
    CategoriesModule,
    ProductsModule,
    StockModule,
    OrdersModule,
    BillingModule,
    PaymentsModule,
    NotificationsModule,
    ProfileModule,
    HealthModule,
    TallyModule,
  ],
  providers: [
    LoggingInterceptor,
    ResponseInterceptor,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
