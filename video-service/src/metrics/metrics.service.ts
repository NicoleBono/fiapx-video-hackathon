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

  readonly videosUploadedTotal = new Counter({
    name: 'videos_uploaded_total',
    help: 'Total number of videos accepted for upload',
    registers: [this.registry],
  });

  readonly videoStatusEventsTotal = new Counter({
    name: 'video_status_events_total',
    help: 'Total number of status events consumed from RabbitMQ',
    labelNames: ['routing_key'],
    registers: [this.registry],
  });

  readonly videoDownloadsTotal = new Counter({
    name: 'video_downloads_total',
    help: 'Total number of successful zip downloads',
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ service: 'video-service' });
    collectDefaultMetrics({ register: this.registry });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
