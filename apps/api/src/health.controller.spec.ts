import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns an ok health response', () => {
    const controller = new HealthController();
    const response = controller.check();

    expect(response.status).toBe('ok');
    expect(response.service).toBe('nfse-api');
    expect(response.timestamp).toBeDefined();
  });
});
