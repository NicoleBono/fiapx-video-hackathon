import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  MessagingService,
  VideoUploadedPayload,
} from '../messaging/messaging.service';
import { StorageService } from '../storage/storage.service';
import { FramesService } from './frames.service';

@Injectable()
export class ProcessingService implements OnModuleInit {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly storage: StorageService,
    private readonly frames: FramesService,
  ) {}

  onModuleInit(): void {
    this.messaging.registerUploadedHandler((payload) => this.process(payload));
  }

  private async process(payload: VideoUploadedPayload): Promise<void> {
    const { videoId, objectKey, originalFilename } = payload;
    this.logger.log(`Processing ${videoId} (${originalFilename})`);
    this.messaging.publishProcessingStarted(videoId);

    const workDir = await mkdtemp(join(tmpdir(), `video-${videoId}-`));
    try {
      const rawPath = join(workDir, originalFilename);
      const framesDir = join(workDir, 'frames');
      const zipPath = join(workDir, 'frames.zip');
      await mkdir(framesDir);

      await this.storage.downloadRaw(objectKey, rawPath);
      const frameCount = await this.frames.extractFrames(rawPath, framesDir);
      if (frameCount === 0) {
        throw new Error('ffmpeg produced no frames');
      }

      await this.frames.zipDirectory(framesDir, zipPath);
      const zipObjectKey = `${videoId}/frames.zip`;
      await this.storage.uploadZip(zipObjectKey, zipPath);

      this.messaging.publishVideoCompleted(videoId, frameCount, zipObjectKey);
      this.logger.log(`Completed ${videoId}: ${frameCount} frames -> ${zipObjectKey}`);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
