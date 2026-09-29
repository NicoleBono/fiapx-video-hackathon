import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MessagingService,
  VideoFailedPayload,
} from '../messaging/messaging.service';
import { MetricsService } from '../metrics/metrics.service';
import { MailerService } from './mailer.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly mailer: MailerService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.messaging.registerFailedHandler((payload) => this.notify(payload));
  }

  private async notify(payload: VideoFailedPayload): Promise<void> {
    this.logger.log(
      `Notifying ${payload.email} about failed video ${payload.videoId}`,
    );
    try {
      await this.mailer.sendFailureNotification(payload);
      this.metrics.notificationsSentTotal.labels('success').inc();
    } catch (err) {
      this.metrics.notificationsSentTotal.labels('failure').inc();
      throw err;
    }
  }
}
