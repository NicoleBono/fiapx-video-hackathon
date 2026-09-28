import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { MessagingService } from './messaging.service';

jest.mock('amqplib');

type ConsumeCb = (msg: amqp.ConsumeMessage | null) => void;

const failed = {
  videoId: 'v1',
  userId: 'u1',
  email: 'e@e.com',
  errorMessage: 'boom',
  permanent: true,
};

const makeMsg = (body: unknown, retryCount?: number): amqp.ConsumeMessage =>
  ({
    content: Buffer.from(JSON.stringify(body)),
    fields: { routingKey: 'video.failed' },
    properties:
      retryCount === undefined
        ? { headers: {} }
        : { headers: { 'x-retry-count': retryCount } },
  }) as unknown as amqp.ConsumeMessage;

describe('MessagingService (notification-service)', () => {
  const channel = {
    assertExchange: jest.fn(),
    assertQueue: jest.fn(),
    bindQueue: jest.fn(),
    prefetch: jest.fn(),
    consume: jest.fn(),
    publish: jest.fn(),
    ack: jest.fn(),
    close: jest.fn(),
  };
  const connection = {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn(),
  };
  let consumeCb: ConsumeCb;
  let service: MessagingService;

  const boot = async () => {
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
    channel.consume.mockImplementation((_q: string, cb: ConsumeCb) => {
      consumeCb = cb;
      return Promise.resolve({ consumerTag: 't' });
    });
    service = new MessagingService(
      new ConfigService({
        RABBITMQ_EXCHANGE: 'video-events',
        RABBITMQ_MAX_RETRIES: '3',
      }),
    );
    await service.onModuleInit();
  };

  beforeEach(() => jest.clearAllMocks());

  it('binds the notification queue to video.failed with prefetch 1', async () => {
    await boot();
    expect(channel.assertQueue).toHaveBeenCalledWith('video.notification.queue', {
      durable: true,
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'video.notification.queue',
      'video-events',
      'video.failed',
    );
    expect(channel.prefetch).toHaveBeenCalledWith(1);
  });

  it('acks after the handler succeeds', async () => {
    await boot();
    const handler = jest.fn().mockResolvedValue(undefined);
    service.registerFailedHandler(handler);
    const msg = makeMsg(failed);

    await consumeCb(msg);

    expect(handler).toHaveBeenCalledWith(failed);
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('republishes with an incremented retry header on a transient failure', async () => {
    await boot();
    service.registerFailedHandler(jest.fn().mockRejectedValue(new Error('smtp down')));

    await consumeCb(makeMsg(failed, 1));

    const [, key, , opts] = channel.publish.mock.calls[0];
    expect(key).toBe('video.failed');
    expect(opts.headers).toEqual({ 'x-retry-count': 2 });
  });

  it('drops the message (ack, no republish) once retries are exhausted', async () => {
    await boot();
    service.registerFailedHandler(jest.fn().mockRejectedValue(new Error('smtp down')));
    const msg = makeMsg(failed, 3);

    await consumeCb(msg);

    expect(channel.publish).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('discards an unparseable message', async () => {
    await boot();
    service.registerFailedHandler(jest.fn());
    const msg = {
      content: Buffer.from('nope'),
      fields: { routingKey: 'video.failed' },
      properties: { headers: {} },
    } as unknown as amqp.ConsumeMessage;

    await consumeCb(msg);

    expect(channel.ack).toHaveBeenCalledWith(msg);
  });
});
