import 'reflect-metadata';

import { validateEnvironment } from './env.validation';

const productionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:password@example.neon.tech/neondb',
  JWT_SECRET: 'test-only-secret',
  CORS_ORIGIN: 'https://app.example.com',
};

describe('validateEnvironment', () => {
  it('accepts an explicitly configured production environment', () => {
    expect(() => validateEnvironment(productionEnvironment)).not.toThrow();
  });

  it('rejects missing database and JWT configuration outside tests', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', CORS_ORIGIN: '' }),
    ).toThrow('Environment validation failed');
  });

  it('rejects an allow-any-origin browser policy in production', () => {
    expect(() =>
      validateEnvironment({ ...productionEnvironment, CORS_ORIGIN: '*' }),
    ).toThrow('CORS_ORIGIN must be an explicit HTTPS origin');
  });

  it('allows isolated tests to omit deployment secrets', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test' })).not.toThrow();
  });
});
