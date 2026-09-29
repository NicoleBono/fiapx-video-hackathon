import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetricsModule } from './metrics/metrics.module';
import { ProcessingModule } from './processing/processing.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), MetricsModule, ProcessingModule],
})
export class AppModule {}
