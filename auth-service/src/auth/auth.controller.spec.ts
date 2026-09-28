import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    register: jest.fn().mockResolvedValue({ accessToken: 'r' }),
    login: jest.fn().mockResolvedValue({ accessToken: 'l' }),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('delegates register to AuthService', async () => {
    const dto = { username: 'j', email: 'j@e.com', password: 'S3nhaForte!' };
    await expect(controller.register(dto)).resolves.toEqual({ accessToken: 'r' });
    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('delegates login to AuthService', async () => {
    const dto = { email: 'j@e.com', password: 'S3nhaForte!' };
    await expect(controller.login(dto)).resolves.toEqual({ accessToken: 'l' });
    expect(authService.login).toHaveBeenCalledWith(dto);
  });
});
