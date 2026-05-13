import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCompanyDto) {
    const cnpj = this.onlyDigits(dto.cnpj);

    const existingCompany = await this.prisma.company.findUnique({
      where: { cnpj },
    });

    if (existingCompany) {
      const existingLink = await this.prisma.companyUser.findUnique({
        where: {
          userId_companyId: {
            userId,
            companyId: existingCompany.id,
          },
        },
      });

      if (existingLink) {
        throw new ConflictException('Esta empresa ja esta vinculada ao seu usuario.');
      }

      await this.prisma.companyUser.create({
        data: {
          userId,
          companyId: existingCompany.id,
          role: UserRole.ADMIN,
        },
      });

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

  async findAll(userId: string) {
    const links = await this.prisma.companyUser.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        role: true,
        company: {
          select: {
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
          },
        },
      },
    });

    return links.map((link) => ({
      ...link.company,
      role: link.role,
    }));
  }

  async findOne(userId: string, companyId: string) {
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
          select: {
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
            certificates: {
              orderBy: { createdAt: 'desc' },
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
          },
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

  private onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }
}
