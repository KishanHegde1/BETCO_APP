import { IsUUID } from 'class-validator';

import { CreateOrderDto } from './create-order.dto';

/**
 * A staff member records a dealer's phone/notebook order for later admin
 * approval. Dealers cannot use this DTO or endpoint themselves.
 */
export class CreateStaffOrderDto extends CreateOrderDto {
  @IsUUID()
  dealerId!: string;
}
