import { UserRole } from '../../common/constants/user-role.enum';

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    username: string;
    role: UserRole;
  };
  mustChangePassword: boolean;
}
