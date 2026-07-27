import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Category } from '../entities/category.entity';
import { CategoriesRepository } from '../repositories/categories.repository';
import {
  AdminCategoryListQueryDto,
  CreateAdminCategoryDto,
  UpdateAdminCategoryDto,
} from './dto/admin-category.dto';

@Injectable()
export class CategoriesService {
  constructor(readonly categoriesRepository: CategoriesRepository) {}

  findAllForAdmin(query: AdminCategoryListQueryDto): Promise<Category[]> {
    return this.categoriesRepository.findAll(query);
  }

  async findOneForAdmin(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    return category;
  }

  async createForAdmin(dto: CreateAdminCategoryDto): Promise<Category> {
    const name = dto.name.trim();
    await this.assertNameAvailable(name);
    return this.categoriesRepository.save(
      this.categoriesRepository.repository.create({
        name,
        description: this.normalizedNullable(dto.description),
        imageUrl: this.normalizedNullable(dto.imageUrl),
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async updateForAdmin(
    id: string,
    dto: UpdateAdminCategoryDto,
  ): Promise<Category> {
    const category = await this.findOneForAdmin(id);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.assertNameAvailable(name, category.id);
      category.name = name;
    }
    if (dto.description !== undefined) {
      category.description = this.normalizedNullable(dto.description);
    }
    if (dto.imageUrl !== undefined) {
      category.imageUrl = this.normalizedNullable(dto.imageUrl);
    }
    if (dto.displayOrder !== undefined) {
      category.displayOrder = dto.displayOrder;
    }
    if (dto.isActive !== undefined) {
      category.isActive = dto.isActive;
    }
    return this.categoriesRepository.save(category);
  }

  async removeForAdmin(id: string): Promise<void> {
    const category = await this.findOneForAdmin(id);
    if (await this.categoriesRepository.hasProducts(id)) {
      throw new ConflictException(
        'This category contains products and cannot be deleted. Deactivate it instead.',
      );
    }
    await this.categoriesRepository.remove(category);
  }

  private async assertNameAvailable(
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const existing =
      await this.categoriesRepository.findByNameInsensitive(name);
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('A category with this name already exists.');
    }
  }

  private normalizedNullable(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
