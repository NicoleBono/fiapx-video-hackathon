import { ConfigService } from '@nestjs/config';

const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail })),
}));

import * as nodemailer from 'nodemailer';
import { MailerService } from './mailer.service';

const basePayload = {
  videoId: 'v1',
  userId: 'u1',
  email: 'user@fiapx.com',
  errorMessage: 'ffmpeg exploded',
  permanent: true,
};

describe('MailerService', () => {
  let service: MailerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MailerService(
      new ConfigService({
        SMTP_HOST: 'mailhog',
        SMTP_PORT: '1025',
        SMTP_FROM: 'noreply@fiapx.com',
      }),
    );
  });

  it('creates a no-auth SMTP transport from config', () => {
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'mailhog', port: 1025, secure: false }),
    );
  });

  it('sends a failure e-mail to the user with the error reason', async () => {
    await service.sendFailureNotification(basePayload);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.from).toBe('noreply@fiapx.com');
    expect(mail.to).toBe('user@fiapx.com');
    expect(mail.subject).toContain('v1');
    expect(mail.text).toContain('ffmpeg exploded');
    expect(mail.text).toMatch(/esgotadas/i);
  });

  it('uses the non-permanent wording when permanent is false', async () => {
    await service.sendFailureNotification({ ...basePayload, permanent: false });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.text).toMatch(/reprocessar automaticamente/i);
  });
});
