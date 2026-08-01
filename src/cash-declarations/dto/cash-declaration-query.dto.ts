import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { CashDeclarationStatus } from '../../entities/cash-declaration.entity';

export class CashDeclarationQueryDto {
  @IsOptional()
  @IsIn([CashDeclarationStatus.PENDING, CashDeclarationStatus.RECEIVED])
  status?: CashDeclarationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
