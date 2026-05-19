import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CompanyUserStatus, InvoiceStatus, Prisma, StorageKind, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NfseNationalApiService } from './nfse-national-api.service';

@Injectable()
export class NfseService {
  constructor(private readonly prisma: PrismaService, private readonly nationalApi: NfseNationalApiService) {}

  async getSettings(userId: string, accountRole: AccountRole, companyId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    return this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
  }

  async updateSettings(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    const { companyId: _ignoredCompanyId, ...cleanDto } = this.clean(dto);
    return this.prisma.nfseSettings.upsert({
      where: { companyId },
      update: cleanDto as Prisma.NfseSettingsUncheckedUpdateInput,
      create: { ...(cleanDto as Prisma.NfseSettingsUncheckedCreateInput), companyId },
    });
  }

  async listServices(userId: string, accountRole: AccountRole, companyId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    return this.prisma.nfseService.findMany({ where: { companyId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  }

  async createService(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    const name = this.requiredString(dto.name, 'Nome do serviço obrigatório.');
    const nationalTaxCode = this.requiredString(dto.nationalTaxCode, 'Código de tributação nacional obrigatório.');
    const issRate = this.decimalOrNull(dto.issRate, 'Alíquota ISS inválida. Informe somente números, vírgula ou ponto.');

    if (dto.isDefault) await this.prisma.nfseService.updateMany({ where: { companyId }, data: { isDefault: false } });

    return this.prisma.nfseService.create({
      data: {
        companyId,
        name,
        nationalTaxCode,
        description: dto.description?.trim() || null,
        cnae: dto.cnae?.trim() || null,
        municipalServiceCode: dto.municipalServiceCode?.trim() || null,
        cityServiceCode: dto.cityServiceCode?.trim() || null,
        issRate,
        isIssWithheld: Boolean(dto.isIssWithheld),
        isDefault: Boolean(dto.isDefault),
      },
    });
  }

  async updateService(userId: string, accountRole: AccountRole, companyId: string, serviceId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    await this.ensureService(companyId, serviceId);
    if (dto.isDefault) await this.prisma.nfseService.updateMany({ where: { companyId, id: { not: serviceId } }, data: { isDefault: false } });
    return this.prisma.nfseService.update({
      where: { id: serviceId },
      data: { ...this.clean(dto), issRate: dto.issRate === undefined ? undefined : this.decimalOrNull(dto.issRate, 'Alíquota ISS inválida. Informe somente números, vírgula ou ponto.') },
    });
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
    const name = this.requiredString(dto.name, 'Nome do tomador obrigatório.');
    const document = this.requiredString(this.onlyDigits(dto.document || '') || dto.document, 'Documento do tomador obrigatório.');
    return this.prisma.customer.create({
      data: {
        companyId,
        name,
        document,
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        municipalRegistration: dto.municipalRegistration?.trim() || null,
        stateRegistration: dto.stateRegistration?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim().toUpperCase() || null,
        country: dto.country?.trim() || 'Brasil',
        zipCode: this.onlyDigits(dto.zipCode || '') || null,
        address: dto.address?.trim() || null,
        number: dto.number?.trim() || null,
        complement: dto.complement?.trim() || null,
        neighborhood: dto.neighborhood?.trim() || null,
        foreignDocument: dto.foreignDocument?.trim() || null,
        isForeign: Boolean(dto.isForeign),
      },
    });
  }

  async updateCustomer(userId: string, accountRole: AccountRole, companyId: string, customerId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    await this.ensureCustomer(companyId, customerId);
    return this.prisma.customer.update({ where: { id: customerId }, data: { ...this.clean(dto), document: dto.document ? this.onlyDigits(dto.document) || dto.document : undefined } });
  }

  async listInvoices(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 20), 1), 100);
    const search = String(query.search || '').trim();
    const where: Prisma.NfseInvoiceWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.startDate || query.endDate ? { issuedAt: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}) } } : {}),
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
        amount: this.decimalOrZero(dto.amount, 'Valor da nota inválido. Informe somente números, vírgula ou ponto.'),
        deductions: this.decimalOrNull(dto.deductions, 'Deduções inválidas. Informe somente números, vírgula ou ponto.'),
        discounts: this.decimalOrNull(dto.discounts, 'Descontos inválidos. Informe somente números, vírgula ou ponto.'),
        issRate: this.decimalOrNull(dto.issRate, 'Alíquota ISS inválida. Informe somente números, vírgula ou ponto.'),
        issAmount: this.decimalOrNull(dto.issAmount, 'Valor do ISS inválido. Informe somente números, vírgula ou ponto.'),
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

  async transmitInvoice(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    const invoice = await this.getCompanyInvoice(companyId, invoiceId);
    const settings = await this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
    const certificate = settings.certificateId ? await this.prisma.digitalCertificate.findFirst({ where: { id: settings.certificateId, companyId } }) : null;

    await this.prisma.nfseInvoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.PROCESSING } });

    try {
      const response = await this.nationalApi.transmitDps(settings, invoice, certificate?.encryptedPath, certificate?.encryptedPassword || undefined);
      const success = response.statusCode >= 200 && response.statusCode < 300;
      const accessKey = this.extractAccessKey(response.json) || this.extractAccessKeyFromText(response.body) || invoice.accessKey;
      const updated = await this.prisma.nfseInvoice.update({
        where: { id: invoiceId },
        data: {
          status: success ? InvoiceStatus.AUTHORIZED : InvoiceStatus.REJECTED,
          accessKey,
          responsePayload: response.json === undefined ? { body: response.body, statusCode: response.statusCode } : (response.json as Prisma.InputJsonValue),
          errorMessage: success ? null : response.body.slice(0, 2000),
          issuedAt: success ? new Date() : invoice.issuedAt,
        },
        include: { customer: true, service: true },
      });
      await this.recordEvent(invoiceId, success ? 'TRANSMIT_SUCCESS' : 'TRANSMIT_REJECTED', response);
      await this.storeXml(invoiceId, 'dps-envio.xml', this.nationalApi.generateDpsXml(invoice));
      return updated;
    } catch (error) {
      await this.prisma.nfseInvoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.REJECTED, errorMessage: error instanceof Error ? error.message : 'Falha ao transmitir NFS-e.' } });
      throw error;
    }
  }

  async syncInvoice(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    const invoice = await this.getCompanyInvoice(companyId, invoiceId);
    if (!invoice.accessKey) throw new BadRequestException('Nota fiscal ainda não possui chave de acesso para consulta.');
    const settings = await this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
    const certificate = settings.certificateId ? await this.prisma.digitalCertificate.findFirst({ where: { id: settings.certificateId, companyId } }) : null;
    const response = await this.nationalApi.consultByAccessKey(settings, invoice.accessKey, certificate?.encryptedPath, certificate?.encryptedPassword || undefined);
    await this.recordEvent(invoiceId, 'SYNC_BY_ACCESS_KEY', response);
    return this.prisma.nfseInvoice.update({
      where: { id: invoiceId },
      data: { responsePayload: response.json === undefined ? { body: response.body, statusCode: response.statusCode } : (response.json as Prisma.InputJsonValue) },
      include: { customer: true, service: true },
    });
  }

  async downloadInvoiceFile(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string, kind: StorageKind) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    await this.getCompanyInvoice(companyId, invoiceId);
    const file = await this.prisma.storedFile.findFirst({ where: { invoiceId, kind }, orderBy: { createdAt: 'desc' } });
    if (!file) throw new NotFoundException(`${kind === StorageKind.XML ? 'XML' : 'PDF'} da NFS-e ainda não foi armazenado.`);
    return file;
  }

  private async getCompanyInvoice(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.nfseInvoice.findFirst({ where: { id: invoiceId, companyId }, include: { customer: true, service: true } });
    if (!invoice) throw new NotFoundException('Nota fiscal não encontrada para esta empresa.');
    return invoice;
  }

  private async recordEvent(invoiceId: string, type: string, payload: unknown) {
    await this.prisma.nfseEvent.create({ data: { invoiceId, type, payload: payload as Prisma.InputJsonValue } });
  }

  private async storeXml(invoiceId: string, fileName: string, xml: string) {
    const path = `nfse/${invoiceId}/${fileName}`;
    await this.prisma.storedFile.create({ data: { invoiceId, kind: StorageKind.XML, path, fileName, mimeType: 'application/xml', sizeBytes: Buffer.byteLength(xml, 'utf8') } });
  }

  private extractAccessKey(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as Record<string, any>;
    return candidate.chaveAcesso || candidate.chave || candidate.accessKey || candidate.nfse?.chaveAcesso || null;
  }

  private extractAccessKeyFromText(text: string) {
    return text.match(/\b\d{30,60}\b/)?.[0] || null;
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

  private decimalOrZero(value: any, message = 'Informe um valor numérico válido.') {
    const decimal = this.parseDecimal(value, message);
    return decimal ?? new Prisma.Decimal(0);
  }

  private decimalOrNull(value: any, message = 'Informe um valor numérico válido.') {
    return this.parseDecimal(value, message);
  }

  private parseDecimal(value: any, message: string) {
    if (value === undefined || value === null || value === '') return null;
    const normalized = String(value).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(normalized)) throw new BadRequestException(message);
    return new Prisma.Decimal(normalized);
  }

  private onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }

  private requiredString(value: any, message: string) {
    const normalized = String(value || '').trim();
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }
}
