import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FramesService } from './frames.service';

describe('FramesService.zipDirectory', () => {
  let service: FramesService;
  let dir: string;

  beforeEach(async () => {
    service = new FramesService(new ConfigService({ FRAME_RATE: '1' }));
    dir = await mkdtemp(join(tmpdir(), 'frames-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('produces a non-empty zip archive from the frames directory', async () => {
    await writeFile(join(dir, 'frame-00001.png'), 'fake-png-1');
    await writeFile(join(dir, 'frame-00002.png'), 'fake-png-2');
    const zipPath = join(dir, '..', `${Date.now()}-frames.zip`);

    await service.zipDirectory(dir, zipPath);

    const zip = await readFile(zipPath);
    expect(zip.length).toBeGreaterThan(0);
    expect(zip.subarray(0, 2).toString('latin1')).toBe('PK'); // zip magic
    await rm(zipPath, { force: true });
  });
});
