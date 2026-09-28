import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

const PROCESSING_QUEUE = 'video.processing.queue';
const DLQ = 'video.processing.queue.dlq';
const UPLOADED_KEY = 'video.uploaded';
const STARTED_KEY = 'video.processing.started';
const COMPLETED_KEY = 'video.completed';
const FAILED_KEY = 'video.failed';

export interface VideoUploadedPayload {
  videoId: string;
  userId: string;
  email: string;
  objectKey: string;
  originalFilename: string;
}

export interface VideoFailedPayload {
  videoId: string;
  userId: string;
  email: string;
  errorMessage: string;
  permanent: boolean;
}

export type UploadedHandler = (payload: VideoUploadedPayload) => Promise<void>;

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connection!: Awaited<ReturnType<typeof amqp.connect>>;
  private channel!: amqp.Channel;
  private readonly exchange: string;
  private readonly dlx: string;
  private readonly maxRetries: number;
  private handler: UploadedHandler | null = null;

  constructor(private readonly config: ConfigService) {
    this.exchange = this.config.get<string>('RABBITMQ_EXCHANGE', 'video-events');
    this.dlx = `${this.exchange}.dlx`;
    this.maxRetries = parseInt(
      this.config.get<string>('RABBITMQ_MAX_RETRIES', '3'),
      10,
    );
  }

  registerUploadedHandler(handler: UploadedHandler): void {
    this.handler = handler;
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@rabbitmq:5672',
    );
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
    await this.channel.assertExchange(this.dlx, 'fanout', { durable: true });
    await this.channel.assertQueue(DLQ, { durable: true });
    await this.channel.bindQueue(DLQ, this.dlx, '');

    await this.channel.assertQueue(PROCESSING_QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': this.dlx },
    });
    await this.channel.bindQueue(PROCESSING_QUEUE, this.exchange, UPLOADED_KEY);
    await this.channel.prefetch(1);

    await this.startConsumer();
    this.logger.log(
      `Connected to RabbitMQ, consuming "${PROCESSING_QUEUE}" (maxRetries=${this.maxRetries})`,
    );
  }

  publishProcessingStarted(videoId: string): void {
    this.publish(STARTED_KEY, { videoId });
  }

  publishVideoCompleted(
    videoId: string,
    frameCount: number,
    zipObjectKey: string,
  ): void {
    this.publish(COMPLETED_KEY, { videoId, frameCount, zipObjectKey });
  }

  publishVideoFailed(payload: VideoFailedPayload): void {
    this.publish(FAILED_KEY, payload);
  }

  private publish(routingKey: string, payload: unknown): void {
    this.channel.publish(
      this.exchange,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, contentType: 'application/json' },
    );
  }

  private retryCount(msg: amqp.ConsumeMessage): number {
    const raw = msg.properties.headers?.['x-retry-count'];
    const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private async startConsumer(): Promise<void> {
    await this.channel.consume(PROCESSING_QUEUE, async (msg) => {
      if (!msg) {
        return;
      }

      let payload: VideoUploadedPayload;
      try {
        payload = JSON.parse(msg.content.toString()) as VideoUploadedPayload;
      } catch {
        this.logger.error('Invalid message payload, discarding');
        this.channel.ack(msg);
        return;
      }

      const attempt = this.retryCount(msg);
      try {
        if (this.handler) {
          await this.handler(payload);
        }
        this.channel.ack(msg);
      } catch (err) {
        const errorMessage = (err as Error).message;
        if (attempt >= this.maxRetries) {
          this.logger.error(
            `Giving up on ${payload.videoId} after ${attempt} retries: ${errorMessage}`,
          );
          this.publishVideoFailed({
            videoId: payload.videoId,
            userId: payload.userId,
            email: payload.email,
            errorMessage,
            permanent: true,
          });
        } else {
          this.logger.warn(
            `Retry ${attempt + 1}/${this.maxRetries} for ${payload.videoId}: ${errorMessage}`,
          );
          this.channel.publish(this.exchange, UPLOADED_KEY, msg.content, {
            persistent: true,
            contentType: 'application/json',
            headers: { 'x-retry-count': attempt + 1 },
          });
        }
        this.channel.ack(msg);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
