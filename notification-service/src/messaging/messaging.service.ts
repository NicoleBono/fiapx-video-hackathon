import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

const NOTIFICATION_QUEUE = 'video.notification.queue';
const FAILED_KEY = 'video.failed';

export interface VideoFailedPayload {
  videoId: string;
  userId: string;
  email: string;
  errorMessage: string;
  permanent: boolean;
}

export type FailedHandler = (payload: VideoFailedPayload) => Promise<void>;

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connection!: Awaited<ReturnType<typeof amqp.connect>>;
  private channel!: amqp.Channel;
  private readonly exchange: string;
  private readonly maxRetries: number;
  private handler: FailedHandler | null = null;

  constructor(private readonly config: ConfigService) {
    this.exchange = this.config.get<string>('RABBITMQ_EXCHANGE', 'video-events');
    this.maxRetries = parseInt(
      this.config.get<string>('RABBITMQ_MAX_RETRIES', '3'),
      10,
    );
  }

  registerFailedHandler(handler: FailedHandler): void {
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
    await this.channel.assertQueue(NOTIFICATION_QUEUE, { durable: true });
    await this.channel.bindQueue(NOTIFICATION_QUEUE, this.exchange, FAILED_KEY);
    await this.channel.prefetch(1);

    await this.startConsumer();
    this.logger.log(`Connected to RabbitMQ, consuming "${NOTIFICATION_QUEUE}"`);
  }

  private retryCount(msg: amqp.ConsumeMessage): number {
    const raw = msg.properties.headers?.['x-retry-count'];
    const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private async startConsumer(): Promise<void> {
    await this.channel.consume(NOTIFICATION_QUEUE, async (msg) => {
      if (!msg) {
        return;
      }

      let payload: VideoFailedPayload;
      try {
        payload = JSON.parse(msg.content.toString()) as VideoFailedPayload;
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
            `Dropping notification for ${payload.videoId} after ${attempt} retries: ${errorMessage}`,
          );
        } else {
          this.logger.warn(
            `Retry ${attempt + 1}/${this.maxRetries} for ${payload.videoId}: ${errorMessage}`,
          );
          this.channel.publish(this.exchange, FAILED_KEY, msg.content, {
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
