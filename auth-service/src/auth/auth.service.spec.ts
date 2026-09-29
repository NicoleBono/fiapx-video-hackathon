import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { MetricsService } from '../metrics/metrics.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<Pick<UsersService, 'findByEmail' | 'findByUsername' | 'create'>>;
  let jwt: jest.Mocked<Pick<JwtService, 'sign'>>;
  let metrics: {
    authRegistrationsTotal: { inc: jest.Mock };
    authLoginsTotal: { labels: jest.Mock };
  };
  let loginResultLabel: jest.Mock;

  beforeEach(async () => {
    users = {
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      create: jest.fn(),
    };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    loginResultLabel = jest.fn().mockReturnValue({ inc: jest.fn() });
    metrics = {
      authRegistrationsTotal: { inc: jest.fn() },
      authLoginsTotal: { labels: loginResultLabel },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('creates the user and returns a token with the JWT contract payload', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.findByUsername.mockResolvedValue(null);
      users.create.mockResolvedValue({
        id: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
        passwordHash: 'hash',
        createdAt: new Date(),
      });

      const result = await service.register({
        username: 'jane',
        email: 'jane@example.com',
        password: 'S3nhaForte!',
      });

      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
      });
      const createArg = users.create.mock.calls[0][0];
      expect(createArg.passwordHash).not.toBe('S3nhaForte!');
      await expect(
        bcrypt.compare('S3nhaForte!', createArg.passwordHash),
      ).resolves.toBe(true);
      expect(metrics.authRegistrationsTotal.inc).toHaveBeenCalledTimes(1);
    });

    it('rejects a duplicate email or username with ConflictException', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
        passwordHash: 'hash',
        createdAt: new Date(),
      });
      users.findByUsername.mockResolvedValue(null);

      await expect(
        service.register({
          username: 'jane',
          email: 'jane@example.com',
          password: 'S3nhaForte!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(loginResultLabel).toHaveBeenCalledWith('failure');
    });

    it('rejects a wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      users.findByEmail.mockResolvedValue({
        id: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
        passwordHash,
        createdAt: new Date(),
      });

      await expect(
        service.login({ email: 'jane@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns a token on valid credentials', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      users.findByEmail.mockResolvedValue({
        id: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
        passwordHash,
        createdAt: new Date(),
      });

      const result = await service.login({
        email: 'jane@example.com',
        password: 'correct-horse',
      });

      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
      });
      expect(loginResultLabel).toHaveBeenCalledWith('success');
    });
  });
});
