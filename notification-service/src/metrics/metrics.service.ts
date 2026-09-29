import { Injectable } from '@nestjs/common';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly notificationsSentTotal = new Counter({
    name: 'notifications_sent_total',
    help: 'Total number of failure notifications processed, by result',
    labelNames: ['result'],
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ service: 'notification-service' });
    collectDefaultMetrics({ register: this.registry });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
