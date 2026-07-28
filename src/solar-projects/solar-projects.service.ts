import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  CloudinaryMediaUpload,
  CloudinaryService,
} from '../cloudinary/cloudinary.service';
import { UserRole } from '../common/constants/user-role.enum';
import {
  SolarProject,
  SolarProjectStatus,
} from '../entities/solar-project.entity';
import {
  SolarProjectMedia,
  SolarProjectMediaType,
} from '../entities/solar-project-media.entity';
import { CreateSolarProjectDto } from './dto/create-solar-project.dto';
import { SolarProjectQueryDto } from './dto/solar-project-query.dto';
import { UpdateSolarProjectDto } from './dto/update-solar-project.dto';

/** Files are retained in memory only for the duration of the Cloudinary stream. */
export interface UploadedSolarProjectFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_FILES_PER_PROJECT = 20;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

@Injectable()
export class SolarProjectsService {
  constructor(
    @InjectRepository(SolarProject)
    private readonly projects: Repository<SolarProject>,
    @InjectRepository(SolarProjectMedia)
    private readonly media: Repository<SolarProjectMedia>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    dto: CreateSolarProjectDto,
    createdBy: string,
    files: UploadedSolarProjectFile[] = [],
  ): Promise<SolarProject> {
    this.validateFiles(files, true);
    const uploads = await this.uploadFiles(files);

    try {
      const saved = await this.projects.manager.transaction(async (manager) => {
        const project = manager.create(SolarProject, {
          title: this.requiredText(dto.title, 'Project title'),
          description: this.requiredText(
            dto.description,
            'Project description',
          ),
          customerName: this.optionalText(dto.customerName),
          location: this.requiredText(dto.location, 'Location'),
          completionDate: dto.completionDate,
          category: this.requiredText(dto.category, 'Category'),
          status: dto.status ?? SolarProjectStatus.PUBLISHED,
          createdBy,
        });
        const persistedProject = await manager.save(project);
        await manager.save(
          uploads.map((upload, displayOrder) =>
            manager.create(SolarProjectMedia, {
              projectId: persistedProject.id,
              mediaUrl: upload.secureUrl,
              thumbnailUrl: upload.thumbnailUrl,
              publicId: upload.publicId,
              mediaType: upload.mediaType,
              displayOrder,
            }),
          ),
        );
        return persistedProject;
      });
      return this.requireProject(saved.id);
    } catch (error) {
      await this.removeCloudinaryUploads(uploads);
      throw error;
    }
  }

  async findAll(
    query: SolarProjectQueryDto,
    user: JwtPayload,
  ): Promise<{
    items: SolarProject[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const builder = this.projects
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.media', 'media');
    if (user.role !== UserRole.ADMIN) {
      builder.where('project.status = :published', {
        published: SolarProjectStatus.PUBLISHED,
      });
    }
    this.applyFilters(builder, query);
    const direction = query.sort === 'oldest' ? 'ASC' : 'DESC';
    const [items, totalItems] = await builder
      .orderBy('project.completion_date', direction)
      .addOrderBy('project.created_at', direction)
      .addOrderBy('media.display_order', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages: Math.ceil(totalItems / query.limit),
      },
    };
  }

  async findOne(id: string, user: JwtPayload): Promise<SolarProject> {
    const project = await this.getProject(id);
    if (
      !project ||
      (user.role !== UserRole.ADMIN &&
        project.status !== SolarProjectStatus.PUBLISHED)
    ) {
      throw new NotFoundException('Solar project not found.');
    }
    return project;
  }

  async findFilters(user: JwtPayload): Promise<{
    locations: string[];
    categories: string[];
    years: string[];
  }> {
    const builder = this.projects.createQueryBuilder('project');
    if (user.role !== UserRole.ADMIN) {
      builder.where('project.status = :published', {
        published: SolarProjectStatus.PUBLISHED,
      });
    }
    const [locations, categories, years] = await Promise.all([
      builder
        .clone()
        .select('DISTINCT project.location', 'value')
        .orderBy('value', 'ASC')
        .getRawMany<{ value: string }>(),
      builder
        .clone()
        .select('DISTINCT project.category', 'value')
        .orderBy('value', 'ASC')
        .getRawMany<{ value: string }>(),
      builder
        .clone()
        .select("DISTINCT TO_CHAR(project.completion_date, 'YYYY')", 'value')
        .orderBy('value', 'DESC')
        .getRawMany<{ value: string }>(),
    ]);
    return {
      locations: locations.map((item) => item.value),
      categories: categories.map((item) => item.value),
      years: years.map((item) => item.value),
    };
  }

  async update(
    id: string,
    dto: UpdateSolarProjectDto,
    files: UploadedSolarProjectFile[] = [],
  ): Promise<SolarProject> {
    const existing = await this.requireProject(id);
    const mediaToRemove = this.getRemovedMedia(
      existing.media,
      dto.removedMediaIds,
    );
    this.validateFiles(
      files,
      false,
      existing.media.length - mediaToRemove.length,
    );
    const uploads = await this.uploadFiles(files);

    try {
      await this.projects.manager.transaction(async (manager) => {
        const project = await manager.findOneOrFail(SolarProject, {
          where: { id },
        });
        this.applyUpdate(project, dto);
        await manager.save(project);
        if (mediaToRemove.length) {
          await manager.delete(
            SolarProjectMedia,
            mediaToRemove.map((media) => media.id),
          );
        }
        const startOrder = existing.media.length - mediaToRemove.length;
        if (uploads.length) {
          await manager.save(
            uploads.map((upload, index) =>
              manager.create(SolarProjectMedia, {
                projectId: id,
                mediaUrl: upload.secureUrl,
                thumbnailUrl: upload.thumbnailUrl,
                publicId: upload.publicId,
                mediaType: upload.mediaType,
                displayOrder: startOrder + index,
              }),
            ),
          );
        }
      });
    } catch (error) {
      await this.removeCloudinaryUploads(uploads);
      throw error;
    }

    await Promise.allSettled(
      mediaToRemove.map((item) =>
        this.cloudinaryService.removeMedia(item.publicId, item.mediaType),
      ),
    );
    return this.requireProject(id);
  }

