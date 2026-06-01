import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CompanyUserStatus, Prisma, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { PrismaService } from '../database/prisma.service';
import { COMPANY_PERMISSION_KEYS, resolveCompanyPermissions, sanitizeCompanyPermissions } from '../permissions/company-permissions';
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
    const existingCompany = await this.prisma.company.findUnique({ where: { cnpj } });
    if (existingCompany) return existingCompany;

    return this.prisma.company.create({
      data: {
        ...this.buildCompanyPayload(dto, cnpj),
        users: { create: { userId, role: UserRole.OWNER } },
      },
    });
  }

  async update(accountRole: AccountRole, companyId: string, dto: CreateCompanyDto) {
    this.ensureAdmin(accountRole);
    await this.ensureCompanyExists(companyId);

    const cnpj = this.onlyDigits(dto.cnpj);
    this.ensureValidCnpj(cnpj);

    const duplicatedCompany = await this.prisma.company.findFirst({
      where: { cnpj, id: { not: companyId } },
      select: { id: true },
    });

    if (duplicatedCompany) {
      throw new BadRequestException('Já existe outra empresa cadastrada com este CNPJ.');
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: this.buildCompanyPayload(dto, cnpj),
      select: this.companyListSelect(),
    });
  }

  async lookupCnpj(accountRole: AccountRole, cnpjInput: string) {
    this.ensureAdmin(accountRole);
    const cnpj = this.onlyDigits(cnpjInput);
    this.ensureValidCnpj(cnpj);
    const brasilApiData = await this.lookupBrasilApi(cnpj);
    if (brasilApiData) return brasilApiData;
    const receitaWsData = await this.lookupReceitaWs(cnpj);
    if (receitaWsData) return receitaWsData;
    throw new BadRequestException('Não foi possível consultar o CNPJ agora. Tente novamente.');
  }

  async findAll(userId: string, accountRole: AccountRole, search?: string, status?: string) {
    if (accountRole === AccountRole.ADMIN) {
      const companies = await this.prisma.company.findMany({
        where: this.buildCompanyWhere(search, status),
        orderBy: { legalName: 'asc' },
        select: this.companyListSelect(),
      });
      return companies.map((company) => ({ ...company, role: 'ADMIN_VIEW', permissions: COMPANY_PERMISSION_KEYS }));
    }

    const links = await this.prisma.companyUser.findMany({
      where: { userId, status: CompanyUserStatus.ACTIVE, company: this.buildCompanyWhere(search, 'ACTIVE') },
      orderBy: { company: { legalName: 'asc' } },
      select: { role: true, permissions: true, status: true, company: { select: this.companyListSelect() } },
    });
    return links.map((link) => ({ ...link.company, role: link.role, permissions: resolveCompanyPermissions(link.role, link.permissions), accessStatus: link.status }));
  }

  async findOne(userId: string, accountRole: AccountRole, companyId: string) {
    if (accountRole === AccountRole.ADMIN) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: this.companyDetailSelect() });
      if (!company) throw new NotFoundException('Empresa não encontrada.');
      return { ...company, role: 'ADMIN_VIEW', permissions: COMPANY_PERMISSION_KEYS, certificate: company.certificates[0] || null };
    }

    const link = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { role: true, permissions: true, status: true, company: { select: this.companyDetailSelect() } },
    });
    if (!link) throw new NotFoundException('Empresa não encontrada.');
    if (!link.company.isActive || link.status !== CompanyUserStatus.ACTIVE) throw new ForbiddenException('Empresa inativa ou acesso bloqueado.');
    return { ...link.company, role: link.role, permissions: resolveCompanyPermissions(link.role, link.permissions), accessStatus: link.status, certificate: link.company.certificates[0] || null };
  }

  async inviteUser(invitedById: string, accountRole: AccountRole, dto: InviteUserDto) {
    this.ensureAdmin(accountRole);
    const companyIds = [...new Set(dto.companyIds)];
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds }, isActive: true },
      select: { id: true, legalName: true, cnpj: true },
    });
    if (companies.length !== companyIds.length) throw new NotFoundException('Uma ou mais empresas não foram encontradas ou estão inativas.');

    const normalizedEmail = dto.email.trim().toLowerCase();
    const role = dto.role || UserRole.OPERATOR;
    const permissionsData = Array.isArray(dto.permissions)
      ? { permissions: sanitizeCompanyPermissions(dto.permissions) as Prisma.InputJsonValue }
      : {};
    const groupToken = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const existingUser = await this.prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, name: true, email: true } });

    if (existingUser) {
      await this.prisma.$transaction(
        companies.map((company) =>
          this.prisma.companyUser.upsert({
            where: { userId_companyId: { userId: existingUser.id, companyId: company.id } },
            update: { role, ...permissionsData, status: CompanyUserStatus.ACTIVE },
            create: { userId: existingUser.id, companyId: company.id, role, ...permissionsData, status: CompanyUserStatus.ACTIVE },
          }),
        ),
      );
    }

    const invitations = await this.prisma.$transaction(
      companies.map((company, index) =>
        this.prisma.userInvitation.create({
          data: { companyId: company.id, invitedById, name: dto.name?.trim() || null, email: normalizedEmail, role, ...permissionsData, token: index === 0 ? groupToken : randomUUID(), groupToken, expiresAt },
          select: { id: true, name: true, email: true, role: true, permissions: true, status: true, token: true, groupToken: true, expiresAt: true, createdAt: true, company: { select: { id: true, legalName: true, cnpj: true } } },
        }),
      ),
    );

    return {
      invitation: invitations[0],
      invitations,
      inviteLinkToken: groupToken,
      alreadyLinkedUser: Boolean(existingUser),
      message: existingUser ? 'Usuário existente vinculado às empresas selecionadas e convite registrado.' : 'Convite registrado. Use o link de convite para o usuário criar o acesso.',
    };
  }

  async setCompanyActiveStatus(accountRole: AccountRole, companyId: string, isActive: boolean) {
    this.ensureAdmin(accountRole);
    await this.ensureCompanyExists(companyId);
    return this.prisma.company.update({
      where: { id: companyId },
      data: { isActive },
      select: this.companyListSelect(),
    });
  }

  async removeCompany(accountRole: AccountRole, companyId: string) {
    this.ensureAdmin(accountRole);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, legalName: true, isActive: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada.');
    if (company.isActive) throw new BadRequestException('Inative a empresa antes de excluir definitivamente.');

    const [certificates, files, invoices] = await Promise.all([
      this.prisma.digitalCertificate.findMany({ where: { companyId }, select: { encryptedPath: true } }),
      this.prisma.storedFile.findMany({ where: { invoice: { companyId } }, select: { path: true } }),
      this.prisma.nfseInvoice.findMany({ where: { companyId }, select: { id: true } }),
    ]);
    const invoiceIds = invoices.map((invoice) => invoice.id);

    await this.prisma.$transaction([
      this.prisma.storedFile.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
      this.prisma.nfseEvent.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
      this.prisma.nfseInvoice.deleteMany({ where: { companyId } }),
      this.prisma.nfseSettings.deleteMany({ where: { companyId } }),
      this.prisma.digitalCertificate.deleteMany({ where: { companyId } }),
      this.prisma.nfseService.deleteMany({ where: { companyId } }),
      this.prisma.customer.deleteMany({ where: { companyId } }),
      this.prisma.userInvitation.deleteMany({ where: { companyId } }),
      this.prisma.companyUser.deleteMany({ where: { companyId } }),
      this.prisma.auditLog.deleteMany({ where: { companyId } }),
      this.prisma.company.delete({ where: { id: companyId } }),
    ]);

    [...certificates.map((item) => item.encryptedPath), ...files.map((item) => item.path)]
      .filter(Boolean)
      .forEach((filePath) => {
        try {
          if (existsSync(filePath)) unlinkSync(filePath);
        } catch {
          // A exclusão lógica já foi concluída; arquivo residual pode ser limpo manualmente.
        }
      });

    return { removed: true, message: `Empresa ${company.legalName} excluída definitivamente.` };
  }

  async findCompanyUsers(userId: string, accountRole: AccountRole, companyId: string) {
    if (accountRole === AccountRole.ADMIN) {
      await this.ensureCompanyExists(companyId);
    } else {
      const link = await this.prisma.companyUser.findUnique({
        where: { userId_companyId: { userId, companyId } },
        select: { status: true, company: { select: { isActive: true } } },
      });
      if (!link || !link.company.isActive || link.status !== CompanyUserStatus.ACTIVE) throw new ForbiddenException('Acesso não autorizado à empresa.');
    }

    const users = await this.prisma.companyUser.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        permissions: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, accountRole: true, isActive: true } },
      },
    });

    return Promise.all(
      users.map(async (link) => {
        const linkedInvoices = await this.countUserLinkedInvoices(companyId, link.user.id);
        return {
          id: link.user.id,
          name: link.user.name,
          email: link.user.email,
          accountRole: link.user.accountRole,
          isActive: link.user.isActive,
          role: link.role,
          permissions: resolveCompanyPermissions(link.role, link.permissions),
          status: link.status,
          createdAt: link.createdAt,
          canDelete: linkedInvoices === 0,
          linkedInvoices,
        };
      }),
    );
  }

  async updateCompanyUserStatus(accountRole: AccountRole, companyId: string, userId: string, status: CompanyUserStatus) {
    this.ensureAdmin(accountRole);
    await this.ensureCompanyUserExists(companyId, userId);
    const link = await this.prisma.companyUser.update({
      where: { userId_companyId: { userId, companyId } },
      data: { status },
      select: { role: true, permissions: true, status: true, user: { select: { id: true, name: true, email: true } } },
    });
    return { id: link.user.id, name: link.user.name, email: link.user.email, role: link.role, status: link.status, message: status === CompanyUserStatus.ACTIVE ? 'Usuário reativado.' : status === CompanyUserStatus.BLOCKED ? 'Usuário bloqueado.' : 'Usuário desativado.' };
  }

  async removeCompanyUser(accountRole: AccountRole, companyId: string, userId: string) {
    this.ensureAdmin(accountRole);
    await this.ensureCompanyUserExists(companyId, userId);
    const linkedInvoices = await this.countUserLinkedInvoices(companyId, userId);

    if (linkedInvoices > 0) {
      const disabled = await this.updateCompanyUserStatus(accountRole, companyId, userId, CompanyUserStatus.DISABLED);
      return { ...disabled, removed: false, disabled: true, message: 'Há lançamentos vinculados a esse usuário, por isso o acesso foi desativado em vez de excluído.' };
    }

    await this.prisma.companyUser.delete({ where: { userId_companyId: { userId, companyId } } });
    return { removed: true, disabled: false, message: 'Usuário removido da empresa.' };
  }

  private buildCompanyPayload(dto: CreateCompanyDto, cnpj: string) {
    return {
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
    };
  }

  private async countUserLinkedInvoices(companyId: string, userId: string) {
    return this.prisma.nfseInvoice.count({
      where: {
        companyId,
        events: { some: { OR: [{ payload: { path: ['userId'], equals: userId } }, { payload: { path: ['createdByUserId'], equals: userId } }] } },
      },
    });
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw new NotFoundException('Empresa não encontrada.');
  }

  private async ensureCompanyUserExists(companyId: string, userId: string) {
    const link = await this.prisma.companyUser.findUnique({ where: { userId_companyId: { userId, companyId } }, select: { id: true } });
    if (!link) throw new NotFoundException('Usuário não está vinculado a esta empresa.');
  }

  private async lookupBrasilApi(cnpj: string) {
    try {
      const response = await this.fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (response.status === 404) throw new NotFoundException('CNPJ não encontrado.');
      if (!response.ok) return null;
      const data = (await response.json()) as BrasilApiCnpjResponse;
      return { cnpj: this.onlyDigits(data.cnpj || cnpj), legalName: data.razao_social || '', tradeName: data.nome_fantasia || '', registrationStatus: data.descricao_situacao_cadastral || '', municipalRegistration: '', city: data.municipio || '', state: data.uf || '', country: data.pais || 'Brasil', zipCode: data.cep || '', address: data.logradouro || '', number: data.numero || '', complement: data.complemento || '', neighborhood: data.bairro || '', email: data.email || '', phone: data.ddd_telefone_1 || data.ddd_telefone_2 || '', mainActivity: data.cnae_fiscal_descricao || '', legalNature: data.natureza_juridica || '' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      return null;
    }
  }

  private async lookupReceitaWs(cnpj: string) {
    try {
      const response = await this.fetchWithTimeout(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`);
      if (!response.ok) return null;
      const data = (await response.json()) as ReceitaWsCnpjResponse;
      if (data.status === 'ERROR') {
        if (data.message?.toLowerCase().includes('não encontrada')) throw new NotFoundException('CNPJ não encontrado.');
        return null;
      }
      return { cnpj: this.onlyDigits(data.cnpj || cnpj), legalName: data.nome || '', tradeName: data.fantasia || '', registrationStatus: data.situacao || '', municipalRegistration: '', city: data.municipio || '', state: data.uf || '', country: 'Brasil', zipCode: data.cep || '', address: data.logradouro || '', number: data.numero || '', complement: data.complemento || '', neighborhood: data.bairro || '', email: data.email || '', phone: data.telefone || '', mainActivity: data.atividade_principal?.[0]?.text || '', legalNature: data.natureza_juridica || '' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      return null;
    }
  }

  private async fetchWithTimeout(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'Zip-NFSe/0.1' } });
    } finally {
      clearTimeout(timeout);
    }
  }

  private ensureAdmin(accountRole: AccountRole) {
    if (accountRole !== AccountRole.ADMIN) throw new ForbiddenException('Apenas administradores podem executar esta ação.');
  }

  private onlyDigits(value: string) { return value.replace(/\D/g, ''); }

  private ensureValidCnpj(cnpj: string) {
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj) || !this.isValidCnpj(cnpj)) throw new BadRequestException('CNPJ inválido.');
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
    if (!query) return undefined;
    const digits = this.onlyDigits(query);
    return { OR: [{ legalName: { contains: query, mode: 'insensitive' as const } }, { tradeName: { contains: query, mode: 'insensitive' as const } }, ...(digits ? [{ cnpj: { contains: digits } }] : [])] };
  }

  private buildCompanyWhere(search?: string, status?: string) {
    const where = this.buildCompanySearch(search) || {};
    const normalizedStatus = status?.trim().toUpperCase();
    if (normalizedStatus === 'ALL') return where;
    if (normalizedStatus === 'INACTIVE') return { ...where, isActive: false };
    return { ...where, isActive: true };
  }

  private companyListSelect() {
    return { id: true, legalName: true, tradeName: true, cnpj: true, municipalRegistration: true, city: true, state: true, country: true, zipCode: true, address: true, number: true, complement: true, neighborhood: true, email: true, phone: true, registrationStatus: true, mainActivity: true, legalNature: true, taxRegime: true, serviceCodeDefault: true, isActive: true, createdAt: true, updatedAt: true };
  }

  private companyDetailSelect() {
    return { ...this.companyListSelect(), certificates: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, originalFileName: true, subjectName: true, issuerName: true, serialNumber: true, validFrom: true, validUntil: true, status: true, createdAt: true } } };
  }
}
