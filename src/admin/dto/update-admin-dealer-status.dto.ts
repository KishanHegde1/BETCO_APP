import { IsBoolean } from 'class-validator';

export class UpdateAdminDealerStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
