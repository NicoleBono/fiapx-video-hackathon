import { ConfigService } from '@nestjs/config';

const redisMock = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  disconnect: jest.fn(),
};
jest.mock('ioredis', () => {
  const ctor = jest.fn(() => redisMock);
  return { __esModule: true, default: ctor };
});

import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CacheService(new ConfigService({}));
  });

  it('builds the per-user cache key from the contract', () => {
    expect(service.userVideosKey('user-1')).toBe('videos:user:user-1');
  });

  it('returns null on a miss and parsed JSON on a hit', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    expect(await service.get('k')).toBeNull();

    redisMock.get.mockResolvedValueOnce(JSON.stringify([{ id: 'v1' }]));
    expect(await service.get('k')).toEqual([{ id: 'v1' }]);
  });

  it('writes with a 10s TTL', async () => {
    await service.set('k', { a: 1 });
    expect(redisMock.set).toHaveBeenCalledWith('k', '{"a":1}', 'EX', 10);
  });

  it('deletes a key', async () => {
    await service.del('k');
    expect(redisMock.del).toHaveBeenCalledWith('k');
  });
});
