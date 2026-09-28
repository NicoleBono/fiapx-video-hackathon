import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

const STATUS_QUEUE = 'video.status.queue';
const STATUS_ROUTING_KEYS = [
  'video.processing.started',
  'video.completed',
  'video.failed',
];
const UPLOADED_ROUTING_KEY = 'video.uploaded';

export interface VideoUploadedPayload {
  videoId: string;
  userId: string;
  email: string;
  objectKey: string;
  originalFilename: string;
}

export type StatusEventHandler = (
  routingKey: string,
  payload: Record<string, unknown>,
) => Promise<void>;

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connection!: Awaited<ReturnType<typeof amqp.connect>>;
  private channel!: amqp.Channel;
  private readonly exchange: string;
  private statusHandler: StatusEventHandler | null = null;

  constructor(private readonly config: ConfigService) {
    this.exchange = this.config.get<string>('RABBITMQ_EXCHANGE', 'video-events');
  }

  registerStatusHandler(handler: StatusEventHandler): void {
    this.statusHandler = handler;
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@rabbitmq:5672',
    );
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
    await this.channel.prefetch(1);
    await this.startStatusConsumer();
    this.logger.log(`Connected to RabbitMQ, exchange "${this.exchange}"`);
  }

  publishVideoUploaded(payload: VideoUploadedPayload): void {
    this.channel.publish(
      this.exchange,
      UPLOADED_ROUTING_KEY,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, contentType: 'application/json' },
    );
  }

  private async startStatusConsumer(): Promise<void> {
    await this.channel.assertQueue(STATUS_QUEUE, { durable: true });
    for (const key of STATUS_ROUTING_KEYS) {
      await this.channel.bindQueue(STATUS_QUEUE, this.exchange, key);
    }

    await this.channel.consume(STATUS_QUEUE, async (msg) => {
      if (!msg) {
        return;
      }
      const { routingKey } = msg.fields;
      try {
        const payload = JSON.parse(msg.content.toString()) as Record<string, unknown>;
        if (this.statusHandler) {
          await this.statusHandler(routingKey, payload);
        }
        this.channel.ack(msg);
      } catch (err) {
        this.logger.error(
          `Failed to handle "${routingKey}": ${(err as Error).message}`,
        );
        this.channel.nack(msg, false, false);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
