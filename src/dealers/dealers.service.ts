import { Injectable } from '@nestjs/common';

import { Dealer } from '../entities/dealer.entity';
import { DealersRepository } from '../repositories/dealers.repository';

@Injectable()
export class DealersService {
  constructor(readonly dealersRepository: DealersRepository) {}

  findByUserId(userId: string): Promise<Dealer | null> {
    return this.dealersRepository.findByUserId(userId);
  }

  save(dealer: Dealer): Promise<Dealer> {
    return this.dealersRepository.repository.save(dealer);
  }

  create(
    values: Pick<Dealer, 'userId' | 'businessName' | 'phone' | 'address'>,
  ): Dealer {
    return this.dealersRepository.repository.create(values);
  }
}