  async remove(id: string): Promise<{ id: string }> {
    const project = await this.requireProject(id);
    await this.projects.remove(project);
    await Promise.allSettled(
      project.media.map((item) =>
        this.cloudinaryService.removeMedia(item.publicId, item.mediaType),
      ),
    );
    return { id };
  }

  private async getProject(id: string): Promise<SolarProject | null> {
    return this.projects
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.media', 'media')
      .where('project.id = :id', { id })
      .orderBy('media.display_order', 'ASC')
      .getOne();
  }

  private async requireProject(id: string): Promise<SolarProject> {
    const project = await this.getProject(id);
    if (!project) throw new NotFoundException('Solar project not found.');
    return project;
  }

  private applyFilters(
    builder: ReturnType<Repository<SolarProject>['createQueryBuilder']>,
    query: SolarProjectQueryDto,
  ): void {
    const search = query.search?.trim();
    if (search) {
      builder.andWhere(
        new Brackets((nested) => {
          nested
            .where('project.title ILIKE :search', { search: `%${search}%` })
            .orWhere('project.description ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('project.location ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('project.category ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }
    if (query.location?.trim()) {
      builder.andWhere('project.location = :location', {
        location: query.location.trim(),
      });
    }
    if (query.category?.trim()) {
      builder.andWhere('project.category = :category', {
        category: query.category.trim(),
      });
    }
    if (query.year?.trim()) {
      if (!/^\d{4}$/.test(query.year)) {
        throw new BadRequestException('Year must be four digits.');
      }
      builder.andWhere("TO_CHAR(project.completion_date, 'YYYY') = :year", {
        year: query.year,
      });
    }
  }

  private applyUpdate(project: SolarProject, dto: UpdateSolarProjectDto): void {
    if (dto.title !== undefined) {
      project.title = this.requiredText(dto.title, 'Project title');
    }
    if (dto.description !== undefined) {
      project.description = this.requiredText(
        dto.description,
        'Project description',
      );
    }
    if (dto.customerName !== undefined) {
      project.customerName = this.optionalText(dto.customerName);
    }
    if (dto.location !== undefined) {
      project.location = this.requiredText(dto.location, 'Location');
    }
    if (dto.completionDate !== undefined)
      project.completionDate = dto.completionDate;
    if (dto.category !== undefined) {
      project.category = this.requiredText(dto.category, 'Category');
    }
    if (dto.status !== undefined) project.status = dto.status;
  }

  private validateFiles(
    files: UploadedSolarProjectFile[],
    isCreate: boolean,
    existingMediaCount = 0,
  ): void {
    if (isCreate && files.length === 0) {
      throw new BadRequestException('Add at least one image or video.');
    }
    if (existingMediaCount + files.length > MAX_FILES_PER_PROJECT) {
      throw new BadRequestException(
        `A project can contain up to ${MAX_FILES_PER_PROJECT} media files.`,
      );
    }
    for (const file of files) {
      if (!file.buffer?.length || file.size <= 0) {
        throw new BadRequestException('One selected media file is empty.');
      }
      if (IMAGE_MIME_TYPES.has(file.mimetype)) {
        if (file.size > MAX_IMAGE_BYTES) {
          throw new BadRequestException('Images must be 15 MB or smaller.');
        }
        continue;
      }
      if (VIDEO_MIME_TYPES.has(file.mimetype)) {
        if (file.size > MAX_VIDEO_BYTES) {
          throw new BadRequestException('Videos must be 200 MB or smaller.');
        }
        continue;
      }
      throw new BadRequestException(
        `Unsupported media type for ${file.originalname || 'the selected file'}.`,
      );
    }
  }

  private async uploadFiles(
    files: UploadedSolarProjectFile[],
  ): Promise<CloudinaryMediaUpload[]> {
    return Promise.all(
      files.map((file) =>
        this.cloudinaryService.uploadSolarProjectMedia(
          file.buffer,
          IMAGE_MIME_TYPES.has(file.mimetype)
            ? SolarProjectMediaType.IMAGE
            : SolarProjectMediaType.VIDEO,
        ),
      ),
    );
  }

  private getRemovedMedia(
    media: SolarProjectMedia[],
    rawMediaIds: string | undefined,
  ): SolarProjectMedia[] {
    if (!rawMediaIds?.trim()) return [];
    let ids: unknown;
    try {
      ids = JSON.parse(rawMediaIds);
    } catch {
      throw new BadRequestException('removedMediaIds must be a JSON array.');
    }
    if (
      !Array.isArray(ids) ||
      ids.some((value) => typeof value !== 'string' || !this.isUuid(value))
    ) {
      throw new BadRequestException(
        'removedMediaIds must contain valid media IDs.',
      );
    }
    const requestedIds = new Set(ids);
    const selected = media.filter((item) => requestedIds.has(item.id));
    if (selected.length !== requestedIds.size) {
      throw new BadRequestException(
        'One or more media files do not belong to this project.',
      );
    }
    return selected;
  }

  private async removeCloudinaryUploads(
    uploads: CloudinaryMediaUpload[],
  ): Promise<void> {
    await Promise.allSettled(
      uploads.map((upload) =>
        this.cloudinaryService.removeMedia(upload.publicId, upload.mediaType),
      ),
    );
  }

  private requiredText(value: string, field: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${field} is required.`);
    return normalized;
  }

  private optionalText(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
