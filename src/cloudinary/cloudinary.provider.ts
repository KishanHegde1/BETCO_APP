import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

import { ApplicationConfiguration } from '../config/configuration';

export const CLOUDINARY = Symbol('CLOUDINARY');

export const cloudinaryProvider = {
  provide: CLOUDINARY,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<ApplicationConfiguration>) => {
    const config = configService.get<ApplicationConfiguration['cloudinary']>(
      'cloudinary' as never,
    );
    cloudinary.config({
      cloud_name: config?.cloudName,
      api_key: config?.apiKey,
      api_secret: config?.apiSecret,
      secure: true,
    });
    return cloudinary;
  },
};

export type CloudinaryClient = typeof cloudinary;
