import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Pick<Repository<User>, 'findOne' | 'create' | 'save'>>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('looks up a user by email', async () => {
    await service.findByEmail('jane@example.com');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { email: 'jane@example.com' },
    });
  });

  it('looks up a user by username', async () => {
    await service.findByUsername('jane');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { username: 'jane' } });
  });

  it('creates then saves a new user', async () => {
    const data = { username: 'jane', email: 'jane@example.com', passwordHash: 'h' };
    repo.create.mockReturnValue(data as User);
    repo.save.mockResolvedValue({ id: 'user-1', ...data } as User);

    const result = await service.create(data);

    expect(repo.create).toHaveBeenCalledWith(data);
    expect(repo.save).toHaveBeenCalledWith(data);
    expect(result).toEqual({ id: 'user-1', ...data });
  });
});
