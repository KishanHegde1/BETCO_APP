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
    const message = isHttpException
      ? this.getMessage(exceptionResponse, exception)
      : 'Internal server error';
    const code = isHttpException
      ? this.getCode(exceptionResponse, status)
      : 'SERVER_ERROR';
    const requestId = String(response.getHeader('x-request-id') ?? 'unknown');

    if (!isHttpException) {
      this.logger?.error(
        `[${requestId}] ${request.method} ${request.url} failed: ${this.getMessage(
          exceptionResponse,
          exception,
        )}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      code,
      message,
      data: { path: request.url },
      timestamp: new Date().toISOString(),
    });
  }

  private getCode(
    response: string | object | undefined,
    status: number,
  ): string {
    if (response && typeof response === 'object' && 'code' in response) {
      const code = response.code;
      if (typeof code === 'string' && code.trim().length > 0) {
        return code;
      }
    }
    const defaultCodes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
    };
    return defaultCodes[status] ?? 'SERVER_ERROR';
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
