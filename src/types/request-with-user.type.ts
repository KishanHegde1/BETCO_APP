import { UserRole } from '../common/constants/user-role.enum';

export type RequestUser = {
  id: string;
  role: UserRole;
};
