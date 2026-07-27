import { UserRole } from '../../common/constants/user-role.enum';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}
