import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { Category } from '../entities/category.entity';

@Injectable()
export class CategoriesRepository {
  constructor(
    @InjectRepository(Category) readonly repository: Repository<Category>,
  ) {}

  async findAll(options: {
    search?: string;
    isActive?: boolean;
  }): Promise<Category[]> {
    const query = this.repository.createQueryBuilder('category');
    if (options.search) {
      query.andWhere(
        new Brackets((builder) => {
          builder
            .where('category.name ILIKE :search', {
              search: `%${options.search}%`,
            })
            .orWhere('category.description ILIKE :search', {
              search: `%${options.search}%`,
            });
        }),
      );
    }
    if (options.isActive !== undefined) {
      query.andWhere('category.is_active = :isActive', {
        isActive: options.isActive,
      });
    }
    return query
      .orderBy('category.display_order', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .getMany();
  }

  findById(id: string): Promise<Category | null> {
    return this.repository.findOneBy({ id });
  }

  findByNameInsensitive(name: string): Promise<Category | null> {
    return this.repository
      .createQueryBuilder('category')
      .where('LOWER(category.name) = LOWER(:name)', { name })
      .getOne();
  }

  hasProducts(categoryId: string): Promise<boolean> {
    return this.repository.manager
      .getRepository('products')
      .createQueryBuilder('product')
      .where('product.category_id = :categoryId', { categoryId })
      .getExists();
  }

  save(category: Category): Promise<Category> {
    return this.repository.save(category);
  }

  remove(category: Category): Promise<Category> {
    return this.repository.remove(category);
  }
}
