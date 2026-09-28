import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { MessagingService } from './messaging.service';

jest.mock('amqplib');

type ConsumeCb = (msg: amqp.ConsumeMessage | null) => void;

describe('MessagingService (video-service)', () => {
  const channel = {
    assertExchange: jest.fn(),
    assertQueue: jest.fn(),
    bindQueue: jest.fn(),
    prefetch: jest.fn(),
    consume: jest.fn(),
    publish: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn(),
    close: jest.fn(),
  };
  const connection = {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn(),
  };
  let consumeCb: ConsumeCb;
  let service: MessagingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
    channel.consume.mockImplementation((_q: string, cb: ConsumeCb) => {
      consumeCb = cb;
      return Promise.resolve({ consumerTag: 't' });
    });

    const config = new ConfigService({ RABBITMQ_EXCHANGE: 'video-events' });
    service = new MessagingService(config);
    await service.onModuleInit();
  });

  it('sets up the topic exchange and binds the status queue to the 3 keys', () => {
    expect(channel.assertExchange).toHaveBeenCalledWith('video-events', 'topic', {
      durable: true,
    });
    expect(channel.assertQueue).toHaveBeenCalledWith('video.status.queue', {
      durable: true,
    });
    expect(channel.bindQueue.mock.calls.map((c) => c[2])).toEqual([
      'video.processing.started',
      'video.completed',
      'video.failed',
    ]);
    expect(channel.prefetch).toHaveBeenCalledWith(1);
  });

  it('publishes video.uploaded as a persistent JSON message', () => {
    service.publishVideoUploaded({
      videoId: 'v1',
      userId: 'u1',
      email: 'e@e.com',
      objectKey: 'v1/clip.mp4',
      originalFilename: 'clip.mp4',
    });

    const [exchange, key, buf, opts] = channel.publish.mock.calls[0];
    expect(exchange).toBe('video-events');
    expect(key).toBe('video.uploaded');
    expect(JSON.parse(buf.toString())).toMatchObject({ videoId: 'v1' });
    expect(opts).toMatchObject({ persistent: true });
  });

  it('acks a message after the registered handler succeeds', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    service.registerStatusHandler(handler);
    const msg = {
      content: Buffer.from(JSON.stringify({ videoId: 'v1' })),
      fields: { routingKey: 'video.completed' },
    } as unknown as amqp.ConsumeMessage;

    await consumeCb(msg);

    expect(handler).toHaveBeenCalledWith('video.completed', { videoId: 'v1' });
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('nacks without requeue when the handler throws', async () => {
    service.registerStatusHandler(jest.fn().mockRejectedValue(new Error('boom')));
    const msg = {
      content: Buffer.from(JSON.stringify({ videoId: 'v1' })),
      fields: { routingKey: 'video.completed' },
    } as unknown as amqp.ConsumeMessage;

    await consumeCb(msg);

    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });
});
