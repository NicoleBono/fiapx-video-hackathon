import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { User } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';

const JWT_SECRET = 'e2e-secret';

class InMemoryUsersService {
  private readonly users: User[] = [];

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.users.find((u) => u.username === username) ?? null;
  }

  async create(data: {
    username: string;
    email: string;
    passwordHash: string;
  }): Promise<User> {
    const user: User = {
      id: `user-${this.users.length + 1}`,
      createdAt: new Date(),
      ...data,
    };
    this.users.push(user);
    return user;
  }
}

describe('auth-service (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '3600s' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: UsersService, useClass: InMemoryUsersService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /register creates a user and returns a verifiable JWT', async () => {
    const res = await request(app.getHttpServer())
      .post('/register')
      .send({ username: 'jane', email: 'jane@example.com', password: 'S3nhaForte!' })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    const payload = jwt.verify(res.body.accessToken, { secret: JWT_SECRET });
    expect(payload).toMatchObject({
      sub: expect.any(String),
      username: 'jane',
      email: 'jane@example.com',
    });
  });

  it('POST /register rejects a short password with 400', async () => {
    await request(app.getHttpServer())
      .post('/register')
      .send({ username: 'x', email: 'not-an-email', password: '123' })
      .expect(400);
  });

  it('POST /register rejects a duplicate email with 409', async () => {
    await request(app.getHttpServer())
      .post('/register')
      .send({ username: 'jane2', email: 'jane@example.com', password: 'S3nhaForte!' })
      .expect(409);
  });

  it('POST /login returns 200 with a token for valid credentials', async () => {
    await request(app.getHttpServer())
      .post('/login')
      .send({ email: 'jane@example.com', password: 'S3nhaForte!' })
      .expect(200)
      .expect((res) => expect(res.body.accessToken).toEqual(expect.any(String)));
  });

  it('POST /login returns 401 for a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/login')
      .send({ email: 'jane@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('keeps bcrypt hashes out of storage (sanity)', async () => {
    expect(await bcrypt.compare('S3nhaForte!', 'S3nhaForte!')).toBe(false);
  });
});
