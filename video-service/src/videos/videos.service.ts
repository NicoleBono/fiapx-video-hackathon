import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { MessagingService } from '../messaging/messaging.service';
import { MetricsService } from '../metrics/metrics.service';
import { StorageService } from '../storage/storage.service';
import { Video, VideoStatus } from './entities/video.entity';

export interface UploadInput {
  userId: string;
  email: string;
  originalFilename: string;
  buffer: Buffer;
  mimeType: string;
}

@Injectable()
export class VideosService implements OnModuleInit {
  constructor(
    @InjectRepository(Video)
    private readonly videosRepository: Repository<Video>,
    private readonly storage: StorageService,
    private readonly cache: CacheService,
    private readonly messaging: MessagingService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.messaging.registerStatusHandler((routingKey, payload) =>
      this.applyStatusEvent(routingKey, payload),
    );
  }

  async upload(input: UploadInput): Promise<Video> {
    const video = await this.videosRepository.save(
      this.videosRepository.create({
        userId: input.userId,
        email: input.email,
        originalFilename: input.originalFilename,
        status: VideoStatus.PENDING,
      }),
    );

    const objectKey = `${video.id}/${input.originalFilename}`;
    await this.storage.putRawObject(objectKey, input.buffer, input.mimeType);

    this.messaging.publishVideoUploaded({
      videoId: video.id,
      userId: input.userId,
      email: input.email,
      objectKey,
      originalFilename: input.originalFilename,
    });

    await this.cache.del(this.cache.userVideosKey(input.userId));
    this.metrics.videosUploadedTotal.inc();
    return video;
  }

  async listByUser(userId: string): Promise<Video[]> {
    const key = this.cache.userVideosKey(userId);
    const cached = await this.cache.get<Video[]>(key);
    if (cached) {
      return cached;
    }

    const videos = await this.videosRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    await this.cache.set(key, videos);
    return videos;
  }

  async getOwnedVideo(id: string, userId: string): Promise<Video> {
    const video = await this.videosRepository.findOne({ where: { id } });
    if (!video || video.userId !== userId) {
      throw new NotFoundException('Video not found');
    }
    return video;
  }

  async downloadZip(
    id: string,
    userId: string,
  ): Promise<{ stream: Readable; filename: string }> {
    const video = await this.getOwnedVideo(id, userId);
    if (video.status !== VideoStatus.DONE || !video.zipObjectKey) {
      throw new NotFoundException('Zip not available for this video');
    }
    const stream = await this.storage.getZipObject(video.zipObjectKey);
    this.metrics.videoDownloadsTotal.inc();
    return { stream, filename: `${video.id}-frames.zip` };
  }

  private async applyStatusEvent(
    routingKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const videoId = payload.videoId;
    if (typeof videoId !== 'string') {
      return;
    }

    const video = await this.videosRepository.findOne({ where: { id: videoId } });
    if (!video) {
      return;
    }

    switch (routingKey) {
      case 'video.processing.started':
        video.status = VideoStatus.PROCESSING;
        break;
      case 'video.completed':
        video.status = VideoStatus.DONE;
        video.frameCount =
          typeof payload.frameCount === 'number' ? payload.frameCount : null;
        video.zipObjectKey =
          typeof payload.zipObjectKey === 'string' ? payload.zipObjectKey : null;
        video.errorMessage = null;
        break;
      case 'video.failed':
        video.status = VideoStatus.FAILED;
        video.errorMessage =
          typeof payload.errorMessage === 'string'
            ? payload.errorMessage
            : 'Processing failed';
        break;
      default:
        return;
    }

    await this.videosRepository.save(video);
    await this.cache.del(this.cache.userVideosKey(video.userId));
    this.metrics.videoStatusEventsTotal.labels(routingKey).inc();
  }
}
