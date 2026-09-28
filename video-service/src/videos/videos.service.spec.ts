import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { MessagingService } from '../messaging/messaging.service';
import { StorageService } from '../storage/storage.service';
import { Video, VideoStatus } from './entities/video.entity';
import { VideosService } from './videos.service';

const makeVideo = (over: Partial<Video> = {}): Video => ({
  id: 'vid-1',
  userId: 'user-1',
  email: 'user@fiapx.com',
  originalFilename: 'clip.mp4',
  status: VideoStatus.PENDING,
  zipObjectKey: null,
  frameCount: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('VideosService', () => {
  let service: VideosService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let storage: jest.Mocked<Pick<StorageService, 'putRawObject' | 'getZipObject'>>;
  let cache: jest.Mocked<
    Pick<CacheService, 'get' | 'set' | 'del' | 'userVideosKey'>
  >;
  let messaging: jest.Mocked<
    Pick<MessagingService, 'registerStatusHandler' | 'publishVideoUploaded'>
  >;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x: Video) => x),
      save: jest.fn((x: Video) => Promise.resolve(x)),
    };
    storage = { putRawObject: jest.fn(), getZipObject: jest.fn() };
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      userVideosKey: jest.fn((id: string) => `videos:user:${id}`),
    };
    messaging = {
      registerStatusHandler: jest.fn(),
      publishVideoUploaded: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: getRepositoryToken(Video), useValue: repo },
        { provide: StorageService, useValue: storage },
        { provide: CacheService, useValue: cache },
        { provide: MessagingService, useValue: messaging },
      ],
    }).compile();

    service = moduleRef.get(VideosService);
  });

  it('registers its status handler on init', () => {
    service.onModuleInit();
    expect(messaging.registerStatusHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  describe('upload', () => {
    it('persists, stores the raw object, publishes the event and busts the cache', async () => {
      repo.save.mockResolvedValue(makeVideo({ id: 'vid-9' }));

      const result = await service.upload({
        userId: 'user-1',
        email: 'user@fiapx.com',
        originalFilename: 'clip.mp4',
        buffer: Buffer.from('data'),
        mimeType: 'video/mp4',
      });

      expect(result.id).toBe('vid-9');
      expect(storage.putRawObject).toHaveBeenCalledWith(
        'vid-9/clip.mp4',
        expect.any(Buffer),
        'video/mp4',
      );
      expect(messaging.publishVideoUploaded).toHaveBeenCalledWith({
        videoId: 'vid-9',
        userId: 'user-1',
        email: 'user@fiapx.com',
        objectKey: 'vid-9/clip.mp4',
        originalFilename: 'clip.mp4',
      });
      expect(cache.del).toHaveBeenCalledWith('videos:user:user-1');
    });
  });

  describe('listByUser', () => {
    it('returns the cached list without hitting the database', async () => {
      const cached = [makeVideo()];
      cache.get.mockResolvedValue(cached);

      const result = await service.listByUser('user-1');

      expect(result).toBe(cached);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('reads from the database and warms the cache on a miss', async () => {
      cache.get.mockResolvedValue(null);
      const rows = [makeVideo()];
      repo.find.mockResolvedValue(rows);

      const result = await service.listByUser('user-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
      expect(cache.set).toHaveBeenCalledWith('videos:user:user-1', rows);
      expect(result).toBe(rows);
    });
  });

  describe('getOwnedVideo', () => {
    it('returns the video when the caller owns it', async () => {
      const video = makeVideo();
      repo.findOne.mockResolvedValue(video);
      await expect(service.getOwnedVideo('vid-1', 'user-1')).resolves.toBe(video);
    });

    it('throws 404 when the video belongs to another user', async () => {
      repo.findOne.mockResolvedValue(makeVideo({ userId: 'someone-else' }));
      await expect(service.getOwnedVideo('vid-1', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the video does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getOwnedVideo('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('downloadZip', () => {
    it('streams the zip when the video is DONE', async () => {
      repo.findOne.mockResolvedValue(
        makeVideo({ status: VideoStatus.DONE, zipObjectKey: 'vid-1/frames.zip' }),
      );
      const fakeStream = { pipe: jest.fn() } as never;
      storage.getZipObject.mockResolvedValue(fakeStream);

      const result = await service.downloadZip('vid-1', 'user-1');

      expect(storage.getZipObject).toHaveBeenCalledWith('vid-1/frames.zip');
      expect(result).toEqual({ stream: fakeStream, filename: 'vid-1-frames.zip' });
    });

    it('throws 404 when the zip is not ready', async () => {
      repo.findOne.mockResolvedValue(makeVideo({ status: VideoStatus.PROCESSING }));
      await expect(service.downloadZip('vid-1', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('status events', () => {
    const applyEvent = (routingKey: string, payload: Record<string, unknown>) => {
      let handler!: (rk: string, p: Record<string, unknown>) => Promise<void>;
      messaging.registerStatusHandler.mockImplementation((h) => {
        handler = h as typeof handler;
      });
      service.onModuleInit();
      return handler(routingKey, payload);
    };

    it('moves the video to PROCESSING on video.processing.started', async () => {
      const video = makeVideo();
      repo.findOne.mockResolvedValue(video);

      await applyEvent('video.processing.started', { videoId: 'vid-1' });

      expect(video.status).toBe(VideoStatus.PROCESSING);
      expect(repo.save).toHaveBeenCalledWith(video);
      expect(cache.del).toHaveBeenCalledWith('videos:user:user-1');
    });

    it('records frameCount and zip key on video.completed', async () => {
      const video = makeVideo({ status: VideoStatus.PROCESSING });
      repo.findOne.mockResolvedValue(video);

      await applyEvent('video.completed', {
        videoId: 'vid-1',
        frameCount: 42,
        zipObjectKey: 'vid-1/frames.zip',
      });

      expect(video.status).toBe(VideoStatus.DONE);
      expect(video.frameCount).toBe(42);
      expect(video.zipObjectKey).toBe('vid-1/frames.zip');
    });

    it('records the error message on video.failed', async () => {
      const video = makeVideo({ status: VideoStatus.PROCESSING });
      repo.findOne.mockResolvedValue(video);

      await applyEvent('video.failed', {
        videoId: 'vid-1',
        errorMessage: 'ffmpeg boom',
        permanent: true,
      });

      expect(video.status).toBe(VideoStatus.FAILED);
      expect(video.errorMessage).toBe('ffmpeg boom');
    });

    it('ignores an event for an unknown video', async () => {
      repo.findOne.mockResolvedValue(null);
      await applyEvent('video.completed', { videoId: 'ghost' });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('ignores an event without a videoId', async () => {
      await applyEvent('video.completed', {});
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });
});
