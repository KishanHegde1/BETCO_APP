import { Injectable } from '@nestjs/common';

import { UsersRepository } from '../repositories/users.repository';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(readonly usersRepository: UsersRepository) {}

  findActiveByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findActiveByUsername(username);
  }

  findActiveById(id: string): Promise<User | null> {
    return this.usersRepository.findActiveById(id);
  }

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findByUsername(username);
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findByPhone(phone);
  }

  save(user: User): Promise<User> {
    return this.usersRepository.save(user);
  }
}
