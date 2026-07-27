import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';

import { UserRole } from '../common/constants/user-role.enum';
import { Category } from '../entities/category.entity';
import { DailyStock } from '../entities/daily-stock.entity';
import { Dealer } from '../entities/dealer.entity';
import { Product, ProductUnit } from '../entities/product.entity';
import { User } from '../entities/user.entity';

function getIndianCalendarDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts();
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed cannot run in production.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for the development seed.');
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url,
    ssl:
      process.env.DATABASE_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
    entities: [User, Dealer, Category, Product, DailyStock],
  });
  await dataSource.initialize();
  try {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
    const userPassword = process.env.SEED_USER_PASSWORD ?? 'ChangeMe123!';

    await dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      let admin = await users.findOneBy({ username: 'admin' });
      if (!admin) {
        admin = users.create({
          username: 'admin',
          phone: '9000000001',
          passwordHash: await bcrypt.hash(adminPassword, 12),
          role: UserRole.ADMIN,
          isActive: true,
          mustChangePassword: true,
        });
        await users.save(admin);
      }

      let dealerUser = await users.findOneBy({ username: 'dealer' });
      if (!dealerUser) {
        dealerUser = users.create({
          username: 'dealer',
          phone: '9000000002',
          passwordHash: await bcrypt.hash(userPassword, 12),
          role: UserRole.USER,
          isActive: true,
          mustChangePassword: true,
        });
        await users.save(dealerUser);
      }

      const dealers = manager.getRepository(Dealer);
      const dealer = await dealers.findOneBy({ userId: dealerUser.id });
      if (!dealer) {
        await dealers.save(
          dealers.create({
            userId: dealerUser.id,
            businessName: 'Demo Dealer',
            phone: dealerUser.phone,
          }),
        );
      }

      const categories = manager.getRepository(Category);
      const batteries = await findOrCreateCategory(categories, 'Batteries', 0);
      const inverters = await findOrCreateCategory(categories, 'Inverters', 1);
      const products = manager.getRepository(Product);
      const battery = await findOrCreateProduct(
        products,
        batteries.id,
        'BAT-150-AH',
        'Tubular Battery 150Ah',
        0,
      );
      const inverter = await findOrCreateProduct(
        products,
        inverters.id,
        'INV-1100',
        'Pure Sine Wave Inverter 1100VA',
        1,
      );
      const stocks = manager.getRepository(DailyStock);
      const today = getIndianCalendarDate();
      for (const [productId, quantity] of [
        [battery.id, 25],
        [inverter.id, 15],
      ] as const) {
        const existing = await stocks.findOneBy({
          productId,
          stockDate: today,
        });
        if (!existing) {
          await stocks.save(
            stocks.create({
              productId,
              stockDate: today,
              quantity,
            }),
          );
        }
      }
    });
    // Credentials are intentionally not printed. Set the two SEED_* variables before sign-in.
    console.log('Development catalogue seed completed.');
  } finally {
    await dataSource.destroy();
  }
}

async function findOrCreateCategory(
  repository: Repository<Category>,
  name: string,
  displayOrder: number,
): Promise<Category> {
  const existing = await repository
    .createQueryBuilder('category')
    .where('LOWER(category.name) = LOWER(:name)', { name })
    .getOne();
  if (existing) return existing;
  return repository.save(
    repository.create({
      name,
      description: `Sample ${name.toLowerCase()} catalogue`,
      imageUrl: null,
      displayOrder,
      isActive: true,
    }),
  );
}

async function findOrCreateProduct(
  repository: Repository<Product>,
  categoryId: string,
  sku: string,
  name: string,
  displayOrder: number,
): Promise<Product> {
  const existing = await repository
    .createQueryBuilder('product')
    .where('LOWER(product.sku) = LOWER(:sku)', { sku })
    .getOne();
  if (existing) return existing;
  return repository.save(
    repository.create({
      categoryId,
      sku,
      name,
      description: null,
      imageUrl: null,
      unit: ProductUnit.PIECE,
      displayOrder,
      isActive: true,
    }),
  );
}

void seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exitCode = 1;
});
