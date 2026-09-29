import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly processingJobsTotal = new Counter({
    name: 'processing_jobs_total',
    help: 'Total number of processing attempts, by result',
    labelNames: ['result'],
    registers: [this.registry],
  });

  readonly processingJobDuration = new Histogram({
    name: 'processing_job_duration_seconds',
    help: 'Duration of a full frame-extraction job in seconds',
    buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
    registers: [this.registry],
  });

  readonly framesExtracted = new Histogram({
    name: 'processing_frames_extracted',
    help: 'Number of frames extracted per processed video',
    buckets: [1, 5, 10, 30, 60, 120, 300],
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ service: 'processing-service' });
    collectDefaultMetrics({ register: this.registry });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
