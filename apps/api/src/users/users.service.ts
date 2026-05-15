import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CompanyUserStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type UpdateUserBody = {
  name?: string;
  email?: string;
  accountRole?: AccountRole;
  role?: UserRole;
  companyIds?: string[];
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(accountRole: AccountRole, search?: string, status?: string) {
    this.ensureAdmin(accountRole);

    const query = search?.trim();
    const normalizedStatus = status?.trim().toUpperCase();

    const users = await this.prisma.user.findMany({
      where: {
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' as const } },
                { email: { contains: query, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(normalizedStatus === 'ACTIVE' ? { isActive: true } : {}),
        ...(normalizedStatus === 'INACTIVE' ? { isActive: false } : {}),
      },
      orderBy: { name: 'asc' },
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
            status: true,
            company: {
              select: {
                id: true,
                legalName: true,
                tradeName: true,
                cnpj: true,
                city: true,
                state: true,
                isActive: true,
              },
            },
          },
          orderBy: { company: { legalName: 'asc' } },
        },
      },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      accountRole: user.accountRole,
      isActive: user.isActive,
      createdAt: user.createdAt,
      companiesCount: user.companies.length,
      companies: user.companies.map((link) => ({
        id: link.company.id,
        legalName: link.company.legalName,
        tradeName: link.company.tradeName,
        cnpj: link.company.cnpj,
        city: link.company.city,
        state: link.company.state,
        isActive: link.company.isActive,
        role: link.role,
        status: link.status,
      })),
    }));
  }

  async updateUser(accountRole: AccountRole, userId: string, body: unknown) {
    this.ensureAdmin(accountRole);
    const dto = body as UpdateUserBody;

    if (!dto.name?.trim()) {
      throw new BadRequestException('Nome é obrigatório.');
    }

    if (!dto.email?.trim()) {
      throw new BadRequestException('E-mail é obrigatório.');
    }

    if (!dto.accountRole || !Object.values(AccountRole).includes(dto.accountRole)) {
      throw new BadRequestException('Categoria do usuário inválida.');
    }

    if (!dto.role || !Object.values(UserRole).includes(dto.role)) {
      throw new BadRequestException('Perfil por empresa inválido.');
    }

    if (!Array.isArray(dto.companyIds)) {
      throw new BadRequestException('Empresas selecionadas são obrigatórias.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    const companyIds = [...new Set(dto.companyIds)];

    const existingEmail = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, id: { not: userId } },
      select: { id: true },
    });

    if (existingEmail) {
      throw new BadRequestException('Já existe outro usuário com este e-mail.');
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds }, isActive: true },
      select: { id: true },
    });

    if (companies.length !== companyIds.length) {
      throw new BadRequestException('Uma ou mais empresas selecionadas são inválidas ou inativas.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: dto.name!.trim(),
          email: normalizedEmail,
          accountRole: dto.accountRole,
        },
      });

      const currentLinks = await tx.companyUser.findMany({
        where: { userId },
        select: { companyId: true },
      });

      const selectedSet = new Set(companyIds);

      for (const link of currentLinks) {
        if (!selectedSet.has(link.companyId)) {
          await tx.companyUser.delete({
            where: { userId_companyId: { userId, companyId: link.companyId } },
          });
        }
      }

      for (const companyId of companyIds) {
        await tx.companyUser.upsert({
          where: { userId_companyId: { userId, companyId } },
          update: { role: dto.role, status: CompanyUserStatus.ACTIVE },
          create: { userId, companyId, role: dto.role, status: CompanyUserStatus.ACTIVE },
        });
      }
    });

    return { message: 'Usuário atualizado com sucesso.' };
  }

  async setUserActiveStatus(accountRole: AccountRole, userId: string, isActive: boolean) {
    this.ensureAdmin(accountRole);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, name: true, email: true, isActive: true },
    });

    return {
      ...user,
      message: isActive ? 'Usuário ativado com sucesso.' : 'Usuário bloqueado com sucesso.',
    };
  }

  async deactivateUser(accountRole: AccountRole, userId: string) {
    this.ensureAdmin(accountRole);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { id: true, name: true, email: true, isActive: true },
    });

    await this.prisma.companyUser.updateMany({
      where: { userId },
      data: { status: CompanyUserStatus.DISABLED },
    });

    return {
      ...user,
      message: 'Usuário inativado e acessos às empresas desativados.',
    };
  }

  private ensureAdmin(accountRole: AccountRole) {
    if (accountRole !== AccountRole.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem gerenciar usuários.');
    }
  }
}
