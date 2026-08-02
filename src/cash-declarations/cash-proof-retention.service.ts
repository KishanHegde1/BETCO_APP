import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CashDeclaration } from '../entities/cash-declaration.entity';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Deletes expired proof images from Cloudinary. The database is only a record
 * of the URL/public ID; no screenshot is retained locally or in NeonDB.
 *
 * The job runs when the backend starts and every six hours thereafter. If the
 * service is temporarily offline, expired links are still hidden by the API
 * and deletion is retried when the service is available again.
 */
@Injectable()
export class CashProofRetentionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CashProofRetentionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectRepository(CashDeclaration)
    private readonly declarations: Repository<CashDeclaration>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  onModuleInit(): void {
    void this.removeExpiredProofs();
    this.timer = setInterval(
      () => void this.removeExpiredProofs(),
      CLEANUP_INTERVAL_MS,
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async removeExpiredProofs(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.declarations.find({
        where: {
          paymentProofExpiresAt: LessThanOrEqual(new Date()),
        },
        order: { paymentProofExpiresAt: 'ASC' },
        take: 100,
      });

      for (const declaration of due) {
        if (!declaration.paymentProofPublicId) {
          await this.clearProofMetadata(declaration.id);
          continue;
        }
        try {
          await this.cloudinaryService.removeCashDeclarationProof(
            declaration.paymentProofPublicId,
          );
          await this.clearProofMetadata(declaration.id);
        } catch (error) {
          this.logger.warn(
            `Could not remove expired payment proof for cash declaration ${declaration.id}; it will be retried.`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Cash proof retention cleanup failed; it will be retried.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async clearProofMetadata(id: string): Promise<void> {
    await this.declarations.update(id, {
      paymentProofUrl: null,
      paymentProofPublicId: null,
      paymentProofExpiresAt: null,
    });
  }
}
