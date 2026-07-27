import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger?: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : undefined;
    const message = this.getMessage(exceptionResponse, exception);
    const requestId = String(response.getHeader('x-request-id') ?? 'unknown');

    if (!isHttpException) {
      this.logger?.error(
        `[${requestId}] ${request.method} ${request.url} failed: ${message}`,
      );
    }

    response.status(status).json({
      success: false,
      message,
      data: { path: request.url },
      timestamp: new Date().toISOString(),
    });
  }

  private getMessage(
    response: string | object | undefined,
    exception: unknown,
  ): string {
    if (typeof response === 'string') {
      return response;
    }
    if (response && 'message' in response) {
      const message = response.message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }
    return exception instanceof Error
      ? exception.message
      : 'Internal server error';
  }
}
