import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { MailerService } from './mailer.service';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [MessagingModule],
  providers: [MailerService, NotificationsService],
})
export class NotificationsModule {}
