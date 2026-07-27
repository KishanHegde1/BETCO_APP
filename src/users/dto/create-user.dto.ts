import {
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { UserRole } from '../../common/constants/user-role.enum';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  username!: string;

  @IsString()
  @Matches(/^\d{10,15}$/)
  phone!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
