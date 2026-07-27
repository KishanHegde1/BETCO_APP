import { UserRole } from '../../common/constants/user-role.enum';

export interface JwtPayload {
  sub: string;
  role: UserRole;
}
