import { Test } from '@nestjs/testing';
import { readdir } from 'fs/promises';
import { MessagingService } from '../messaging/messaging.service';
import { StorageService } from '../storage/storage.service';
import { FramesService } from './frames.service';
import { ProcessingService } from './processing.service';

const uploaded = {
  videoId: 'v1',
  userId: 'u1',
  email: 'e@e.com',
  objectKey: 'v1/clip.mp4',
  originalFilename: 'clip.mp4',
};

describe('ProcessingService', () => {
  let service: ProcessingService;
  const messaging = {
    registerUploadedHandler: jest.fn(),
    publishProcessingStarted: jest.fn(),
    publishVideoCompleted: jest.fn(),
    publishVideoFailed: jest.fn(),
  };
  const storage = {
    downloadRaw: jest.fn().mockResolvedValue(undefined),
    uploadZip: jest.fn().mockResolvedValue(undefined),
  };
  const frames = {
    extractFrames: jest.fn(),
    zipDirectory: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProcessingService,
        { provide: MessagingService, useValue: messaging },
        { provide: StorageService, useValue: storage },
        { provide: FramesService, useValue: frames },
      ],
    }).compile();
    service = moduleRef.get(ProcessingService);
  });

  it('registers the uploaded handler on init', () => {
    service.onModuleInit();
    expect(messaging.registerUploadedHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  const runHandler = (payload = uploaded) => {
    let handler!: (p: typeof uploaded) => Promise<void>;
    messaging.registerUploadedHandler.mockImplementation((h) => {
      handler = h;
    });
    service.onModuleInit();
    return handler(payload);
  };

  it('runs the full pipeline and publishes completion', async () => {
    frames.extractFrames.mockResolvedValue(6);

    await runHandler();

    expect(messaging.publishProcessingStarted).toHaveBeenCalledWith('v1');
    expect(storage.downloadRaw).toHaveBeenCalledWith(
      'v1/clip.mp4',
      expect.stringContaining('clip.mp4'),
    );
    expect(frames.extractFrames).toHaveBeenCalled();
    expect(frames.zipDirectory).toHaveBeenCalled();
    expect(storage.uploadZip).toHaveBeenCalledWith(
      'v1/frames.zip',
      expect.stringContaining('frames.zip'),
    );
    expect(messaging.publishVideoCompleted).toHaveBeenCalledWith(
      'v1',
      6,
      'v1/frames.zip',
    );
  });

  it('throws when ffmpeg produces no frames (so messaging can retry)', async () => {
    frames.extractFrames.mockResolvedValue(0);

    await expect(runHandler()).rejects.toThrow(/no frames/i);
    expect(messaging.publishVideoCompleted).not.toHaveBeenCalled();
  });

  it('cleans up its work directory even when the pipeline fails', async () => {
    frames.extractFrames.mockRejectedValue(new Error('ffmpeg exploded'));

    let capturedDir = '';
    storage.downloadRaw.mockImplementation(async (_key: string, dest: string) => {
      capturedDir = dest;
    });

    await expect(runHandler()).rejects.toThrow('ffmpeg exploded');

    const workDir = capturedDir.replace(/\/clip\.mp4$/, '');
    await expect(readdir(workDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
