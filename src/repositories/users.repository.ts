import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

import { User } from '../entities/user.entity';

@Injectable()
export class UsersRepository {
  constructor(@InjectRepository(User) readonly repository: Repository<User>) {}

  findActiveByUsername(username: string): Promise<User | null> {
    return this.repository.findOne({
      where: { username: ILike(username.trim()), isActive: true },
    });
  }

  findActiveById(id: string): Promise<User | null> {
    return this.repository.findOne({ where: { id, isActive: true } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .where('LOWER(TRIM(user.username)) = LOWER(TRIM(:username))', {
        username,
      })
      .getOne();
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.repository.findOne({ where: { phone } });
  }

  save(user: User): Promise<User> {
    return this.repository.save(user);
  }
}
