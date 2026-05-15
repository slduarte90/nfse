import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvitationStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByToken(token: string) {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { token },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            legalName: true,
            tradeName: true,
            cnpj: true,
            city: true,
            state: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Convite não encontrado.');
    }

    return {
      ...invitation,
      isExpired: invitation.expiresAt.getTime() < Date.now(),
      canAccept: invitation.status === InvitationStatus.PENDING && invitation.expiresAt.getTime() >= Date.now(),
    };
  }

  async accept(token: string, dto: AcceptInvitationDto) {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { token },
      include: {
        company: {
          select: {
            id: true,
            legalName: true,
            cnpj: true,
            isActive: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Convite não encontrado.');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Este convite não está mais disponível.');
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.userInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });

      throw new BadRequestException('Este convite expirou.');
    }

    if (!invitation.company.isActive) {
      throw new BadRequestException('A empresa vinculada a este convite está inativa.');
    }

    const normalizedEmail = invitation.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const name = dto.name?.trim() || invitation.name?.trim() || normalizedEmail;

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name,
          passwordHash,
          isActive: true,
        },
        create: {
          name,
          email: normalizedEmail,
          passwordHash,
          accountRole: 'USER',
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          accountRole: true,
        },
      });

      await tx.companyUser.upsert({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: invitation.companyId,
          },
        },
        update: {
          role: invitation.role || UserRole.OPERATOR,
        },
        create: {
          userId: user.id,
          companyId: invitation.companyId,
          role: invitation.role || UserRole.OPERATOR,
        },
      });

      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      return user;
    });

    return {
      user: result,
      company: invitation.company,
      message: 'Convite aceito com sucesso. Você já pode acessar o sistema.',
    };
  }
}
