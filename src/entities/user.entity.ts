import { Column, Entity, Index } from 'typeorm';

import { UserRole } from '../common/constants/user-role.enum';
import { BaseEntity } from './base.entity';

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 255 })
  username!: string;

  @Index({ unique: true })
  @Column({ length: 20 })
  phone!: string;

  @Column({ nullable: true, length: 255 })
  email!: string | null;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole })
  role!: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'must_change_password', default: true })
  mustChangePassword!: boolean;
}
