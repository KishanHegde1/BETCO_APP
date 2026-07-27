import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ProductUnit } from '../entities/product.entity';
import {
  AdminProductRow,
  DealerProductRow,
  ProductsRepository,
} from '../repositories/products.repository';
import {
  AdminProductListQueryDto,
  CreateAdminProductDto,
  UpdateAdminProductDto,
} from './dto/admin-product.dto';

export interface AdminProductResponse extends AdminProductRow {
  unit: ProductUnit;
  category: { id: string; name: string };
}

export interface PaginatedProductsResponse {
  items: AdminProductResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export type DealerProductResponse = DealerProductRow;

@Injectable()
export class ProductsService {
  constructor(readonly productsRepository: ProductsRepository) {}

  async findAll(): Promise<DealerProductResponse[]> {
    return this.productsRepository.findActiveCatalogue();
  }

  async findAllForAdmin(
    query: AdminProductListQueryDto,
  ): Promise<PaginatedProductsResponse> {
    const page = await this.productsRepository.findPage(query);
    return {
      items: page.items.map((product) => this.toResponse(product)),
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems: page.total,
        totalPages: Math.ceil(page.total / query.limit),
      },
    };
  }

  async findOneForAdmin(id: string): Promise<AdminProductResponse> {
    const product = await this.productsRepository.findAdminById(id);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return this.toResponse(product);
  }

  async createForAdmin(
    dto: CreateAdminProductDto,
  ): Promise<AdminProductResponse> {
    const category = await this.requireActiveCategory(dto.categoryId);
    const sku = dto.sku.trim().toUpperCase();
    await this.assertSkuAvailable(sku);
    const product = await this.productsRepository.save(
      this.productsRepository.repository.create({
        categoryId: category.id,
        name: dto.name.trim(),
        sku,
        description: this.normalizedNullable(dto.description),
        imageUrl: this.normalizedNullable(dto.imageUrl),
        unit: dto.unit,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      }),
    );
    return this.findOneForAdmin(product.id);
  }

  async updateForAdmin(
    id: string,
    dto: UpdateAdminProductDto,
  ): Promise<AdminProductResponse> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    if (dto.categoryId !== undefined) {
      product.categoryId = (
        await this.requireActiveCategory(dto.categoryId)
      ).id;
    }
    if (dto.sku !== undefined) {
      const sku = dto.sku.trim().toUpperCase();
      await this.assertSkuAvailable(sku, product.id);
      product.sku = sku;
    }
    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.description !== undefined) {
      product.description = this.normalizedNullable(dto.description);
    }
    if (dto.imageUrl !== undefined) {
      product.imageUrl = this.normalizedNullable(dto.imageUrl);
    }
    if (dto.unit !== undefined) product.unit = dto.unit;
    if (dto.displayOrder !== undefined) product.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) product.isActive = dto.isActive;
    await this.productsRepository.save(product);
    return this.findOneForAdmin(product.id);
  }

  async removeForAdmin(id: string): Promise<void> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    if (await this.productsRepository.isReferenced(id)) {
      throw new ConflictException(
        'This product is referenced by stock or orders and cannot be deleted. Deactivate it instead.',
      );
    }
    await this.productsRepository.remove(product);
  }

  private async requireActiveCategory(categoryId: string) {
    const category = await this.productsRepository.findCategoryById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    if (!category.isActive) {
      throw new ConflictException(
        'An inactive category cannot receive products.',
      );
    }
    return category;
  }

  private async assertSkuAvailable(sku: string, exceptId?: string) {
    const existing = await this.productsRepository.findBySkuInsensitive(sku);
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('A product with this SKU already exists.');
    }
  }

  private normalizedNullable(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private toResponse(product: AdminProductRow): AdminProductResponse {
    return {
      ...product,
      unit: product.unit as ProductUnit,
      category: { id: product.categoryId, name: product.categoryName },
    };
  }
}
