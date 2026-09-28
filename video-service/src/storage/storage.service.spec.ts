import { ConfigService } from '@nestjs/config';

const clientMock = {
  bucketExists: jest.fn(),
  makeBucket: jest.fn(),
  putObject: jest.fn(),
  getObject: jest.fn(),
};
jest.mock('minio', () => ({ Client: jest.fn(() => clientMock) }));

import { StorageService } from './storage.service';

describe('StorageService', () => {
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

  it('creates only the buckets that do not exist yet on init', async () => {
    clientMock.bucketExists
      .mockResolvedValueOnce(false) // raw
      .mockResolvedValueOnce(true); // zips

    await service.onModuleInit();

    expect(clientMock.makeBucket).toHaveBeenCalledTimes(1);
    expect(clientMock.makeBucket).toHaveBeenCalledWith('videos-raw');
  });

  it('uploads the raw object into the raw bucket with its mime type', async () => {
    const body = Buffer.from('bytes');
    await service.putRawObject('v1/clip.mp4', body, 'video/mp4');
    expect(clientMock.putObject).toHaveBeenCalledWith(
      'videos-raw',
      'v1/clip.mp4',
      body,
      body.length,
      { 'Content-Type': 'video/mp4' },
    );
  });

  it('reads the zip object from the zips bucket', () => {
    service.getZipObject('v1/frames.zip');
    expect(clientMock.getObject).toHaveBeenCalledWith('videos-zips', 'v1/frames.zip');
  });
});
