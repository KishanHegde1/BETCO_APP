import { HealthService } from './health.service';

describe('HealthService', () => {
  it('checks the database before reporting healthy', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService({ query } as never);

    await expect(service.getStatus()).resolves.toEqual({
      status: 'ok',
      service: 'betco-traders-backend',
      database: 'connected',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });
});
