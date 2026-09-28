import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/jwt-payload.interface';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideosService } from './videos.service';

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

@ApiTags('videos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({
    description: 'Upload aceito, processamento enfileirado',
    type: VideoResponseDto,
  })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<VideoResponseDto> {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    const video = await this.videosService.upload({
      userId: user.sub,
      email: user.email,
      originalFilename: file.originalname,
      buffer: file.buffer,
      mimeType: file.mimetype,
    });
    return VideoResponseDto.fromEntity(video);
  }

  @Get()
  @ApiOkResponse({ type: [VideoResponseDto] })
  async list(@CurrentUser() user: JwtPayload): Promise<VideoResponseDto[]> {
    const videos = await this.videosService.listByUser(user.sub);
    return videos.map((video) => VideoResponseDto.fromEntity(video));
  }

  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, filename } = await this.videosService.downloadZip(id, user.sub);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    stream.pipe(res);
  }
}
