import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MessagingService,
  VideoFailedPayload,
} from '../messaging/messaging.service';
import { MailerService } from './mailer.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit(): void {
    this.messaging.registerFailedHandler((payload) => this.notify(payload));
  }

  private async notify(payload: VideoFailedPayload): Promise<void> {
    this.logger.log(
      `Notifying ${payload.email} about failed video ${payload.videoId}`,
    );
    await this.mailer.sendFailureNotification(payload);
  }
}
