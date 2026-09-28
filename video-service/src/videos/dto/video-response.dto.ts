import { ApiProperty } from '@nestjs/swagger';
import { Video, VideoStatus } from '../entities/video.entity';

export class VideoResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  originalFilename: string;

  @ApiProperty({ enum: VideoStatus })
  status: VideoStatus;

  @ApiProperty({ nullable: true, type: Number })
  frameCount: number | null;

  @ApiProperty({ nullable: true, type: String })
  errorMessage: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(video: Video): VideoResponseDto {
    const dto = new VideoResponseDto();
    dto.id = video.id;
    dto.originalFilename = video.originalFilename;
    dto.status = video.status;
    dto.frameCount = video.frameCount;
    dto.errorMessage = video.errorMessage;
    dto.createdAt = video.createdAt;
    dto.updatedAt = video.updatedAt;
    return dto;
  }
}
