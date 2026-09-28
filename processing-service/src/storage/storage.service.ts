import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: Client;
  readonly bucketRaw: string;
  readonly bucketZips: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'minio'),
      port: parseInt(this.config.get<string>('MINIO_PORT', '9000'), 10),
      useSSL: this.config.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'fiapx'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'fiapx12345'),
    });
    this.bucketRaw = this.config.get<string>('MINIO_BUCKET_RAW', 'videos-raw');
    this.bucketZips = this.config.get<string>('MINIO_BUCKET_ZIPS', 'videos-zips');
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket(this.bucketRaw);
    await this.ensureBucket(this.bucketZips);
  }

  private async ensureBucket(bucket: string): Promise<void> {
    const exists = await this.client.bucketExists(bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(bucket);
    }
  }

  downloadRaw(objectKey: string, destPath: string): Promise<void> {
    return this.client.fGetObject(this.bucketRaw, objectKey, destPath);
  }

  async uploadZip(objectKey: string, filePath: string): Promise<void> {
    await this.client.fPutObject(this.bucketZips, objectKey, filePath, {
      'Content-Type': 'application/zip',
    });
  }
}
