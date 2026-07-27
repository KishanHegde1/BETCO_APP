import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Dealer } from '../entities/dealer.entity';

@Injectable()
export class DealersRepository {
  constructor(
    @InjectRepository(Dealer) readonly repository: Repository<Dealer>,
  ) {}

  findByUserId(userId: string): Promise<Dealer | null> {
    return this.repository.findOneBy({ userId });
  }
}
