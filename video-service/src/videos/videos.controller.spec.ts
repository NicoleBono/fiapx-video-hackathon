import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/jwt-payload.interface';
import { VideoStatus } from './entities/video.entity';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

const user: JwtPayload = { sub: 'user-1', username: 'jane', email: 'jane@e.com' };

describe('VideosController', () => {
  let controller: VideosController;
  const videosService = {
    upload: jest.fn(),
    listByUser: jest.fn(),
    downloadZip: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [VideosController],
      providers: [{ provide: VideosService, useValue: videosService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(VideosController);
  });

  it('rejects an upload with no file', async () => {
    await expect(
      controller.upload(undefined, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forwards an uploaded file to the service and returns a DTO', async () => {
    videosService.upload.mockResolvedValue({
      id: 'vid-1',
      originalFilename: 'clip.mp4',
      status: VideoStatus.PENDING,
      frameCount: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const file = {
      originalname: 'clip.mp4',
      mimetype: 'video/mp4',
      buffer: Buffer.from('x'),
    } as Express.Multer.File;

    const res = await controller.upload(file, user);

    expect(videosService.upload).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'jane@e.com',
      originalFilename: 'clip.mp4',
      buffer: file.buffer,
      mimeType: 'video/mp4',
    });
    expect(res).toMatchObject({ id: 'vid-1', status: VideoStatus.PENDING });
  });

  it('maps the list to DTOs', async () => {
    videosService.listByUser.mockResolvedValue([
      {
        id: 'vid-1',
        originalFilename: 'clip.mp4',
        status: VideoStatus.DONE,
        frameCount: 6,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await controller.list(user);

    expect(videosService.listByUser).toHaveBeenCalledWith('user-1');
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: 'vid-1', frameCount: 6 });
  });

  it('sets zip headers and pipes the stream on download', async () => {
    const pipe = jest.fn();
    videosService.downloadZip.mockResolvedValue({
      stream: { pipe },
      filename: 'vid-1-frames.zip',
    });
    const res = { set: jest.fn() } as never;

    await controller.download('vid-1', user, res);

    expect(videosService.downloadZip).toHaveBeenCalledWith('vid-1', 'user-1');
    expect((res as { set: jest.Mock }).set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="vid-1-frames.zip"',
      }),
    );
    expect(pipe).toHaveBeenCalledWith(res);
  });
});
