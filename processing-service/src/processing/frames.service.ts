import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { readdir } from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';

@Injectable()
export class FramesService {
  private readonly logger = new Logger(FramesService.name);
  private readonly frameRate: number;

  constructor(private readonly config: ConfigService) {
    this.frameRate = parseFloat(this.config.get<string>('FRAME_RATE', '1'));
  }

  extractFrames(inputPath: string, outDir: string): Promise<number> {
    const pattern = join(outDir, 'frame-%05d.png');
    return new Promise<number>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-vf', `fps=${this.frameRate}`])
        .output(pattern)
        .on('error', (err: Error) => reject(err))
        .on('end', () => {
          readdir(outDir)
            .then((files) => resolve(files.filter((f) => f.endsWith('.png')).length))
            .catch(reject);
        })
        .run();
    });
  }

  zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err: Error) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir, false);
      void archive.finalize();
    });
  }
}
