import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InviteUserDto } from './dto/invite-user.dto';

interface BrasilApiCnpjResponse {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  pais?: string;
  email?: string;
  ddd_telefone_1?: string;
  ddd_telefone_2?: string;
  cnae_fiscal_descricao?: string;
  natureza_juridica?: string;
}

interface ReceitaWsCnpjResponse {
  status?: string;
  message?: string;
  cnpj?: string;
  nome?: string;
  fantasia?: string;
  situacao?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  email?: string;
  telefone?: string;
  atividade_principal?: Array<{ text?: string }>;
  natureza_juridica?: string;
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, accountRole: AccountRole, dto: CreateCompanyDto) {
    this.ensureAdmin(accountRole);

    const cnpj = this.onlyDigits(dto.cnpj);
    this.ensureValidCnpj(cnpj);

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
        country: dto.country?.trim() || 'Brasil',
        zipCode: this.onlyDigits(dto.zipCode || '') || null,
        address: dto.address?.trim() || null,
        number: dto.number?.trim() || null,
        complement: dto.complement?.trim() || null,
        neighborhood: dto.neighborhood?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        registrationStatus: dto.registrationStatus?.trim() || null,
        mainActivity: dto.mainActivity?.trim() || null,
        legalNature: dto.legalNature?.trim() || null,
        taxRegime: dto.taxRegime?.trim() || 'Não informado',
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

  async lookupCnpj(accountRole: AccountRole, cnpjInput: string) {
    this.ensureAdmin(accountRole);

    const cnpj = this.onlyDigits(cnpjInput);
    this.ensureValidCnpj(cnpj);

    const brasilApiData = await this.lookupBrasilApi(cnpj);

    if (brasilApiData) {
      return brasilApiData;
    }

    const receitaWsData = await this.lookupReceitaWs(cnpj);

    if (receitaWsData) {
      return receitaWsData;
    }

    throw new BadRequestException('Não foi possível consultar o CNPJ agora. Tente novamente.');
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
        throw new NotFoundException('Empresa não encontrada.');
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
      throw new NotFoundException('Empresa não encontrada.');
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
      throw new NotFoundException('Empresa não encontrada ou inativa.');
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
        ? 'Usuário existente vinculado à empresa e convite registrado.'
        : 'Convite registrado. O envio de e-mail será implementado na próxima etapa.',
    };
  }

  private async lookupBrasilApi(cnpj: string) {
    try {
      const response = await this.fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);

      if (response.status === 404) {
        throw new NotFoundException('CNPJ não encontrado.');
      }

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as BrasilApiCnpjResponse;

      return {
        cnpj: this.onlyDigits(data.cnpj || cnpj),
        legalName: data.razao_social || '',
        tradeName: data.nome_fantasia || '',
        registrationStatus: data.descricao_situacao_cadastral || '',
        municipalRegistration: '',
        city: data.municipio || '',
        state: data.uf || '',
        country: data.pais || 'Brasil',
        zipCode: data.cep || '',
        address: data.logradouro || '',
        number: data.numero || '',
        complement: data.complemento || '',
        neighborhood: data.bairro || '',
        email: data.email || '',
        phone: data.ddd_telefone_1 || data.ddd_telefone_2 || '',
        mainActivity: data.cnae_fiscal_descricao || '',
        legalNature: data.natureza_juridica || '',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      return null;
    }
  }

  private async lookupReceitaWs(cnpj: string) {
    try {
      const response = await this.fetchWithTimeout(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as ReceitaWsCnpjResponse;

      if (data.status === 'ERROR') {
        if (data.message?.toLowerCase().includes('não encontrada')) {
          throw new NotFoundException('CNPJ não encontrado.');
        }

        return null;
      }

      return {
        cnpj: this.onlyDigits(data.cnpj || cnpj),
        legalName: data.nome || '',
        tradeName: data.fantasia || '',
        registrationStatus: data.situacao || '',
        municipalRegistration: '',
        city: data.municipio || '',
        state: data.uf || '',
        country: 'Brasil',
        zipCode: data.cep || '',
        address: data.logradouro || '',
        number: data.numero || '',
        complement: data.complemento || '',
        neighborhood: data.bairro || '',
        email: data.email || '',
        phone: data.telefone || '',
        mainActivity: data.atividade_principal?.[0]?.text || '',
        legalNature: data.natureza_juridica || '',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      return null;
    }
  }

  private async fetchWithTimeout(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Zip-NFSe/0.1',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private ensureAdmin(accountRole: AccountRole) {
    if (accountRole !== AccountRole.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem executar esta ação.');
    }
  }

  private onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }

  private ensureValidCnpj(cnpj: string) {
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj) || !this.isValidCnpj(cnpj)) {
      throw new BadRequestException('CNPJ inválido.');
    }
  }

  private isValidCnpj(cnpj: string) {
    const calcDigit = (base: string, weights: number[]) => {
      const sum = base.split('').reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };

    const firstDigit = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const secondDigit = calcDigit(cnpj.slice(0, 12) + firstDigit, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

    return cnpj.endsWith(`${firstDigit}${secondDigit}`);
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
      country: true,
      zipCode: true,
      address: true,
      number: true,
      complement: true,
      neighborhood: true,
      email: true,
      phone: true,
      registrationStatus: true,
      mainActivity: true,
      legalNature: true,
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
