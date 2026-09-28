import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { VideoStatus } from '../src/videos/entities/video.entity';
import { VideosController } from '../src/videos/videos.controller';
import { VideosService } from '../src/videos/videos.service';

const JWT_SECRET = 'e2e-secret';

describe('video-service (e2e)', () => {
  let app: INestApplication;
  let token: string;

  const videosService = {
    upload: jest.fn(),
    listByUser: jest.fn(),
    downloadZip: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      controllers: [VideosController],
      providers: [
        { provide: VideosService, useValue: videosService },
        JwtAuthGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    token = moduleRef
      .get(JwtService)
      .sign({ sub: 'user-1', username: 'jane', email: 'jane@e.com' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer()).get('/videos').expect(401);
  });

  it('accepts an upload and answers 202', async () => {
    videosService.upload.mockResolvedValue({
      id: 'vid-1',
      originalFilename: 'clip.mp4',
      status: VideoStatus.PENDING,
      frameCount: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app.getHttpServer())
      .post('/videos/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-mp4-bytes'), 'clip.mp4')
      .expect(202);

    expect(res.body).toMatchObject({ id: 'vid-1', status: 'PENDING' });
    expect(videosService.upload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', originalFilename: 'clip.mp4' }),
    );
  });

  it('returns 400 when no file is attached', async () => {
    await request(app.getHttpServer())
      .post('/videos/upload')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('lists the caller videos', async () => {
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

    const res = await request(app.getHttpServer())
      .get('/videos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: 'vid-1', frameCount: 6 });
    expect(videosService.listByUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects a non-uuid id on download with 400', async () => {
    await request(app.getHttpServer())
      .get('/videos/not-a-uuid/download')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
