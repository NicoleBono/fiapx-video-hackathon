import { Global, Module } from '@nestjs/common';
import { MetricsServerService } from './metrics-server.service';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  providers: [MetricsService, MetricsServerService],
  exports: [MetricsService],
})
export class MetricsModule {}
