import { HttpException, HttpStatus } from '@nestjs/common';

/** A safe, stable error code for Flutter while retaining the appropriate HTTP status. */
export class ApiErrorException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
  ) {
    super({ code, message }, status);
  }
}

export const dealerProfileMissing = (): ApiErrorException =>
  new ApiErrorException(
    HttpStatus.CONFLICT,
    'DEALER_PROFILE_MISSING',
    'Complete your dealer profile before placing an order.',
  );

export const productNotFound = (): ApiErrorException =>
  new ApiErrorException(
    HttpStatus.NOT_FOUND,
    'PRODUCT_NOT_FOUND',
    'One or more products are unavailable.',
  );

export const productInactive = (): ApiErrorException =>
  new ApiErrorException(
    HttpStatus.CONFLICT,
    'PRODUCT_INACTIVE',
    'One or more products are unavailable.',
  );

export const insufficientStock = (): ApiErrorException =>
  new ApiErrorException(
    HttpStatus.CONFLICT,
    'INSUFFICIENT_STOCK',
    'Requested quantity exceeds available stock.',
  );

export const orderNotFound = (): ApiErrorException =>
  new ApiErrorException(
    HttpStatus.NOT_FOUND,
    'ORDER_NOT_FOUND',
    'Order not found.',
  );

export const orderAlreadyProcessed = (): ApiErrorException =>
  new ApiErrorException(
    HttpStatus.CONFLICT,
    'ORDER_ALREADY_PROCESSED',
    'This order has already been processed.',
  );
