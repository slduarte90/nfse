import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(accountRole: AccountRole, search?: string) {
    this.ensureAdmin(accountRole);

    const query = search?.trim();

    const users = await this.prisma.user.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
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

  private ensureAdmin(accountRole: AccountRole) {
    if (accountRole !== AccountRole.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem consultar usuários.');
    }
  }
}
