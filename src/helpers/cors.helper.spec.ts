import { parseCorsOrigins } from './cors.helper';

describe('parseCorsOrigins', () => {
  it('disables browser CORS when no origin is configured', () => {
    expect(parseCorsOrigins('')).toBe(false);
  });

  it('parses a comma-separated allowlist', () => {
    expect(
      parseCorsOrigins('https://app.example.com, https://admin.example.com'),
    ).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });
});
