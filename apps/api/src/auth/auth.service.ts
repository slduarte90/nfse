import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
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

  async forgotPassword(dto: ForgotPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, isActive: true },
    });

    if (user?.isActive) {
      await this.issuePasswordReset(user);
    }

    return { message: 'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.' };
  }

  async sendPasswordResetForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, isActive: true },
    });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');
    if (!user.isActive) throw new BadRequestException('Usuario inativo nao pode receber recuperacao de senha.');
    await this.issuePasswordReset(user);
    return { message: 'E-mail de recuperacao de senha enviado.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, isActive: true } } },
    });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date() || !resetToken.user.isActive) {
      throw new BadRequestException('Link de recuperacao invalido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, id: { not: resetToken.id }, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Senha redefinida com sucesso.' };
  }

  private async signToken(userId: string, email: string, name: string, accountRole: AccountRole) {
    return this.jwtService.signAsync({ sub: userId, email, name, accountRole });
  }

  private async issuePasswordReset(user: { id: string; name: string; email: string }) {
    const token = randomBytes(32).toString('hex');
    const expiresMinutes = Number(this.config.get<string>('PASSWORD_RESET_EXPIRES_MINUTES') || 60);
    const expiresAt = new Date(Date.now() + Math.max(10, expiresMinutes) * 60_000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });

    try {
      await this.mailer.sendPasswordReset({
        to: user.email,
        name: user.name || user.email,
        resetUrl: `${this.publicWebUrl()}/recuperar-senha/${token}`,
        expiresMinutes: Math.max(10, expiresMinutes),
      });
    } catch (error) {
      throw new BadRequestException(this.mailer.formatDeliveryError(error));
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicWebUrl() {
    return String(this.config.get<string>('WEB_PUBLIC_URL') || this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/+$/, '');
  }
}
