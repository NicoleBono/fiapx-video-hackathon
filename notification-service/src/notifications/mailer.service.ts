import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { VideoFailedPayload } from '../messaging/messaging.service';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('SMTP_FROM', 'noreply@fiapx.com');
    this.transporter = createTransport({
      host: this.config.get<string>('SMTP_HOST', 'mailhog'),
      port: parseInt(this.config.get<string>('SMTP_PORT', '1025'), 10),
      secure: false,
      ignoreTLS: true,
    });
  }

  async sendFailureNotification(payload: VideoFailedPayload): Promise<void> {
    const subject = `Falha no processamento do vídeo ${payload.videoId}`;
    const text = [
      `Olá,`,
      ``,
      `O processamento do seu vídeo (${payload.videoId}) falhou.`,
      `Motivo: ${payload.errorMessage}`,
      payload.permanent
        ? `Todas as tentativas de reprocessamento foram esgotadas. Envie o vídeo novamente.`
        : `O sistema ainda pode tentar reprocessar automaticamente.`,
      ``,
      `Equipe FIAP X`,
    ].join('\n');

    await this.transporter.sendMail({
      from: this.from,
      to: payload.email,
      subject,
      text,
    });
    this.logger.log(`Failure e-mail sent to ${payload.email} for ${payload.videoId}`);
  }
}
