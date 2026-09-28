import { Test } from '@nestjs/testing';
import { MessagingService } from '../messaging/messaging.service';
import { MailerService } from './mailer.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  const messaging = { registerFailedHandler: jest.fn() };
  const mailer = { sendFailureNotification: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: MessagingService, useValue: messaging },
        { provide: MailerService, useValue: mailer },
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
  });
});
