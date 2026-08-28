import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AccountDeletionRequest,
  AccountDeletionRequestStatus,
} from '../entities/account-deletion-request.entity';
import { CreateAccountDeletionRequestDto } from './dto/create-account-deletion-request.dto';

@Injectable()
export class LegalService {
  constructor(
    @InjectRepository(AccountDeletionRequest)
    private readonly deletionRequests: Repository<AccountDeletionRequest>,
  ) {}

  createDeletionRequest(
    dto: CreateAccountDeletionRequestDto,
  ): Promise<AccountDeletionRequest> {
    return this.deletionRequests.save(
      this.deletionRequests.create({
        accountIdentifier: dto.accountIdentifier,
        contact: dto.contact,
        details: dto.details?.trim() || null,
        status: AccountDeletionRequestStatus.PENDING,
      }),
    );
  }
}
