import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { CloudinaryService } from '../cloudinary/cloudinary.service';
import {
  CashDeclaration,
  CashDeclarationStatus,
} from '../entities/cash-declaration.entity';
import { Dealer } from '../entities/dealer.entity';
import { User } from '../entities/user.entity';
import { CashDeclarationQueryDto } from './dto/cash-declaration-query.dto';
import { CreateCashDeclarationDto } from './dto/create-cash-declaration.dto';

export interface CashDeclarationListItem {
  id: string;
  dealerId: string;
  dealerName: string;
  dealerPhone: string | null;
  amount: string;
  cashGivenAt: Date;
  note: string | null;
  paymentProofUrl: string | null;
  paymentProofExpiresAt: Date | null;
  status: CashDeclarationStatus;
  receivedBy: string | null;
  receivedByName: string | null;
  receivedAt: Date | null;
  createdAt: Date;
}

export interface UploadedCashProofFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ACCEPTED_PROOF_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

@Injectable()
export class CashDeclarationsService {
  constructor(
    @InjectRepository(CashDeclaration)
    private readonly declarations: Repository<CashDeclaration>,
    @InjectRepository(Dealer)
    private readonly dealers: Repository<Dealer>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async createForDealer(
    userId: string,
    dto: CreateCashDeclarationDto,
    paymentProof?: UploadedCashProofFile,
  ): Promise<CashDeclaration> {
    const dealer = await this.dealers.findOne({ where: { userId } });
    if (!dealer) {
      throw new NotFoundException('Dealer account not found.');
    }

    const amount = this.amount(dto.amount);
    const cashGivenAt = dto.cashGivenAt
      ? new Date(dto.cashGivenAt)
      : new Date();
    if (Number.isNaN(cashGivenAt.valueOf())) {
      throw new BadRequestException('Cash-given date is invalid.');
    }

    this.validateProof(paymentProof);
    const upload = paymentProof
      ? await this.cloudinaryService.uploadCashDeclarationProof(
          paymentProof.buffer,
        )
      : null;
    const paymentProofExpiresAt = upload ? this.oneYearFromNow() : null;

    try {
      return await this.declarations.save(
        this.declarations.create({
          dealerId: dealer.id,
          amount: amount.toFixed(2),
          cashGivenAt,
          note: this.optionalText(dto.note),
          paymentProofUrl: upload?.secureUrl ?? null,
          paymentProofPublicId: upload?.publicId ?? null,
          paymentProofExpiresAt,
          status: CashDeclarationStatus.PENDING,
        }),
      );
    } catch (error) {
      if (upload) {
        await this.cloudinaryService
          .removeCashDeclarationProof(upload.publicId)
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async findMine(userId: string): Promise<CashDeclaration[]> {
    const dealer = await this.dealers.findOne({ where: { userId } });
    if (!dealer) {
      throw new NotFoundException('Dealer account not found.');
    }
    const declarations = await this.declarations.find({
      where: { dealerId: dealer.id },
      order: { cashGivenAt: 'DESC', createdAt: 'DESC' },
    });
    return declarations.map((declaration) =>
      this.hideExpiredProofForResponse(declaration),
    );
  }

  async findForOperations(
    query: CashDeclarationQueryDto,
  ): Promise<CashDeclarationListItem[]> {
    const builder = this.declarations
      .createQueryBuilder('declaration')
      .innerJoin(Dealer, 'dealer', 'dealer.id = declaration.dealer_id')
      .leftJoin(User, 'receiver', 'receiver.id = declaration.received_by')
      .select([
        'declaration.id AS "id"',
        'declaration.dealer_id AS "dealerId"',
        'dealer.business_name AS "dealerName"',
        'COALESCE(dealer.contact_number, dealer.phone) AS "dealerPhone"',
        'declaration.amount AS "amount"',
        'declaration.cash_given_at AS "cashGivenAt"',
        'declaration.note AS "note"',
        'declaration.payment_proof_url AS "paymentProofUrl"',
        'declaration.payment_proof_expires_at AS "paymentProofExpiresAt"',
        'declaration.status AS "status"',
        'declaration.received_by AS "receivedBy"',
        'receiver.username AS "receivedByName"',
        'declaration.received_at AS "receivedAt"',
        'declaration.created_at AS "createdAt"',
      ]);

    if (query.status) {
      builder.where('declaration.status = :status', { status: query.status });
    }
    const search = query.search?.trim();
    if (search) {
      builder.andWhere(
        new Brackets((nested) => {
          nested
            .where('dealer.business_name ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('dealer.shop_name ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('dealer.phone ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('dealer.contact_number ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    const rows = await builder
      .orderBy(
        `CASE WHEN declaration.status = '${CashDeclarationStatus.PENDING}' THEN 0 ELSE 1 END`,
        'ASC',
      )
      .addOrderBy('declaration.cash_given_at', 'DESC')
      .addOrderBy('declaration.created_at', 'DESC')
      .getRawMany<CashDeclarationListItem>();

    return rows.map((row) => ({
      ...row,
      dealerPhone: row.dealerPhone ?? null,
      note: row.note ?? null,
      paymentProofUrl: this.isExpired(row.paymentProofExpiresAt)
        ? null
        : (row.paymentProofUrl ?? null),
      paymentProofExpiresAt: this.isExpired(row.paymentProofExpiresAt)
        ? null
        : row.paymentProofExpiresAt
          ? new Date(row.paymentProofExpiresAt)
          : null,
      receivedBy: row.receivedBy ?? null,
      receivedByName: row.receivedByName ?? null,
      receivedAt: row.receivedAt ? new Date(row.receivedAt) : null,
      cashGivenAt: new Date(row.cashGivenAt),
      createdAt: new Date(row.createdAt),
    }));
  }

  async markReceived(
    id: string,
    receiverUserId: string,
  ): Promise<CashDeclaration> {
    const declaration = await this.declarations.manager.transaction(
      async (manager) => {
        const declaration = await manager.findOne(CashDeclaration, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!declaration) {
          throw new NotFoundException('Cash record not found.');
        }
        if (declaration.status === CashDeclarationStatus.RECEIVED) {
          throw new ConflictException(
            'This cash record is already marked received.',
          );
        }

        declaration.status = CashDeclarationStatus.RECEIVED;
        declaration.receivedBy = receiverUserId;
        declaration.receivedAt = new Date();
        return manager.save(declaration);
      },
    );
    return this.hideExpiredProofForResponse(declaration);
  }

  private amount(value: string): number {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) {
      throw new BadRequestException('Cash amount must be greater than zero.');
    }
    return amount;
  }

  private optionalText(value: string | undefined): string | null {
    const text = value?.trim();
    return text || null;
  }

  private validateProof(file: UploadedCashProofFile | undefined): void {
    if (!file) return;
    if (!file.buffer?.length || file.size <= 0) {
      throw new BadRequestException('The payment proof image is empty.');
    }
    if (!ACCEPTED_PROOF_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Payment proof must be a JPG, PNG, or WebP image.',
      );
    }
    if (file.size > MAX_PROOF_BYTES) {
      throw new BadRequestException(
        'Payment proof images must be 10 MB or smaller.',
      );
    }
  }

  private oneYearFromNow(): Date {
    const expiry = new Date();
    expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
    return expiry;
  }

  private isExpired(value: Date | string | null | undefined): boolean {
    if (!value) return false;
    const expiresAt = value instanceof Date ? value : new Date(value);
    return !Number.isNaN(expiresAt.valueOf()) && expiresAt <= new Date();
  }

  private hideExpiredProofForResponse(
    declaration: CashDeclaration,
  ): CashDeclaration {
    if (!this.isExpired(declaration.paymentProofExpiresAt)) return declaration;
    return Object.assign(declaration, {
      paymentProofUrl: null,
      paymentProofPublicId: null,
      paymentProofExpiresAt: null,
    });
  }
}
