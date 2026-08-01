import { validate } from 'class-validator';

import { CreateCashDeclarationDto } from './create-cash-declaration.dto';

describe('CreateCashDeclarationDto', () => {
  it('accepts a normal currency amount sent by the mobile client', async () => {
    const dto = Object.assign(new CreateCashDeclarationDto(), {
      amount: '35000.00',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a non-monetary amount', async () => {
    const dto = Object.assign(new CreateCashDeclarationDto(), {
      amount: '35,000',
    });

    await expect(validate(dto)).resolves.toHaveLength(1);
  });
});
