import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvitationStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByToken(token: string) {
    const invitation = await this.prisma.userInvitation.findFirst({
      where: {
        OR: [{ token }, { groupToken: token }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        token: true,
        groupToken: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    if (!invitation) {
      throw new NotFoundException('Convite não encontrado.');
    }

    const relatedInvitations = await this.prisma.userInvitation.findMany({
      where: invitation.groupToken
        ? { groupToken: invitation.groupToken }
        : { id: invitation.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
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

    const canAccept = relatedInvitations.some((item) => item.status === InvitationStatus.PENDING)
      && invitation.expiresAt.getTime() >= Date.now();

    return {
      ...invitation,
      company: relatedInvitations[0]?.company || null,
      companies: relatedInvitations.map((item) => item.company),
      isExpired: invitation.expiresAt.getTime() < Date.now(),
      canAccept,
    };
  }

  async accept(token: string, dto: AcceptInvitationDto) {
    const invitation = await this.prisma.userInvitation.findFirst({
      where: {
        OR: [{ token }, { groupToken: token }],
      },
    });

    if (!invitation) {
      throw new NotFoundException('Convite não encontrado.');
    }

    const invitations = await this.prisma.userInvitation.findMany({
      where: invitation.groupToken
        ? { groupToken: invitation.groupToken }
        : { id: invitation.id },
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

    const pendingInvitations = invitations.filter((item) => item.status === InvitationStatus.PENDING);

    if (pendingInvitations.length === 0) {
      throw new BadRequestException('Este convite não está mais disponível.');
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.userInvitation.updateMany({
        where: invitation.groupToken ? { groupToken: invitation.groupToken } : { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });

      throw new BadRequestException('Este convite expirou.');
    }

    if (pendingInvitations.some((item) => !item.company.isActive)) {
      throw new BadRequestException('Uma das empresas vinculadas a este convite está inativa.');
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

      for (const item of pendingInvitations) {
        await tx.companyUser.upsert({
          where: {
            userId_companyId: {
              userId: user.id,
              companyId: item.companyId,
            },
          },
          update: {
            role: item.role || UserRole.OPERATOR,
          },
          create: {
            userId: user.id,
            companyId: item.companyId,
            role: item.role || UserRole.OPERATOR,
          },
        });
      }

      await tx.userInvitation.updateMany({
        where: invitation.groupToken ? { groupToken: invitation.groupToken } : { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      return user;
    });

    return {
      user: result,
      companies: pendingInvitations.map((item) => item.company),
      message: 'Convite aceito com sucesso. Você já pode acessar o sistema.',
    };
  }
}
