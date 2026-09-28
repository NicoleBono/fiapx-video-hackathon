import { ConfigService } from '@nestjs/config';

const clientMock = {
  bucketExists: jest.fn(),
  makeBucket: jest.fn(),
  fGetObject: jest.fn(),
  fPutObject: jest.fn(),
};
jest.mock('minio', () => ({ Client: jest.fn(() => clientMock) }));

import { StorageService } from './storage.service';

describe('StorageService (processing-service)', () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageService(
      new ConfigService({
        MINIO_BUCKET_RAW: 'videos-raw',
        MINIO_BUCKET_ZIPS: 'videos-zips',
      }),
    );
  });

  it('creates missing buckets on init', async () => {
    clientMock.bucketExists.mockResolvedValue(false);
    await service.onModuleInit();
    expect(clientMock.makeBucket).toHaveBeenCalledWith('videos-raw');
    expect(clientMock.makeBucket).toHaveBeenCalledWith('videos-zips');
  });

  it('skips bucket creation when they already exist', async () => {
    clientMock.bucketExists.mockResolvedValue(true);
    await service.onModuleInit();
    expect(clientMock.makeBucket).not.toHaveBeenCalled();
  });

  it('downloads the raw object from the raw bucket to a local path', () => {
    service.downloadRaw('v1/clip.mp4', '/tmp/x/clip.mp4');
    expect(clientMock.fGetObject).toHaveBeenCalledWith(
      'videos-raw',
      'v1/clip.mp4',
      '/tmp/x/clip.mp4',
    );
  });

  it('uploads the zip to the zips bucket with the zip content type', async () => {
    await service.uploadZip('v1/frames.zip', '/tmp/x/frames.zip');
    expect(clientMock.fPutObject).toHaveBeenCalledWith(
      'videos-zips',
      'v1/frames.zip',
      '/tmp/x/frames.zip',
      { 'Content-Type': 'application/zip' },
    );
  });
});
