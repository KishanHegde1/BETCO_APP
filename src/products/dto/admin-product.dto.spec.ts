import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AdminProductListQueryDto } from './admin-product.dto';

describe('AdminProductListQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ])('parses isActive=%p as %p', async (value, expected) => {
    const dto = plainToInstance(
      AdminProductListQueryDto,
      { isActive: value },
      { enableImplicitConversion: true },
    );

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.isActive).toBe(expected);
  });
});
