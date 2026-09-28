import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

const contextWith = (headers: Record<string, string>): ExecutionContext => {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  const jwt = { verify: jest.fn() };

  beforeEach(() => {
    jwt.verify.mockReset();
    guard = new JwtAuthGuard(jwt as unknown as JwtService);
  });

  it('rejects a request with no Authorization header', () => {
    expect(() => guard.canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });

  it('rejects a non-Bearer Authorization header', () => {
    expect(() =>
      guard.canActivate(contextWith({ authorization: 'Basic abc' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a token that fails verification', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('bad signature');
    });
    expect(() =>
      guard.canActivate(contextWith({ authorization: 'Bearer tampered' })),
    ).toThrow(UnauthorizedException);
  });

  it('accepts a valid token and attaches the payload to the request', () => {
    const payload = { sub: 'user-1', username: 'jane', email: 'jane@e.com' };
    jwt.verify.mockReturnValue(payload);
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer good' } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(jwt.verify).toHaveBeenCalledWith('good');
    expect(request.user).toEqual(payload);
  });
});
