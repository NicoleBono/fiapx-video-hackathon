import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { StorageModule } from '../storage/storage.module';
import { FramesService } from './frames.service';
import { ProcessingService } from './processing.service';

@Module({
  imports: [MessagingModule, StorageModule],
  providers: [FramesService, ProcessingService],
})
export class ProcessingModule {}
