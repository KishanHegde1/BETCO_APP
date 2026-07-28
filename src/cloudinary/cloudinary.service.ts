import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SolarProjectMediaType } from '../entities/solar-project-media.entity';
import { ApplicationConfiguration } from '../config/configuration';
import { CLOUDINARY } from './cloudinary.provider';
import type { CloudinaryClient } from './cloudinary.provider';

export interface CloudinaryMediaUpload {
  secureUrl: string;
  thumbnailUrl: string;
  publicId: string;
  mediaType: SolarProjectMediaType;
}

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: CloudinaryClient,
    private readonly configService: ConfigService<ApplicationConfiguration>,
  ) {}

  async uploadSolarProjectMedia(
    buffer: Buffer,
    mediaType: SolarProjectMediaType,
  ): Promise<CloudinaryMediaUpload> {
    const folder = this.requireFolder();
    const result = await new Promise<{
      secure_url: string;
      public_id: string;
      eager?: Array<{ secure_url?: string }>;
    }>((resolve, reject) => {
      const stream = this.cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type:
            mediaType === SolarProjectMediaType.VIDEO ? 'video' : 'image',
          transformation:
            mediaType === SolarProjectMediaType.IMAGE
              ? [
                  {
                    width: 1920,
                    crop: 'limit',
                    quality: 80,
                    fetch_format: 'webp',
                  },
                ]
              : [
                  {
                    height: 1080,
                    crop: 'limit',
                    quality: 'auto',
                    fetch_format: 'mp4',
                  },
                ],
          eager:
            mediaType === SolarProjectMediaType.IMAGE
              ? [
                  {
                    width: 640,
                    height: 480,
                    crop: 'fill',
                    quality: 'auto',
                    fetch_format: 'webp',
                  },
                ]
              : [
                  {
                    start_offset: '0',
                    width: 640,
                    height: 480,
                    crop: 'fill',
                    format: 'jpg',
                  },
                ],
          eager_async: false,
        },
        (error, upload) => {
          if (error || !upload?.secure_url || !upload.public_id) {
            reject(
              error instanceof Error
                ? error
                : new Error('Cloudinary did not return a media URL.'),
            );
            return;
          }
          resolve(upload);
        },
      );
      stream.end(buffer);
    });
    return {
      secureUrl: result.secure_url,
      thumbnailUrl:
        result.eager?.[0]?.secure_url ??
        this.deriveThumbnail(result.secure_url, mediaType),
      publicId: result.public_id,
      mediaType,
    };
  }

  async removeMedia(
    publicId: string,
    mediaType: SolarProjectMediaType,
  ): Promise<void> {
    if (!this.isConfigured()) return;
    await this.cloudinary.uploader.destroy(publicId, {
      resource_type:
        mediaType === SolarProjectMediaType.VIDEO ? 'video' : 'image',
      invalidate: true,
    });
  }

  private deriveThumbnail(
    secureUrl: string,
    mediaType: SolarProjectMediaType,
  ): string {
    const transformation =
      mediaType === SolarProjectMediaType.VIDEO
        ? 'so_0,c_fill,w_640,h_480,q_auto,f_jpg'
        : 'c_fill,w_640,h_480,q_auto,f_webp';
    return secureUrl.replace('/upload/', `/upload/${transformation}/`);
  }

  private requireFolder(): string {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Cloudinary is not configured for Solar Projects uploads.',
      );
    }
    return this.cloudinaryConfig()?.folder.trim() ?? '';
  }

  private isConfigured(): boolean {
    const config = this.cloudinaryConfig();
    return Boolean(
      config?.cloudName?.trim() &&
      config.apiKey?.trim() &&
      config.apiSecret?.trim(),
    );
  }

  private cloudinaryConfig():
    ApplicationConfiguration['cloudinary'] | undefined {
    return this.configService.get<ApplicationConfiguration['cloudinary']>(
      'cloudinary' as never,
    );
  }
}
