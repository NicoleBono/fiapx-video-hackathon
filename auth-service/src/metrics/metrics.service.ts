import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  readonly authRegistrationsTotal = new Counter({
    name: 'auth_registrations_total',
    help: 'Total number of successful user registrations',
    registers: [this.registry],
  });

  readonly authLoginsTotal = new Counter({
    name: 'auth_logins_total',
    help: 'Total number of login attempts',
    labelNames: ['result'],
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ service: 'auth-service' });
    collectDefaultMetrics({ register: this.registry });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
