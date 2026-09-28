import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { MessagingService } from './messaging.service';

jest.mock('amqplib');

type ConsumeCb = (msg: amqp.ConsumeMessage | null) => void;

const makeMsg = (body: unknown, retryCount?: number): amqp.ConsumeMessage =>
  ({
    content: Buffer.from(JSON.stringify(body)),
    fields: { routingKey: 'video.uploaded' },
    properties:
      retryCount === undefined
        ? { headers: {} }
        : { headers: { 'x-retry-count': retryCount } },
  }) as unknown as amqp.ConsumeMessage;

const uploaded = {
  videoId: 'v1',
  userId: 'u1',
  email: 'e@e.com',
  objectKey: 'v1/clip.mp4',
  originalFilename: 'clip.mp4',
};

describe('MessagingService (processing-service)', () => {
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

  const boot = async (maxRetries = '3') => {
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
    channel.consume.mockImplementation((_q: string, cb: ConsumeCb) => {
      consumeCb = cb;
      return Promise.resolve({ consumerTag: 't' });
    });
    service = new MessagingService(
      new ConfigService({
        RABBITMQ_EXCHANGE: 'video-events',
        RABBITMQ_MAX_RETRIES: maxRetries,
      }),
    );
    await service.onModuleInit();
  };

  beforeEach(() => jest.clearAllMocks());

  it('declares the DLX topology and binds the processing queue to video.uploaded', async () => {
    await boot();
    expect(channel.assertExchange).toHaveBeenCalledWith('video-events', 'topic', {
      durable: true,
    });
    expect(channel.assertExchange).toHaveBeenCalledWith(
      'video-events.dlx',
      'fanout',
      { durable: true },
    );
    expect(channel.assertQueue).toHaveBeenCalledWith('video.processing.queue', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'video-events.dlx' },
    });
    expect(channel.assertQueue).toHaveBeenCalledWith('video.processing.queue.dlq', {
      durable: true,
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'video.processing.queue',
      'video-events',
      'video.uploaded',
    );
    expect(channel.prefetch).toHaveBeenCalledWith(1);
  });

  it('acks after a successful handler run', async () => {
    await boot();
    const handler = jest.fn().mockResolvedValue(undefined);
    service.registerUploadedHandler(handler);
    const msg = makeMsg(uploaded);

    await consumeCb(msg);

    expect(handler).toHaveBeenCalledWith(uploaded);
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('republishes with x-retry-count incremented on a transient failure', async () => {
    await boot('3');
    service.registerUploadedHandler(jest.fn().mockRejectedValue(new Error('boom')));
    const msg = makeMsg(uploaded, 1);

    await consumeCb(msg);

    const [exchange, key, , opts] = channel.publish.mock.calls[0];
    expect(exchange).toBe('video-events');
    expect(key).toBe('video.uploaded');
    expect(opts.headers).toEqual({ 'x-retry-count': 2 });
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('publishes a permanent video.failed once retries are exhausted', async () => {
    await boot('3');
    service.registerUploadedHandler(
      jest.fn().mockRejectedValue(new Error('still broken')),
    );
    const msg = makeMsg(uploaded, 3);

    await consumeCb(msg);

    const failedCall = channel.publish.mock.calls.find(
      (c) => c[1] === 'video.failed',
    );
    expect(failedCall).toBeDefined();
    expect(JSON.parse(failedCall[2].toString())).toEqual({
      videoId: 'v1',
      userId: 'u1',
      email: 'e@e.com',
      errorMessage: 'still broken',
      permanent: true,
    });
    expect(channel.ack).toHaveBeenCalledWith(msg);
    // no re-publish of video.uploaded on the terminal attempt
    expect(
      channel.publish.mock.calls.some((c) => c[1] === 'video.uploaded'),
    ).toBe(false);
  });

  it('discards a message with an invalid JSON body', async () => {
    await boot();
    service.registerUploadedHandler(jest.fn());
    const msg = {
      content: Buffer.from('not-json'),
      fields: { routingKey: 'video.uploaded' },
      properties: { headers: {} },
    } as unknown as amqp.ConsumeMessage;

    await consumeCb(msg);

    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('emits the status events with persistent JSON', async () => {
    await boot();
    service.publishProcessingStarted('v1');
    service.publishVideoCompleted('v1', 6, 'v1/frames.zip');

    const started = channel.publish.mock.calls.find(
      (c) => c[1] === 'video.processing.started',
    );
    const completed = channel.publish.mock.calls.find(
      (c) => c[1] === 'video.completed',
    );
    expect(JSON.parse(started[2].toString())).toEqual({ videoId: 'v1' });
    expect(JSON.parse(completed[2].toString())).toEqual({
      videoId: 'v1',
      frameCount: 6,
      zipObjectKey: 'v1/frames.zip',
    });
    expect(started[3]).toMatchObject({ persistent: true });
  });
});
