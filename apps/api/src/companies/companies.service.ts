import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InviteUserDto } from './dto/invite-user.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, accountRole: AccountRole, dto: CreateCompanyDto) {
    this.ensureAdmin(accountRole);

    const cnpj = this.onlyDigits(dto.cnpj);

    const existingCompany = await this.prisma.company.findUnique({
      where: { cnpj },
    });

    if (existingCompany) {
      return existingCompany;
    }

    return this.prisma.company.create({
      data: {
        legalName: dto.legalName.trim(),
        tradeName: dto.tradeName?.trim() || null,
        cnpj,
        municipalRegistration: dto.municipalRegistration?.trim() || null,
        city: dto.city.trim(),
        state: dto.state.trim().toUpperCase(),
        taxRegime: dto.taxRegime.trim(),
        serviceCodeDefault: dto.serviceCodeDefault?.trim() || null,
        users: {
          create: {
            userId,
            role: UserRole.OWNER,
          },
        },
      },
    });
  }

  async findAll(userId: string, accountRole: AccountRole, search?: string) {
    if (accountRole === AccountRole.ADMIN) {
      const companies = await this.prisma.company.findMany({
        where: this.buildCompanySearch(search),
        orderBy: { legalName: 'asc' },
        select: this.companyListSelect(),
      });

      return companies.map((company) => ({
        ...company,
        role: 'ADMIN_VIEW',
      }));
    }

    const links = await this.prisma.companyUser.findMany({
      where: {
        userId,
        company: this.buildCompanySearch(search),
      },
      orderBy: { company: { legalName: 'asc' } },
      select: {
        role: true,
        company: {
          select: this.companyListSelect(),
        },
      },
    });

    return links.map((link) => ({
      ...link.company,
      role: link.role,
    }));
  }

  async findOne(userId: string, accountRole: AccountRole, companyId: string) {
    if (accountRole === AccountRole.ADMIN) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: this.companyDetailSelect(),
      });

      if (!company) {
        throw new NotFoundException('Empresa nao encontrada.');
      }

      return {
        ...company,
        role: 'ADMIN_VIEW',
        certificate: company.certificates[0] || null,
      };
    }

    const link = await this.prisma.companyUser.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId,
        },
      },
      select: {
        role: true,
        company: {
          select: this.companyDetailSelect(),
        },
      },
    });

    if (!link) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    if (!link.company.isActive) {
      throw new ForbiddenException('Empresa inativa.');
    }

    return {
      ...link.company,
      role: link.role,
      certificate: link.company.certificates[0] || null,
    };
  }

  async inviteUser(invitedById: string, accountRole: AccountRole, dto: InviteUserDto) {
    this.ensureAdmin(accountRole);

    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { id: true, legalName: true, isActive: true },
    });

    if (!company || !company.isActive) {
      throw new NotFoundException('Empresa nao encontrada ou inativa.');
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    const role = dto.role || UserRole.OPERATOR;

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true },
    });

    if (existingUser) {
      await this.prisma.companyUser.upsert({
        where: {
          userId_companyId: {
            userId: existingUser.id,
            companyId: dto.companyId,
          },
        },
        update: { role },
        create: {
          userId: existingUser.id,
          companyId: dto.companyId,
          role,
        },
      });
    }

    const invitation = await this.prisma.userInvitation.create({
      data: {
        companyId: dto.companyId,
        invitedById,
        name: dto.name?.trim() || null,
        email: normalizedEmail,
        role,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        token: true,
        expiresAt: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            legalName: true,
            cnpj: true,
          },
        },
      },
    });

    return {
      invitation,
      alreadyLinkedUser: Boolean(existingUser),
      message: existingUser
        ? 'Usuario existente vinculado a empresa e convite registrado.'
        : 'Convite registrado. O envio de e-mail sera implementado na proxima etapa.',
    };
  }

  private ensureAdmin(accountRole: AccountRole) {
    if (accountRole !== AccountRole.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem executar esta acao.');
    }
  }

  private onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }

  private buildCompanySearch(search?: string) {
    const query = search?.trim();

    if (!query) {
      return undefined;
    }

    const digits = this.onlyDigits(query);

    return {
      OR: [
        { legalName: { contains: query, mode: 'insensitive' as const } },
        { tradeName: { contains: query, mode: 'insensitive' as const } },
        ...(digits ? [{ cnpj: { contains: digits } }] : []),
      ],
    };
  }

  private companyListSelect() {
    return {
      id: true,
      legalName: true,
      tradeName: true,
      cnpj: true,
      municipalRegistration: true,
      city: true,
      state: true,
      taxRegime: true,
      serviceCodeDefault: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private companyDetailSelect() {
    return {
      ...this.companyListSelect(),
      certificates: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: {
          id: true,
          originalFileName: true,
          subjectName: true,
          issuerName: true,
          serialNumber: true,
          validFrom: true,
          validUntil: true,
          status: true,
          createdAt: true,
        },
      },
    };
  }
}
