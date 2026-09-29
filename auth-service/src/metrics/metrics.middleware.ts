import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/metrics') {
      next();
      return;
    }

    const stopTimer = this.metrics.httpRequestDuration.startTimer();
    res.on('finish', () => {
      const route = (req.route?.path as string | undefined) ?? req.path;
      stopTimer({ method: req.method, route, status_code: String(res.statusCode) });
    });
    next();
  }
}
