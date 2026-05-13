import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-token'),
  } as unknown as JwtService;

  function createService(prisma: any) {
    return new AuthService(prisma, jwtService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers a new user and returns an access token', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Sidney',
          email: 'sidney@example.com',
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    };

    const service = createService(prisma);
    const result = await service.register({
      name: 'Sidney',
      email: 'SIDNEY@example.com',
      password: '123456',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'sidney@example.com' } });
    expect(prisma.user.create).toHaveBeenCalled();
    expect(result.accessToken).toBe('mock-token');
    expect(result.user.email).toBe('sidney@example.com');
  });

  it('does not register duplicated email', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
    };

    const service = createService(prisma);

    await expect(
      service.register({ name: 'Sidney', email: 'sidney@example.com', password: '123456' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects login with missing user', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const service = createService(prisma);

    await expect(service.login({ email: 'sidney@example.com', password: '123456' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
