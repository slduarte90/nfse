import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Ja existe um usuario cadastrado com este e-mail.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash,
        accountRole: AccountRole.USER,
      },
      select: {
        id: true,
        name: true,
        email: true,
        accountRole: true,
        isActive: true,
        createdAt: true,
      },
    });

    return {
      user,
      accessToken: await this.signToken(user.id, user.email, user.name, user.accountRole),
    };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('E-mail ou senha invalidos.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha invalidos.');
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        accountRole: user.accountRole,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      accessToken: await this.signToken(user.id, user.email, user.name, user.accountRole),
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        accountRole: true,
        isActive: true,
        createdAt: true,
        companies: {
          select: {
            role: true,
            company: {
              select: {
                id: true,
                legalName: true,
                tradeName: true,
                cnpj: true,
                city: true,
                state: true,
                taxRegime: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario nao encontrado ou inativo.');
    }

    return user;
  }

  private async signToken(userId: string, email: string, name: string, accountRole: AccountRole) {
    return this.jwtService.signAsync({ sub: userId, email, name, accountRole });
  }
}
