import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import { MetricsServerService } from './metrics-server.service';
import { MetricsService } from './metrics.service';

const get = (port: number, path: string): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });

describe('MetricsServerService', () => {
  const port = 19835;
  let service: MetricsServerService;

  beforeAll(() => {
    const metrics = new MetricsService();
    metrics.notificationsSentTotal.labels('success').inc();
    service = new MetricsServerService(metrics, new ConfigService({ METRICS_PORT: String(port) }));
    service.onModuleInit();
  });

  afterAll(() => {
    service.onModuleDestroy();
  });

  it('serves Prometheus text on GET /metrics', async () => {
    const res = await get(port, '/metrics');
    expect(res.status).toBe(200);
    expect(res.body).toContain('notifications_sent_total');
    expect(res.body).toContain('service="notification-service"');
  });

  it('answers 404 on any other path', async () => {
    const res = await get(port, '/');
    expect(res.status).toBe(404);
  });
});
