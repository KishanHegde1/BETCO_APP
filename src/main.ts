import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ExpressAdapter } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { appValidationPipe } from './common/pipes/app-validation.pipe';
import { parseCorsOrigins } from './helpers/cors.helper';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const corsOrigins = parseCorsOrigins(
    configService.get<string>('app.corsOrigin') ?? '',
  );

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  // Render is a reverse-proxy deployment. Trust its immediate proxy so client
  // IP-aware middleware, including throttling, works as intended.
  const httpAdapter = app.getHttpAdapter() as ExpressAdapter;
  httpAdapter.set('trust proxy', 1);
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: corsOrigins,
    // The API uses bearer tokens rather than cookies. Never pair an
    // allow-any-origin setting with credentialed browser requests.
    credentials: corsOrigins !== true && corsOrigins !== false,
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  app.useGlobalPipes(appValidationPipe);
  app.useGlobalFilters(
    new HttpExceptionFilter(app.get(WINSTON_MODULE_NEST_PROVIDER)),
  );
  app.useGlobalInterceptors(
    app.get(LoggingInterceptor),
    app.get(ResponseInterceptor),
  );
  if (configService.get<boolean>('swagger.enabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Betco Traders API')
      .setDescription('Backend API architecture for Betco Aqua Traders')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey(
        {
          type: 'apiKey',
          name: 'x-betco-sync-key',
          in: 'header',
        },
        'tally-connector',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
