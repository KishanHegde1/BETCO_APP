import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { OrderStatus } from '../../entities/order.entity';

export class ApprovedOrderItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(0)
  approvedQuantity!: number;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ValidateIf(
    (dto: UpdateOrderStatusDto) =>
      dto.status === OrderStatus.PARTIALLY_FULFILLED,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApprovedOrderItemDto)
  items?: ApprovedOrderItemDto[];

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  adminRemarks?: string;

  @ValidateIf(
    (dto: UpdateOrderStatusDto) => dto.status === OrderStatus.CANCELLED,
  )
  @IsString()
  @Length(3, 1000)
  cancellationReason?: string;
}
