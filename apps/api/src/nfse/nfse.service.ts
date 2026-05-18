import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CompanyUserStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class NfseService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string, accountRole: AccountRole, companyId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    return this.prisma.nfseSettings.upsert({
      where: { companyId },
      update: {},
      create: { companyId },
    });
  }

  async updateSettings(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    return this.prisma.nfseSettings.upsert({
      where: { companyId },
      update: this.clean(dto),
      create: { companyId, ...this.clean(dto) },
    });
  }

  async listServices(userId: string, accountRole: AccountRole, companyId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    return this.prisma.nfseService.findMany({ where: { companyId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  }

  async createService(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    if (dto.isDefault) await this.prisma.nfseService.updateMany({ where: { companyId }, data: { isDefault: false } });
    return this.prisma.nfseService.create({ data: { companyId, ...this.clean(dto), issRate: this.decimalOrNull(dto.issRate) } });
  }

  async updateService(userId: string, accountRole: AccountRole, companyId: string, serviceId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    await this.ensureService(companyId, serviceId);
    if (dto.isDefault) await this.prisma.nfseService.updateMany({ where: { companyId, id: { not: serviceId } }, data: { isDefault: false } });
    return this.prisma.nfseService.update({ where: { id: serviceId }, data: { ...this.clean(dto), issRate: dto.issRate === undefined ? undefined : this.decimalOrNull(dto.issRate) } });
  }

  async deleteService(userId: string, accountRole: AccountRole, companyId: string, serviceId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    await this.ensureService(companyId, serviceId);
    return this.prisma.nfseService.update({ where: { id: serviceId }, data: { isActive: false } });
  }

  async listCustomers(userId: string, accountRole: AccountRole, companyId: string, search = '') {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    const term = search.trim();
    return this.prisma.customer.findMany({
      where: { companyId, ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { document: { contains: term } }, { email: { contains: term, mode: 'insensitive' } }] } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async createCustomer(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    return this.prisma.customer.create({ data: { companyId, ...this.clean(dto), document: this.onlyDigits(dto.document || '') || dto.document } });
  }

  async updateCustomer(userId: string, accountRole: AccountRole, companyId: string, customerId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    await this.ensureCustomer(companyId, customerId);
    return this.prisma.customer.update({ where: { id: customerId }, data: { ...this.clean(dto), document: dto.document ? this.onlyDigits(dto.document) || dto.document : undefined } });
  }

  async listInvoices(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const search = String(query.search || '').trim();
    const where: Prisma.NfseInvoiceWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { OR: [{ number: { contains: search, mode: 'insensitive' } }, { accessKey: { contains: search, mode: 'insensitive' } }, { customer: { name: { contains: search, mode: 'insensitive' } } }] } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.nfseInvoice.count({ where }),
      this.prisma.nfseInvoice.findMany({ where, include: { customer: true, service: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  }

  async createInvoice(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    if (dto.customerId) await this.ensureCustomer(companyId, dto.customerId);
    if (dto.serviceId) await this.ensureService(companyId, dto.serviceId);
    return this.prisma.nfseInvoice.create({
      data: {
        companyId,
        customerId: dto.customerId || null,
        serviceId: dto.serviceId || null,
        amount: this.decimalOrZero(dto.amount),
        deductions: this.decimalOrNull(dto.deductions),
        discounts: this.decimalOrNull(dto.discounts),
        issRate: this.decimalOrNull(dto.issRate),
        issAmount: this.decimalOrNull(dto.issAmount),
        issWithheld: Boolean(dto.issWithheld),
        serviceDescription: dto.serviceDescription || '',
        serviceCode: dto.serviceCode || null,
        nationalTaxCode: dto.nationalTaxCode || null,
        municipalServiceCode: dto.municipalServiceCode || null,
        municipalIbgeCode: dto.municipalIbgeCode || null,
        competenceDate: dto.competenceDate ? new Date(dto.competenceDate) : null,
        operationNature: dto.operationNature || null,
        additionalInformation: dto.additionalInformation || null,
        requestPayload: dto,
      },
      include: { customer: true, service: true },
    });
  }

  private async ensureCompanyAccess(userId: string, accountRole: AccountRole, companyId: string, write = false) {
    if (accountRole === AccountRole.ADMIN) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
      if (!company) throw new NotFoundException('Empresa não encontrada.');
      return;
    }
    const link = await this.prisma.companyUser.findUnique({ where: { userId_companyId: { userId, companyId } }, select: { role: true, status: true, company: { select: { isActive: true } } } });
    if (!link || !link.company.isActive || link.status !== CompanyUserStatus.ACTIVE) throw new ForbiddenException('Acesso não autorizado à empresa.');
    if (write && link.role === UserRole.VIEWER) throw new ForbiddenException('Perfil sem permissão de alteração.');
  }

  private async ensureCustomer(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } });
    if (!customer) throw new NotFoundException('Tomador não encontrado.');
  }

  private async ensureService(companyId: string, serviceId: string) {
    const service = await this.prisma.nfseService.findFirst({ where: { id: serviceId, companyId, isActive: true }, select: { id: true } });
    if (!service) throw new NotFoundException('Serviço não encontrado.');
  }

  private clean<T extends Record<string, any>>(dto: T) {
    return Object.fromEntries(Object.entries(dto || {}).filter(([, value]) => value !== undefined && value !== ''));
  }

  private decimalOrZero(value: any) {
    return new Prisma.Decimal(String(value || '0').replace(',', '.'));
  }

  private decimalOrNull(value: any) {
    if (value === undefined || value === null || value === '') return null;
    return new Prisma.Decimal(String(value).replace(',', '.'));
  }

  private onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }
}
