import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, Server } from 'http';
import { MetricsService } from './metrics.service';

/**
 * Workers have no HTTP framework mounted (they're plain application
 * contexts), so this spins up a tiny raw HTTP server whose only job is to
 * answer `GET /metrics` for Prometheus to scrape.
 */
@Injectable()
export class MetricsServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsServerService.name);
  private server?: Server;

  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const port = parseInt(this.config.get<string>('METRICS_PORT', '9101'), 10);
    this.server = createServer((req, res) => {
      if (req.url === '/metrics') {
        this.metrics
          .metrics()
          .then((body) => {
            res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
            res.end(body);
          })
          .catch((err: Error) => {
            res.statusCode = 500;
            res.end(err.message);
          });
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    this.server.listen(port, () => {
      this.logger.log(`Metrics server listening on :${port}/metrics`);
    });
  }

  onModuleDestroy(): void {
    this.server?.close();
  }
}
