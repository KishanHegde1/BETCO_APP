import { IsString, IsUUID, MaxLength } from 'class-validator';

export class NotificationDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsString()
  body!: string;
}
