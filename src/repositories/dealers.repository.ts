import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { Dealer } from '../entities/dealer.entity';
import { User } from '../entities/user.entity';
import { UserRole } from '../common/constants/user-role.enum';

export interface StaffDealerSelectionRow {
  id: string;
  businessName: string;
  shopName: string | null;
  phone: string | null;
  contactNumber: string | null;
  dealerCode: string | null;
}

@Injectable()
export class DealersRepository {
  constructor(
    @InjectRepository(Dealer) readonly repository: Repository<Dealer>,
  ) {}

  findByUserId(userId: string): Promise<Dealer | null> {
    return this.repository.findOneBy({ userId });
  }

  /** Active dealers that staff may select while recording a phone order. */
  async findForStaffOrder(search?: string): Promise<StaffDealerSelectionRow[]> {
    const query = this.repository
      .createQueryBuilder('dealer')
      .innerJoin(User, 'user', 'user.id = dealer.user_id')
      .select([
        'dealer.id AS "id"',
        'dealer.business_name AS "businessName"',
        'dealer.shop_name AS "shopName"',
        'dealer.phone AS "phone"',
        'dealer.contact_number AS "contactNumber"',
        'dealer.dealer_code AS "dealerCode"',
      ])
      .where('user.role = :role', { role: UserRole.USER })
      .andWhere('user.is_active = :isActive', { isActive: true });

    const term = search?.trim();
    if (term) {
      query.andWhere(
        new Brackets((where) => {
          where
            .where('dealer.business_name ILIKE :search', {
              search: `%${term}%`,
            })
            .orWhere('dealer.shop_name ILIKE :search', {
              search: `%${term}%`,
            })
            .orWhere('dealer.phone ILIKE :search', {
              search: `%${term}%`,
            })
            .orWhere('dealer.contact_number ILIKE :search', {
              search: `%${term}%`,
            })
            .orWhere('dealer.dealer_code ILIKE :search', {
              search: `%${term}%`,
            });
        }),
      );
    }

    return query
      .orderBy('dealer.business_name', 'ASC')
      .addOrderBy('dealer.shop_name', 'ASC')
      .take(100)
      .getRawMany<StaffDealerSelectionRow>();
  }
}
