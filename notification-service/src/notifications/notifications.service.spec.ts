import { Test } from '@nestjs/testing';
import { MessagingService } from '../messaging/messaging.service';
import { MetricsService } from '../metrics/metrics.service';
import { MailerService } from './mailer.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  const messaging = { registerFailedHandler: jest.fn() };
  const mailer = { sendFailureNotification: jest.fn().mockResolvedValue(undefined) };
  const resultLabel = jest.fn().mockReturnValue({ inc: jest.fn() });
  const metrics = { notificationsSentTotal: { labels: resultLabel } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: MessagingService, useValue: messaging },
        { provide: MailerService, useValue: mailer },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  it('registers a failed-event handler on init', () => {
    service.onModuleInit();
    expect(messaging.registerFailedHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it('forwards a failed event to the mailer', async () => {
    let handler!: (p: unknown) => Promise<void>;
    messaging.registerFailedHandler.mockImplementation((h) => {
      handler = h;
    });
    service.onModuleInit();

    const payload = {
      videoId: 'v1',
      userId: 'u1',
      email: 'user@fiapx.com',
      errorMessage: 'boom',
      permanent: true,
    };
    await handler(payload);

    expect(mailer.sendFailureNotification).toHaveBeenCalledWith(payload);
    expect(resultLabel).toHaveBeenCalledWith('success');
  });

  it('records a failure metric and rethrows when the mailer fails', async () => {
    let handler!: (p: unknown) => Promise<void>;
    messaging.registerFailedHandler.mockImplementation((h) => {
      handler = h;
    });
    service.onModuleInit();
    mailer.sendFailureNotification.mockRejectedValueOnce(new Error('smtp down'));

    await expect(
      handler({
        videoId: 'v1',
        userId: 'u1',
        email: 'user@fiapx.com',
        errorMessage: 'boom',
        permanent: true,
      }),
    ).rejects.toThrow('smtp down');
    expect(resultLabel).toHaveBeenCalledWith('failure');
  });
});
