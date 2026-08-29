import { normalizePostgresSslMode } from './configuration';

describe('normalizePostgresSslMode', () => {
  it('makes Neon TLS verification explicit without changing other parameters', () => {
    expect(
      normalizePostgresSslMode(
        'postgresql://user:password@example.neon.tech/neondb?sslmode=require&channel_binding=require',
      ),
    ).toBe(
      'postgresql://user:password@example.neon.tech/neondb?sslmode=verify-full&channel_binding=require',
    );
  });

  it('leaves an already explicit or absent SSL mode unchanged', () => {
    expect(
      normalizePostgresSslMode(
        'postgresql://user:password@example.neon.tech/neondb?sslmode=verify-full',
      ),
    ).toBe(
      'postgresql://user:password@example.neon.tech/neondb?sslmode=verify-full',
    );
    expect(normalizePostgresSslMode(undefined)).toBeUndefined();
  });
});
