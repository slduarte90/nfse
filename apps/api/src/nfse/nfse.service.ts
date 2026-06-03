import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CertificateStatus, CompanyUserStatus, InvoiceStatus, NfseEnvironment, Prisma, StorageKind, StoredFile } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import PDFDocument = require('pdfkit');
import * as QRCode from 'qrcode';
import { PrismaService } from '../database/prisma.service';
import { CompanyPermissionKey, hasAnyCompanyPermission } from '../permissions/company-permissions';
import { NfseNationalApiService } from './nfse-national-api.service';

interface BrasilApiCnpjResponse {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
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
}

interface ReceitaWsCnpjResponse {
  status?: string;
  message?: string;
  cnpj?: string;
  nome?: string;
  fantasia?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  email?: string;
  telefone?: string;
}

type HomologationCheckStatus = 'READY' | 'PENDING' | 'WARNING';

type HomologationCheckItem = {
  id: string;
  title: string;
  status: HomologationCheckStatus;
  severity: 'blocking' | 'attention' | 'manual';
  message: string;
  action: string;
};

@Injectable()
export class NfseService {
  constructor(private readonly prisma: PrismaService, private readonly nationalApi: NfseNationalApiService) {}

  async getSettings(userId: string, accountRole: AccountRole, companyId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, 'nfse.settings.view');
    return this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
  }

  async updateSettings(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.settings.edit');
    const { companyId: _ignoredCompanyId, ...cleanDto } = this.clean(dto);
    const nullableFields = ['apiBaseUrl', 'apiVersion', 'municipalRegistration', 'specialTaxRegime', 'defaultOperationNature', 'defaultRpsSeries'];
    for (const field of nullableFields) {
      if (dto?.[field] !== undefined) {
        (cleanDto as Record<string, unknown>)[field] = this.optionalString(dto[field]);
      }
    }
    return this.prisma.nfseSettings.upsert({
      where: { companyId },
      update: cleanDto as Prisma.NfseSettingsUncheckedUpdateInput,
      create: { ...(cleanDto as Prisma.NfseSettingsUncheckedCreateInput), companyId },
    });
  }

  async getHomologationChecklist(userId: string, accountRole: AccountRole, companyId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, 'nfse.settings.view');
    const settings = await this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
    const [company, certificate, services, customersCount] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      settings.certificateId ? this.prisma.digitalCertificate.findFirst({ where: { id: settings.certificateId, companyId } }) : null,
      this.prisma.nfseService.findMany({ where: { companyId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
      this.prisma.customer.count({ where: { companyId } }),
    ]);
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const defaultService = services.find((service) => service.isDefault) || services[0] || null;
    const certificateExpired = Boolean(certificate?.validUntil && certificate.validUntil < new Date());
    if (certificate?.id && certificateExpired && certificate.status !== CertificateStatus.EXPIRED) {
      await this.prisma.digitalCertificate.updateMany({ where: { id: certificate.id, companyId }, data: { status: CertificateStatus.EXPIRED } });
    }

    const baseUrl = settings.apiBaseUrl || this.nationalApi.getDefaultBaseUrl(settings.environment);
    const suggestedBaseUrl = this.nationalApi.getDefaultBaseUrl(settings.environment);
    const serviceIssues = [
      !defaultService?.nationalTaxCode ? 'codigo nacional' : '',
      !defaultService?.issRate ? 'aliquota ISS' : '',
    ].filter(Boolean);

    const items: HomologationCheckItem[] = [
      {
        id: 'environment',
        title: 'Ambiente selecionado',
        status: baseUrl && !baseUrl.includes('/contribuintes') ? 'READY' : 'WARNING',
        severity: 'attention',
        message: `${settings.environment === NfseEnvironment.PRODUCTION ? 'Producao' : 'Homologacao/producao restrita'} - ${baseUrl}`,
        action: `Usar ${suggestedBaseUrl} para o ambiente selecionado.`,
      },
      {
        id: 'company',
        title: 'Dados da empresa',
        status: company.cnpj && company.legalName ? 'READY' : 'PENDING',
        severity: 'blocking',
        message: company.cnpj && company.legalName ? `${company.legalName} - ${company.cnpj}` : 'CNPJ e razao social precisam estar preenchidos.',
        action: 'Conferir cadastro da empresa antes do primeiro envio.',
      },
      {
        id: 'municipality',
        title: 'Municipio de emissao',
        status: this.onlyDigits(settings.municipalIbgeCode || '').length === 7 ? 'READY' : 'PENDING',
        severity: 'blocking',
        message: this.onlyDigits(settings.municipalIbgeCode || '').length === 7 ? `Codigo IBGE ${settings.municipalIbgeCode}` : 'Codigo IBGE do municipio emissor ainda nao esta valido.',
        action: 'Selecionar o municipio na parametrizacao.',
      },
      {
        id: 'municipal-registration',
        title: 'Inscricao municipal',
        status: settings.municipalRegistration ? 'READY' : 'WARNING',
        severity: 'attention',
        message: settings.municipalRegistration ? `Inscricao ${settings.municipalRegistration}` : 'Nao informada. Alguns municipios exigem para validar a DPS.',
        action: 'Confirmar a inscricao municipal da empresa.',
      },
      {
        id: 'certificate',
        title: 'Certificado A1',
        status: certificate && certificate.status === CertificateStatus.VALID && !certificateExpired && certificate.encryptedPath && certificate.encryptedPassword ? 'READY' : 'PENDING',
        severity: 'blocking',
        message: certificate
          ? certificateExpired || certificate.status === CertificateStatus.EXPIRED
            ? 'Certificado vencido.'
            : `Status ${this.certificateStatusLabel(certificate.status)}${certificate.validUntil ? `, vence em ${certificate.validUntil.toISOString().slice(0, 10)}` : ''}.`
          : 'Nenhum certificado vinculado.',
        action: 'Manter certificado A1 valido e pertencente ao CNPJ da empresa.',
      },
      {
        id: 'services',
        title: 'Servico fiscal padrao',
        status: services.length ? 'WARNING' : 'PENDING',
        severity: services.length ? 'manual' : 'blocking',
        message: services.length
          ? serviceIssues.length
            ? `Servico "${defaultService?.name}" precisa conferir: ${serviceIssues.join(', ')}.`
            : `Servico "${defaultService?.name}" preenchido; codigos fiscais ainda dependem de conferencia.`
          : 'Nenhum servico ativo cadastrado.',
        action: 'Conferir codigos e aliquota antes de iniciar os testes de emissao.',
      },
      {
        id: 'taker',
        title: 'Tomador de teste',
        status: customersCount > 0 ? 'READY' : 'WARNING',
        severity: 'manual',
        message: customersCount > 0 ? `${customersCount} tomador(es) cadastrado(s).` : 'Cadastre ao menos um tomador antes do primeiro envio.',
        action: 'Usar um tomador simples e validado para a primeira NFS-e de homologacao.',
      },
      {
        id: 'xml-flow',
        title: 'Fluxo XML de envio e retorno',
        status: 'READY',
        severity: 'attention',
        message: 'O sistema gera XML de envio, transmite por certificado A1 e registra o retorno da API.',
        action: 'No primeiro envio real, validar rejeicoes contra o XSD e anexos oficiais vigentes.',
      },
    ];

    const blockingCount = items.filter((item) => item.status !== 'READY' && item.severity === 'blocking').length;
    const readyCount = items.filter((item) => item.status === 'READY').length;

    return {
      ready: blockingCount === 0,
      readyCount,
      totalCount: items.length,
      blockingCount,
      generatedAt: new Date(),
      api: {
        environment: settings.environment,
        baseUrl,
        suggestedBaseUrl,
        docsUrl: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/index',
      },
      nextStep: blockingCount
        ? 'Resolver os itens obrigatorios antes de transmitir uma NFS-e.'
        : 'Conferir os codigos de servico e aliquotas; depois cadastrar uma NFS-e simples para transmitir.',
      items,
    };
  }

  async listServices(userId: string, accountRole: AccountRole, companyId: string, status = 'active') {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, ['nfse.settings.view', 'nfse.settings.edit', 'nfse.invoices.view', 'nfse.invoices.create', 'nfse.invoices.edit']);
    const isActive = status === 'inactive' ? false : status === 'all' ? undefined : true;
    return this.prisma.nfseService.findMany({
      where: { companyId, ...(isActive === undefined ? {} : { isActive }) },
      include: { _count: { select: { invoices: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createService(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.settings.edit');
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
        nbsCode: dto.nbsCode?.trim() || null,
        ibsCbsTaxClassCode: dto.ibsCbsTaxClassCode?.trim() || null,
        ibsCbsOperationCode: dto.ibsCbsOperationCode?.trim() || null,
        municipalServiceCode: dto.municipalServiceCode?.trim() || null,
        cityServiceCode: dto.cityServiceCode?.trim() || null,
        issRate,
        isIssWithheld: Boolean(dto.isIssWithheld),
        isDefault: Boolean(dto.isDefault),
      },
    });
  }

  async updateService(userId: string, accountRole: AccountRole, companyId: string, serviceId: string, dto: any) {
    const keys = Object.keys(dto || {});
    const onlyActiveToggle = keys.length === 1 && keys[0] === 'isActive';
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, onlyActiveToggle ? 'nfse.settings.delete' : 'nfse.settings.edit');
    await this.ensureService(companyId, serviceId, true);
    if (dto.isDefault) await this.prisma.nfseService.updateMany({ where: { companyId, id: { not: serviceId } }, data: { isDefault: false } });
    const data: Prisma.NfseServiceUpdateInput = {
      ...(dto.name !== undefined ? { name: this.requiredString(dto.name, 'Nome do serviço obrigatório.') } : {}),
      ...(dto.nationalTaxCode !== undefined ? { nationalTaxCode: this.requiredString(dto.nationalTaxCode, 'Código de tributação nacional obrigatório.') } : {}),
      ...(dto.description !== undefined ? { description: this.optionalString(dto.description) } : {}),
      ...(dto.cnae !== undefined ? { cnae: this.optionalString(dto.cnae) } : {}),
      ...(dto.nbsCode !== undefined ? { nbsCode: this.optionalString(dto.nbsCode) } : {}),
      ...(dto.ibsCbsTaxClassCode !== undefined ? { ibsCbsTaxClassCode: this.optionalString(dto.ibsCbsTaxClassCode) } : {}),
      ...(dto.ibsCbsOperationCode !== undefined ? { ibsCbsOperationCode: this.optionalString(dto.ibsCbsOperationCode) } : {}),
      ...(dto.municipalServiceCode !== undefined ? { municipalServiceCode: this.optionalString(dto.municipalServiceCode) } : {}),
      ...(dto.cityServiceCode !== undefined ? { cityServiceCode: this.optionalString(dto.cityServiceCode) } : {}),
      ...(dto.issRate !== undefined ? { issRate: this.decimalOrNull(dto.issRate, 'Alíquota ISS inválida. Informe somente números, vírgula ou ponto.') } : {}),
      ...(dto.isIssWithheld !== undefined ? { isIssWithheld: Boolean(dto.isIssWithheld) } : {}),
      ...(dto.isDefault !== undefined ? { isDefault: Boolean(dto.isDefault) } : {}),
      ...(dto.isActive !== undefined ? { isActive: Boolean(dto.isActive) } : {}),
    };
    return this.prisma.nfseService.update({
      where: { id: serviceId },
      data,
    });
  }

  async deleteService(userId: string, accountRole: AccountRole, companyId: string, serviceId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.settings.delete');
    await this.ensureService(companyId, serviceId);
    return this.prisma.nfseService.update({ where: { id: serviceId }, data: { isActive: false } });
  }

  async removeService(userId: string, accountRole: AccountRole, companyId: string, serviceId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.settings.delete');
    await this.ensureService(companyId, serviceId, true);
    const linkedInvoices = await this.prisma.nfseInvoice.count({ where: { companyId, serviceId } });
    if (linkedInvoices > 0) {
      throw new BadRequestException('Servico ja utilizado em nota fiscal. Para preservar o historico, ele pode apenas ser inativado.');
    }
    return this.prisma.nfseService.delete({ where: { id: serviceId } });
  }

  async listCustomers(userId: string, accountRole: AccountRole, companyId: string, query: any = {}) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, ['nfse.takers.view', 'nfse.invoices.create', 'nfse.invoices.edit']);
    const term = String(query.search || '').trim();
    return this.prisma.customer.findMany({
      where: this.buildCustomerWhere(companyId, term),
      include: { _count: { select: { invoices: true } } },
      orderBy: this.buildCustomerOrderBy(query),
    });
  }

  async exportCustomersReport(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, 'nfse.takers.view');
    const term = String(query.search || '').trim();
    const customers = await this.prisma.customer.findMany({
      where: this.buildCustomerWhere(companyId, term),
      include: { _count: { select: { invoices: true } }, company: true },
      orderBy: this.buildCustomerOrderBy(query),
    });
    const rows = customers.map((customer) => ({
      nome: customer.name,
      documento: customer.document,
      documento_estrangeiro: customer.foreignDocument || '',
      estrangeiro: customer.isForeign ? 'Sim' : 'Nao',
      email: customer.email || '',
      telefone: customer.phone || '',
      inscricao_municipal: customer.municipalRegistration || '',
      inscricao_estadual: customer.stateRegistration || '',
      endereco: customer.address || '',
      numero: customer.number || '',
      complemento: customer.complement || '',
      bairro: customer.neighborhood || '',
      cep: customer.zipCode || '',
      cidade: customer.city || '',
      uf: customer.state || '',
      pais: customer.country || '',
      status: customer.isActive ? 'Ativo' : 'Inativo',
      notas_emitidas: customer._count.invoices,
      data_criacao: this.formatReportDate(customer.createdAt),
      data_atualizacao: this.formatReportDate(customer.updatedAt),
      empresa: customer.company.legalName,
      cnpj_empresa: customer.company.cnpj,
    }));
    const csv = this.toCsv(rows);
    const suffix = new Date().toISOString().slice(0, 10);
    return {
      fileName: `relatorio-tomadores-${suffix}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      contentBase64: Buffer.from(`\uFEFF${csv}`, 'utf8').toString('base64'),
    };
  }
  async lookupCustomerCnpj(userId: string, accountRole: AccountRole, companyId: string, cnpjInput: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, ['nfse.takers.create', 'nfse.takers.edit', 'nfse.invoices.create', 'nfse.invoices.edit']);
    const cnpj = this.onlyDigits(cnpjInput || '');
    this.ensureValidCnpj(cnpj);

    const brasilApiData = await this.lookupBrasilApi(cnpj);
    if (brasilApiData) return brasilApiData;

    const receitaWsData = await this.lookupReceitaWs(cnpj);
    if (receitaWsData) return receitaWsData;

    throw new BadRequestException('Nao foi possivel consultar o CNPJ agora. Tente novamente.');
  }

  async createCustomer(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.takers.create');
    const name = this.requiredString(dto.name, 'Nome do tomador obrigatório.');
    const country = dto.country?.trim() || 'Brasil';
    const rawDocument = String(dto.document || '').trim();
    const isForeign = Boolean(dto.isForeign) || /[a-z]/i.test(rawDocument) || country.toLowerCase() !== 'brasil';
    const document = this.requiredString(isForeign ? rawDocument.toUpperCase() : this.onlyDigits(rawDocument), 'Documento do tomador obrigatório.');
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
        country,
        zipCode: this.onlyDigits(dto.zipCode || '') || null,
        address: dto.address?.trim() || null,
        number: dto.number?.trim() || null,
        complement: dto.complement?.trim() || null,
        neighborhood: dto.neighborhood?.trim() || null,
        foreignDocument: isForeign ? (dto.foreignDocument?.trim() || document) : null,
        isForeign,
        isActive: true,
      },
    });
  }

  async updateCustomer(userId: string, accountRole: AccountRole, companyId: string, customerId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.takers.edit');
    await this.ensureCustomer(companyId, customerId, true);
    const rawDocument = dto.document === undefined ? undefined : String(dto.document || '').trim();
    const country = dto.country?.trim() || 'Brasil';
    const isForeign = rawDocument === undefined
      ? dto.isForeign
      : Boolean(dto.isForeign) || /[a-z]/i.test(rawDocument) || country?.toLowerCase() !== 'brasil';
    const document = rawDocument === undefined ? undefined : (isForeign ? rawDocument.toUpperCase() : this.onlyDigits(rawDocument));
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...this.clean(dto),
        document: document || undefined,
        foreignDocument: isForeign && document ? (dto.foreignDocument?.trim() || document) : dto.foreignDocument,
        isForeign,
      },
    });
  }

  async removeCustomer(userId: string, accountRole: AccountRole, companyId: string, customerId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.takers.delete');
    await this.ensureCustomer(companyId, customerId, true);
    const linkedInvoices = await this.prisma.nfseInvoice.count({ where: { companyId, customerId } });
    if (linkedInvoices > 0) {
      throw new BadRequestException('Tomador ja utilizado em nota fiscal. Para preservar o historico, ele pode apenas ser inativado.');
    }
    return this.prisma.customer.delete({ where: { id: customerId } });
  }

  async listInvoices(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, 'nfse.invoices.view');
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 20), 1), 100);
    const where = this.buildInvoiceWhere(companyId, query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.nfseInvoice.count({ where }),
      this.prisma.nfseInvoice.findMany({ where, include: { customer: true, service: true }, orderBy: this.buildInvoiceOrderBy(query), skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  }

  async exportInvoicesReport(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, 'nfse.invoices.view');
    const where = this.buildInvoiceWhere(companyId, query);
    const invoices = await this.prisma.nfseInvoice.findMany({
      where,
      include: { customer: true, service: true, company: true },
      orderBy: this.buildInvoiceOrderBy(query),
    });
    const rows = invoices.map((invoice) => ({
      numero: invoice.number || '',
      rps: invoice.rpsNumber || '',
      serie: invoice.series || invoice.rpsSeries || '',
      status: invoice.status,
      chave_acesso: invoice.accessKey || '',
      codigo_verificacao: invoice.verificationCode || '',
      valor_servico: this.formatReportDecimal(invoice.amount),
      aliquota_iss: this.formatReportDecimal(invoice.issRate),
      iss_retido: invoice.issWithheld ? 'Sim' : 'Nao',
      tomador: invoice.customer?.name || '',
      documento_tomador: invoice.customer?.document || '',
      email_tomador: invoice.customer?.email || '',
      cidade_tomador: invoice.customer?.city || '',
      uf_tomador: invoice.customer?.state || '',
      servico: invoice.service?.name || '',
      descricao_servico: invoice.serviceDescription || '',
      codigo_tributacao_nacional: invoice.nationalTaxCode || invoice.service?.nationalTaxCode || '',
      codigo_servico_municipal: invoice.municipalServiceCode || invoice.service?.municipalServiceCode || '',
      municipio_ibge: invoice.municipalIbgeCode || '',
      data_competencia: this.formatReportDate(invoice.competenceDate),
      data_emissao: this.formatReportDate(invoice.issuedAt),
      data_criacao: this.formatReportDate(invoice.createdAt),
      data_atualizacao: this.formatReportDate(invoice.updatedAt),
      usuario_criacao: invoice.createdByName || '',
      usuario_atualizacao: invoice.updatedByName || '',
      usuario_transmissao: invoice.transmittedByName || '',
      motivo_rejeicao: invoice.errorMessage || '',
      empresa: invoice.company.legalName,
      cnpj_empresa: invoice.company.cnpj,
    }));
    const csv = this.toCsv(rows);
    const suffix = new Date().toISOString().slice(0, 10);
    return {
      fileName: `relatorio-nfse-${suffix}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      contentBase64: Buffer.from(`\uFEFF${csv}`, 'utf8').toString('base64'),
    };
  }

  async createInvoice(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.invoices.create');
    if (dto.customerId) await this.ensureCustomer(companyId, dto.customerId);
    if (dto.serviceId) await this.ensureService(companyId, dto.serviceId);
    const settings = await this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
    const userSnapshot = await this.getUserSnapshot(userId);
    const nextNumber = String(dto.number || dto.rpsNumber || await this.getNextInvoiceNumber(companyId));
    const nextSeries = dto.series || dto.rpsSeries || settings.defaultRpsSeries || null;
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
        number: nextNumber,
        rpsNumber: nextNumber,
        series: nextSeries,
        rpsSeries: nextSeries,
        serviceDescription: dto.serviceDescription || '',
        serviceCode: dto.serviceCode || null,
        nationalTaxCode: dto.nationalTaxCode || null,
        municipalServiceCode: dto.municipalServiceCode || null,
        municipalIbgeCode: dto.municipalIbgeCode || null,
        competenceDate: dto.competenceDate ? new Date(dto.competenceDate) : null,
        operationNature: dto.operationNature || null,
        additionalInformation: dto.additionalInformation || null,
        createdByUserId: userId,
        createdByName: userSnapshot,
        updatedByUserId: userId,
        updatedByName: userSnapshot,
        requestPayload: dto,
      },
      include: { customer: true, service: true },
    });
  }

  async updateInvoice(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.invoices.edit');
    const invoice = await this.getCompanyInvoice(companyId, invoiceId);
    if (!this.isLocalEditableInvoice(invoice)) {
      throw new BadRequestException('Apenas NFS-e local em rascunho ou rejeitada, sem chave de acesso, pode ser editada.');
    }
    if (dto.customerId) await this.ensureCustomer(companyId, dto.customerId);
    if (dto.serviceId) await this.ensureService(companyId, dto.serviceId);
    const userSnapshot = await this.getUserSnapshot(userId);

    return this.prisma.nfseInvoice.update({
      where: { id: invoiceId },
      data: {
        ...(dto.customerId !== undefined ? { customerId: dto.customerId || null } : {}),
        ...(dto.serviceId !== undefined ? { serviceId: dto.serviceId || null } : {}),
        ...(dto.amount !== undefined ? { amount: this.decimalOrZero(dto.amount, 'Valor da nota inválido. Informe somente números, vírgula ou ponto.') } : {}),
        ...(dto.deductions !== undefined ? { deductions: this.decimalOrNull(dto.deductions, 'Deduções inválidas. Informe somente números, vírgula ou ponto.') } : {}),
        ...(dto.discounts !== undefined ? { discounts: this.decimalOrNull(dto.discounts, 'Descontos inválidos. Informe somente números, vírgula ou ponto.') } : {}),
        ...(dto.issRate !== undefined ? { issRate: this.decimalOrNull(dto.issRate, 'Alíquota ISS inválida. Informe somente números, vírgula ou ponto.') } : {}),
        ...(dto.issAmount !== undefined ? { issAmount: this.decimalOrNull(dto.issAmount, 'Valor do ISS inválido. Informe somente números, vírgula ou ponto.') } : {}),
        ...(dto.issWithheld !== undefined ? { issWithheld: Boolean(dto.issWithheld) } : {}),
        ...(dto.serviceDescription !== undefined ? { serviceDescription: dto.serviceDescription || '' } : {}),
        ...(dto.serviceCode !== undefined ? { serviceCode: dto.serviceCode || null } : {}),
        ...(dto.nationalTaxCode !== undefined ? { nationalTaxCode: dto.nationalTaxCode || null } : {}),
        ...(dto.municipalServiceCode !== undefined ? { municipalServiceCode: dto.municipalServiceCode || null } : {}),
        ...(dto.municipalIbgeCode !== undefined ? { municipalIbgeCode: dto.municipalIbgeCode || null } : {}),
        ...(dto.competenceDate !== undefined ? { competenceDate: dto.competenceDate ? new Date(dto.competenceDate) : null } : {}),
        ...(dto.operationNature !== undefined ? { operationNature: dto.operationNature || null } : {}),
        ...(dto.additionalInformation !== undefined ? { additionalInformation: dto.additionalInformation || null } : {}),
        status: InvoiceStatus.DRAFT,
        errorCode: null,
        errorMessage: null,
        updatedByUserId: userId,
        updatedByName: userSnapshot,
        requestPayload: dto,
      },
      include: { customer: true, service: true },
    });
  }

  async deleteInvoice(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string) {
    const result = await this.deleteInvoices(userId, accountRole, companyId, [invoiceId]);
    return { deletedId: invoiceId, ...result };
  }

  async deleteInvoices(userId: string, accountRole: AccountRole, companyId: string, invoiceIds: unknown) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.invoices.delete');
    const ids = Array.from(new Set((Array.isArray(invoiceIds) ? invoiceIds : []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!ids.length) throw new BadRequestException('Selecione ao menos uma NFS-e local para excluir.');
    const invoices = await this.prisma.nfseInvoice.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, status: true, accessKey: true, issuedAt: true } });
    if (invoices.length !== ids.length) throw new NotFoundException('Uma ou mais NFS-e selecionadas não foram encontradas para esta empresa.');
    const invalid = invoices.find((invoice) => !this.isLocalEditableInvoice(invoice));
    if (invalid) throw new BadRequestException('Apenas NFS-e locais em rascunho ou rejeitadas, sem chave de acesso, podem ser excluídas.');
    await this.prisma.$transaction([
      this.prisma.storedFile.deleteMany({ where: { invoiceId: { in: ids } } }),
      this.prisma.nfseEvent.deleteMany({ where: { invoiceId: { in: ids } } }),
      this.prisma.nfseInvoice.deleteMany({ where: { companyId, id: { in: ids } } }),
    ]);
    return { deletedIds: ids, nextNumber: await this.getNextInvoiceNumber(companyId) };
  }

  async transmitInvoice(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.invoices.transmit');
    const invoice = await this.getCompanyInvoice(companyId, invoiceId);
    if (!this.isLocalEditableInvoice(invoice)) {
      throw new BadRequestException('Somente NFS-e local em rascunho ou rejeitada, sem chave de acesso, pode ser transmitida.');
    }
    const settings = await this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
    this.validateInvoiceForTransmission(invoice);
    const certificate = settings.certificateId ? await this.prisma.digitalCertificate.findFirst({ where: { id: settings.certificateId, companyId } }) : null;
    await this.ensureUsableCertificate(certificate, companyId);
    const userSnapshot = await this.getUserSnapshot(userId);

    await this.prisma.nfseInvoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.PROCESSING, transmittedByUserId: userId, transmittedByName: userSnapshot } });

    try {
      const dpsXml = this.nationalApi.prepareDpsXml(settings, invoice, certificate?.encryptedPath, certificate?.encryptedPassword || undefined);
      await this.recordEvent(invoiceId, 'TRANSMIT_REQUEST', {
        api: {
          environment: settings.environment,
          baseUrl: settings.apiBaseUrl || this.nationalApi.getDefaultBaseUrl(settings.environment),
          path: '/nfse',
          method: 'POST',
          contentType: 'application/json; charset=utf-8',
          payloadField: 'dpsXmlGZipB64',
        },
        dps: {
          id: this.extractDpsIdFromXml(dpsXml),
          xml: dpsXml,
        },
      });
      const response = await this.nationalApi.transmitDps(settings, invoice, certificate?.encryptedPath, certificate?.encryptedPassword || undefined, dpsXml);
      const success = response.statusCode >= 200 && response.statusCode < 300;
      const accessKey = this.extractAccessKey(response.json) || this.extractAccessKeyFromText(response.body) || invoice.accessKey;
      const number = success ? this.extractInvoiceNumber(response.json) || this.extractInvoiceNumberFromText(response.body) || invoice.number : invoice.number;
      const verificationCode = success ? this.extractVerificationCode(response.json) || this.extractVerificationCodeFromText(response.body) || invoice.verificationCode : invoice.verificationCode;
      const responseXml = this.extractNfseXml(response.json);
      const errorMessage = success ? null : this.formatNationalApiError(response);
      const errorCode = success ? null : this.extractNationalApiErrorCode(response);
      const updated = await this.prisma.nfseInvoice.update({
        where: { id: invoiceId },
        data: {
          status: success ? InvoiceStatus.AUTHORIZED : InvoiceStatus.REJECTED,
          accessKey,
          number,
          verificationCode,
          responsePayload: response.json === undefined ? { body: response.body, statusCode: response.statusCode } : (response.json as Prisma.InputJsonValue),
          errorCode,
          errorMessage,
          transmittedByUserId: userId,
          transmittedByName: userSnapshot,
          issuedAt: success ? new Date() : invoice.issuedAt,
        },
        include: { customer: true, service: true },
      });
      await this.recordEvent(invoiceId, success ? 'TRANSMIT_SUCCESS' : 'TRANSMIT_REJECTED', response);
      await this.storeXml(invoiceId, 'dps-envio.xml', dpsXml);
      if (responseXml) await this.storeXml(invoiceId, 'nfse-retorno.xml', responseXml);
      else if (response.body) await this.storeXml(invoiceId, success ? 'nfse-retorno.json' : 'nfse-rejeicao.json', response.body, 'application/json');
      return updated;
    } catch (error) {
      await this.prisma.nfseInvoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.REJECTED, errorMessage: error instanceof Error ? error.message : 'Falha ao transmitir NFS-e.', transmittedByUserId: userId, transmittedByName: userSnapshot } });
      throw error;
    }
  }
  async cancelInvoice(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true, 'nfse.invoices.delete');
    const invoice = await this.getCompanyInvoice(companyId, invoiceId);
    if (!invoice.accessKey) throw new BadRequestException('NFS-e ainda nao possui chave de acesso para cancelamento.');
    if (invoice.status === InvoiceStatus.CANCELLED) throw new BadRequestException('NFS-e ja esta cancelada.');
    if (invoice.status !== InvoiceStatus.AUTHORIZED) throw new BadRequestException('Somente NFS-e autorizada pode ser cancelada pela API nacional.');

    const reasonCode = String(dto?.reasonCode || dto?.cMotivo || '').trim();
    if (!['1', '2', '9'].includes(reasonCode)) throw new BadRequestException('Selecione o motivo do cancelamento: 1, 2 ou 9.');
    const reasonText = this.requiredString(dto?.reasonText || dto?.xMotivo || dto?.justification, 'Informe a justificativa do cancelamento.').replace(/\s+/g, ' ').trim();
    if (reasonText.length < 15 || reasonText.length > 255) throw new BadRequestException('Justificativa do cancelamento deve ter entre 15 e 255 caracteres.');

    const settings = await this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
    const certificate = settings.certificateId ? await this.prisma.digitalCertificate.findFirst({ where: { id: settings.certificateId, companyId } }) : null;
    await this.ensureUsableCertificate(certificate, companyId);
    const userSnapshot = await this.getUserSnapshot(userId);
    const eventXml = this.nationalApi.prepareCancellationEventXml(settings, invoice, reasonCode, reasonText, certificate?.encryptedPath, certificate?.encryptedPassword || undefined);

    await this.recordEvent(invoiceId, 'CANCEL_REQUEST', {
      api: {
        environment: settings.environment,
        baseUrl: settings.apiBaseUrl || this.nationalApi.getDefaultBaseUrl(settings.environment),
        path: `/nfse/${invoice.accessKey}/eventos`,
        method: 'POST',
        contentType: 'application/json; charset=utf-8',
        payloadField: 'pedidoRegistroEventoXmlGZipB64',
      },
      cancellation: { reasonCode, reasonText, xml: eventXml },
    });

    const response = await this.nationalApi.cancelByAccessKey(settings, invoice, reasonCode, reasonText, certificate?.encryptedPath, certificate?.encryptedPassword || undefined, eventXml);
    const success = response.statusCode >= 200 && response.statusCode < 300;
    const responseXml = this.extractEventXml(response.json) || this.extractNfseXmlFromText(response.body);
    await this.recordEvent(invoiceId, success ? 'CANCEL_SUCCESS' : 'CANCEL_REJECTED', response);
    await this.storeXml(invoiceId, 'cancelamento-envio.xml', eventXml);
    if (responseXml) await this.storeXml(invoiceId, 'cancelamento-evento.xml', responseXml);
    else if (response.body) await this.storeXml(invoiceId, success ? 'cancelamento-retorno.json' : 'cancelamento-rejeicao.json', response.body, 'application/json');

    if (!success) {
      const errorMessage = this.formatNationalApiError(response);
      await this.prisma.nfseInvoice.update({
        where: { id: invoiceId },
        data: {
          errorCode: this.extractNationalApiErrorCode(response),
          errorMessage,
          responsePayload: this.nationalResponsePayload(response),
          updatedByUserId: userId,
          updatedByName: userSnapshot,
        },
      });
      throw new BadRequestException(errorMessage);
    }

    await this.prisma.storedFile.deleteMany({ where: { invoiceId, kind: StorageKind.PDF } });
    return this.prisma.nfseInvoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
        errorCode: null,
        errorMessage: null,
        responsePayload: this.nationalResponsePayload(response),
        pdfPath: null,
        updatedByUserId: userId,
        updatedByName: userSnapshot,
      },
      include: { customer: true, service: true },
    });
  }

  async syncInvoice(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, 'nfse.invoices.sync');
    const invoice = await this.getCompanyInvoice(companyId, invoiceId);
    if (!invoice.accessKey) throw new BadRequestException('Nota fiscal ainda não possui chave de acesso para consulta.');
    const settings = await this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
    const certificate = settings.certificateId ? await this.prisma.digitalCertificate.findFirst({ where: { id: settings.certificateId, companyId } }) : null;
    await this.ensureUsableCertificate(certificate, companyId);
    const response = await this.nationalApi.consultByAccessKey(settings, invoice.accessKey, certificate?.encryptedPath, certificate?.encryptedPassword || undefined);
    let eventsResponse: { statusCode: number; headers: Record<string, string | string[] | undefined>; body: string; json?: unknown } | null = null;
    try {
      eventsResponse = await this.nationalApi.consultEventsByAccessKey(settings, invoice.accessKey, certificate?.encryptedPath, certificate?.encryptedPassword || undefined);
      await this.recordEvent(invoiceId, 'SYNC_EVENTS_BY_ACCESS_KEY', eventsResponse);
    } catch (error) {
      eventsResponse = { statusCode: 0, headers: {}, body: error instanceof Error ? error.message : 'Falha ao consultar eventos da NFS-e no ADN.' };
      await this.recordEvent(invoiceId, 'SYNC_EVENTS_ERROR', eventsResponse);
    }
    const success = response.statusCode >= 200 && response.statusCode < 300;
    const responseXml = this.extractNfseXml(response.json) || this.extractNfseXmlFromText(response.body);
    const eventsSuccess = Boolean(eventsResponse && eventsResponse.statusCode >= 200 && eventsResponse.statusCode < 300);
    const eventsXml = eventsResponse ? this.extractNfseXml(eventsResponse.json) || this.extractNfseXmlFromText(eventsResponse.body) : null;
    const nationalStatus = success || eventsSuccess ? this.extractStatusFromNationalResponse(response, responseXml, eventsResponse, eventsXml) : null;
    const accessKey = success ? this.extractAccessKey(response.json) || this.extractAccessKeyFromText(response.body) || (responseXml ? this.extractAccessKeyFromText(responseXml) : null) || invoice.accessKey : invoice.accessKey;
    const number = success ? this.extractInvoiceNumber(response.json) || this.extractInvoiceNumberFromText(response.body) || (responseXml ? this.extractInvoiceNumberFromText(responseXml) : null) || invoice.number : invoice.number;
    const verificationCode = success ? this.extractVerificationCode(response.json) || this.extractVerificationCodeFromText(response.body) || (responseXml ? this.extractVerificationCodeFromText(responseXml) : null) || invoice.verificationCode : invoice.verificationCode;
    const shouldRegeneratePdf = Boolean(nationalStatus && nationalStatus !== invoice.status);
    const lookupFailed = !success && !eventsSuccess;
    const syncErrorCode = lookupFailed ? this.extractNationalApiErrorCode(response) : null;
    const syncErrorMessage = lookupFailed ? this.formatNationalApiError(response) : null;
    const shouldPersistSyncError = lookupFailed && invoice.status === InvoiceStatus.PROCESSING;
    const shouldKeepFiscalError = lookupFailed && invoice.status === InvoiceStatus.REJECTED;
    if (shouldRegeneratePdf) {
      await this.prisma.storedFile.deleteMany({ where: { invoiceId, kind: StorageKind.PDF } });
    }
    await this.recordEvent(invoiceId, 'SYNC_BY_ACCESS_KEY', response);
    const updated = await this.prisma.nfseInvoice.update({
      where: { id: invoiceId },
      data: {
        status: nationalStatus || invoice.status,
        accessKey,
        number,
        verificationCode,
        responsePayload: eventsResponse
          ? ({ nfse: this.nationalResponsePayload(response), eventos: this.nationalResponsePayload(eventsResponse) } as Prisma.InputJsonValue)
          : this.nationalResponsePayload(response),
        errorCode: success ? null : shouldPersistSyncError ? syncErrorCode : shouldKeepFiscalError ? invoice.errorCode : null,
        errorMessage: success ? null : shouldPersistSyncError ? syncErrorMessage : shouldKeepFiscalError ? invoice.errorMessage : null,
        cancelledAt: nationalStatus === InvoiceStatus.CANCELLED ? invoice.cancelledAt || new Date() : nationalStatus === InvoiceStatus.AUTHORIZED ? null : invoice.cancelledAt,
        pdfPath: shouldRegeneratePdf ? null : invoice.pdfPath,
      },
      include: { customer: true, service: true },
    });
    if (responseXml) await this.storeXml(invoiceId, 'nfse-consulta.xml', responseXml);
    return updated;
  }

  async downloadInvoiceFile(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string, kind: StorageKind) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, false, 'nfse.invoices.view');
    const invoice = await this.getCompanyInvoice(companyId, invoiceId);
    if (kind === StorageKind.PDF) return this.downloadInvoicePdf(invoice);
    let file = kind === StorageKind.XML
      ? await this.prisma.storedFile.findFirst({ where: { invoiceId, kind, fileName: { in: ['nfse-retorno.xml', 'nfse-consulta.xml'] } }, orderBy: { createdAt: 'desc' } })
      : null;
    file = file || await this.prisma.storedFile.findFirst({ where: { invoiceId, kind }, orderBy: { createdAt: 'desc' } });
    if (!file) throw new NotFoundException(`${kind === StorageKind.XML ? 'XML' : 'PDF'} da NFS-e ainda não foi armazenado.`);
    const content = await this.readStoredFileContent(file);
    return {
      ...file,
      contentBase64: content.toString('base64'),
    };
  }

  private async downloadInvoicePdf(invoice: Awaited<ReturnType<NfseService['getCompanyInvoice']>>) {
    if ((invoice.status !== InvoiceStatus.AUTHORIZED && invoice.status !== InvoiceStatus.CANCELLED) || !invoice.accessKey) {
      throw new NotFoundException('PDF da NFS-e ainda não está disponível para esta nota.');
    }
    const fileName = `${invoice.accessKey}.pdf`;
    let file = await this.prisma.storedFile.findFirst({ where: { invoiceId: invoice.id, kind: StorageKind.PDF, fileName }, orderBy: { createdAt: 'desc' } });
    if (!file) {
      const settings = await this.prisma.nfseSettings.upsert({ where: { companyId: invoice.companyId }, update: {}, create: { companyId: invoice.companyId } });
      const pdfBuffer = await this.generateDanfsePdf(invoice, settings);
      file = await this.storeFile(invoice.id, StorageKind.PDF, fileName, pdfBuffer, 'application/pdf');
    }
    const content = await this.readStoredFileContent(file);
    return {
      ...file,
      contentBase64: content.toString('base64'),
    };
  }

  private async getCompanyInvoice(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.nfseInvoice.findFirst({ where: { id: invoiceId, companyId }, include: { customer: true, service: true, company: true } });
    if (!invoice) throw new NotFoundException('Nota fiscal não encontrada para esta empresa.');
    return invoice;
  }

  private isLocalEditableInvoice(invoice: { status: InvoiceStatus; accessKey: string | null; issuedAt: Date | null }) {
    return (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.REJECTED) && !invoice.accessKey && !invoice.issuedAt;
  }

  private validateInvoiceForTransmission(invoice: {
    customerId: string | null;
    municipalIbgeCode: string | null;
    nationalTaxCode: string | null;
    serviceDescription: string;
    amount: Prisma.Decimal;
  }) {
    const missing = [
      !invoice.customerId ? 'tomador' : '',
      this.onlyDigits(invoice.municipalIbgeCode || '').length !== 7 ? 'município de incidência com código IBGE válido' : '',
      !invoice.nationalTaxCode?.trim() ? 'código de tributação nacional' : '',
      !invoice.serviceDescription?.trim() ? 'discriminação do serviço' : '',
      Number(invoice.amount) <= 0 ? 'valor do serviço maior que zero' : '',
    ].filter(Boolean);
    if (missing.length) {
      throw new BadRequestException(`Revise a NFS-e antes de transmitir: ${missing.join(', ')}.`);
    }
  }

  private async recordEvent(invoiceId: string, type: string, payload: unknown) {
    await this.prisma.nfseEvent.create({ data: { invoiceId, type, payload: payload as Prisma.InputJsonValue } });
  }

  private async getUserSnapshot(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    return user ? `${user.name} (${user.email})` : userId;
  }

  private async storeXml(invoiceId: string, fileName: string, xml: string, mimeType = 'application/xml') {
    await this.storeFile(invoiceId, StorageKind.XML, fileName, xml, mimeType);
  }

  private async storeFile(invoiceId: string, kind: StorageKind, fileName: string, content: string | Buffer, mimeType: string) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const path = this.writeStoredFile(invoiceId, fileName, buffer);
    const file = await this.prisma.storedFile.create({
      data: { invoiceId, kind, path, fileName, mimeType, sizeBytes: buffer.byteLength },
    });
    if (kind === StorageKind.XML && fileName === 'nfse-retorno.xml') {
      await this.prisma.nfseInvoice.update({ where: { id: invoiceId }, data: { xmlPath: path } });
    }
    if (kind === StorageKind.PDF) {
      await this.prisma.nfseInvoice.update({ where: { id: invoiceId }, data: { pdfPath: path } });
    }
    return file;
  }

  private async readStoredFileContent(file: StoredFile) {
    const existingPath = this.existingStoredFilePath(file.path);
    if (existingPath) return readFileSync(existingPath);
    if (!file.invoiceId) throw new NotFoundException('Arquivo sem vínculo com NFS-e.');
    const recovered = await this.recoverStoredFileContent(file.invoiceId, file.fileName, file.mimeType);
    if (!recovered) throw new NotFoundException(`${file.kind === StorageKind.XML ? 'XML' : 'PDF'} da NFS-e ainda não está disponível para download.`);
    const path = this.writeStoredFile(file.invoiceId, file.fileName, recovered);
    await this.prisma.storedFile.update({ where: { id: file.id }, data: { path, sizeBytes: recovered.byteLength } });
    return recovered;
  }

  private existingStoredFilePath(storedPath: string) {
    const candidates = [
      storedPath,
      isAbsolute(storedPath) ? storedPath : join(process.cwd(), storedPath),
      isAbsolute(storedPath) ? storedPath : join(this.storageRoot(), storedPath),
    ];
    return candidates.find((candidate, index) => candidates.indexOf(candidate) === index && existsSync(candidate)) || null;
  }

  private async recoverStoredFileContent(invoiceId: string, fileName: string, mimeType: string) {
    const normalizedName = fileName.toLowerCase();
    if (normalizedName.includes('dps') && normalizedName.endsWith('.xml')) {
      const requestEvent = await this.prisma.nfseEvent.findFirst({ where: { invoiceId, type: 'TRANSMIT_REQUEST' }, orderBy: { createdAt: 'desc' } });
      const dpsXml = this.extractDpsXmlFromEvent(requestEvent?.payload);
      return dpsXml ? Buffer.from(dpsXml, 'utf8') : null;
    }
    if (normalizedName.endsWith('.xml')) {
      const successEvent = await this.prisma.nfseEvent.findFirst({ where: { invoiceId, type: 'TRANSMIT_SUCCESS' }, orderBy: { createdAt: 'desc' } });
      const responseXml = this.extractNfseXmlFromEvent(successEvent?.payload);
      return responseXml ? Buffer.from(responseXml, 'utf8') : null;
    }
    if (mimeType.includes('json') || normalizedName.endsWith('.json')) {
      const event = await this.prisma.nfseEvent.findFirst({ where: { invoiceId, type: { in: ['TRANSMIT_REJECTED', 'TRANSMIT_SUCCESS'] } }, orderBy: { createdAt: 'desc' } });
      const body = this.extractResponseBodyFromEvent(event?.payload);
      return body ? Buffer.from(body, 'utf8') : null;
    }
    return null;
  }

  private writeStoredFile(invoiceId: string, fileName: string, content: Buffer) {
    const directory = join(this.storageRoot(), 'nfse', invoiceId);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, this.safeFileName(fileName));
    writeFileSync(path, content);
    return path;
  }

  private storageRoot() {
    return join(process.cwd(), 'storage');
  }

  private safeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'arquivo';
  }

  private extractDpsXmlFromEvent(payload: unknown) {
    if (!payload || typeof payload !== 'object') return null;
    const dps = (payload as Record<string, any>).dps;
    return typeof dps?.xml === 'string' ? dps.xml : null;
  }

  private extractNfseXmlFromEvent(payload: unknown) {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as Record<string, any>;
    return this.extractNfseXml(candidate.json) || this.extractNfseXml(candidate) || null;
  }

  private extractResponseBodyFromEvent(payload: unknown) {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as Record<string, any>;
    if (typeof candidate.body === 'string' && candidate.body.trim()) return candidate.body;
    if (candidate.json) return JSON.stringify(candidate.json, null, 2);
    return JSON.stringify(candidate, null, 2);
  }

  private async generateDanfsePdf(invoice: Awaited<ReturnType<NfseService['getCompanyInvoice']>>, settings: { environment: NfseEnvironment; municipalIbgeCode: string | null; taxRegime: string; specialTaxRegime: string | null; isSimpleNational: boolean; hasFiscalIncentive: boolean; defaultIssWithheld: boolean }) {
    const accessKey = invoice.accessKey || '';
    const qrUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${accessKey}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', margin: 0, width: 170 });
    const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');

    return new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `DANFSe ${accessKey}`, Author: 'ZIP NFS-e' } });
      const chunks: Buffer[] = [];
      document.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      const margin = 8.5;
      const pageWidth = 595.28;
      const contentWidth = pageWidth - margin * 2;
      const primary = '#1f4e79';
      const border = '#4a5568';
      const muted = '#4b5563';
      const emittedAt = invoice.issuedAt || invoice.updatedAt || invoice.createdAt;
      const environmentLabel = settings.environment === NfseEnvironment.PRODUCTION ? 'Produção' : 'Produção restrita';
      const legalWarning = settings.environment === NfseEnvironment.PRODUCTION ? '' : 'NFS-e SEM VALIDADE JURÍDICA';
      const companyCity = [invoice.company.city, invoice.company.state].filter(Boolean).join(' / ') || '-';
      const customerCity = [invoice.customer?.city, invoice.customer?.state].filter(Boolean).join(' / ') || '-';
      const amount = Number(invoice.amount || 0);
      const issRate = Number(invoice.issRate || invoice.service?.issRate || 0);
      const discounts = Number(invoice.discounts || 0);
      const deductions = Number(invoice.deductions || 0);
      const issValue = amount * (Number.isFinite(issRate) ? issRate : 0) / 100;

      document.font('Helvetica');
      document.lineWidth(0.6).strokeColor(border).fillColor('#111827');
      this.drawDanfseHeader(document, margin, margin, contentWidth, primary, companyCity, environmentLabel, legalWarning);

      let y = margin + 39;
      document.rect(margin, y, contentWidth, 112).stroke(border);
      this.danfseTitle(document, margin + 4, y + 4, 'DADOS DA NFS-e');
      this.danfseField(document, margin + 8, y + 18, 405, 'CHAVE DE ACESSO DA NFS-e', accessKey);
      this.danfseField(document, margin + 8, y + 47, 90, 'NÚMERO DA NFS-e', invoice.number || '-');
      this.danfseField(document, margin + 110, y + 47, 100, 'COMPETÊNCIA', this.formatPdfDate(invoice.competenceDate));
      this.danfseField(document, margin + 222, y + 47, 130, 'DATA E HORA DA EMISSÃO', this.formatPdfDateTime(emittedAt));
      this.danfseField(document, margin + 364, y + 47, 55, 'SÉRIE DPS', invoice.rpsSeries || invoice.series || '1');
      this.danfseField(document, margin + 8, y + 76, 130, 'NÚMERO DPS', invoice.rpsNumber || invoice.number || '-');
      this.danfseField(document, margin + 150, y + 76, 140, 'CÓDIGO DE VERIFICAÇÃO', invoice.verificationCode || '-');
      this.danfseField(document, margin + 302, y + 76, 62, 'STATUS', this.invoiceStatusLabelPdf(invoice.status));
      this.danfseField(document, margin + 376, y + 76, 44, 'AMBIENTE', environmentLabel);
      document.image(qrBuffer, margin + contentWidth - 86, y + 14, { width: 58, height: 58 });
      document.font('Helvetica').fontSize(5.8).fillColor(muted).text('A autenticidade desta NFS-e pode ser verificada pela leitura deste QR Code ou pela consulta da chave de acesso no portal nacional da NFS-e.', margin + contentWidth - 112, y + 76, { width: 104, align: 'center' });
      y += 118;

      y = this.drawDanfseBox(document, margin, y, contentWidth, 'PRESTADOR DO SERVIÇO', [
        ['Nome/Razão social', invoice.company.legalName],
        ['CPF/CNPJ', this.formatCpfCnpj(invoice.company.cnpj)],
        ['Inscrição municipal', invoice.company.municipalRegistration || '-'],
        ['Município/UF', companyCity],
        ['Endereço', this.joinAddress(invoice.company.address, invoice.company.number, invoice.company.neighborhood, invoice.company.zipCode)],
        ['E-mail', invoice.company.email || '-'],
      ]);

      y = this.drawDanfseBox(document, margin, y, contentWidth, 'TOMADOR DO SERVIÇO', [
        ['Nome/Razão social', invoice.customer?.name || '-'],
        ['CPF/CNPJ/Documento', this.formatCpfCnpj(invoice.customer?.document || '')],
        ['Inscrição municipal', invoice.customer?.municipalRegistration || '-'],
        ['Município/UF', customerCity],
        ['Endereço', this.joinAddress(invoice.customer?.address, invoice.customer?.number, invoice.customer?.neighborhood, invoice.customer?.zipCode)],
        ['E-mail', invoice.customer?.email || '-'],
      ]);

      y = this.drawDanfseBox(document, margin, y, contentWidth, 'SERVIÇO PRESTADO', [
        ['Código de tributação nacional', invoice.nationalTaxCode || invoice.service?.nationalTaxCode || '-'],
        ['Código de serviço municipal', invoice.municipalServiceCode || invoice.service?.municipalServiceCode || '-'],
        ['Município de incidência', invoice.municipalIbgeCode || settings.municipalIbgeCode || '-'],
        ['CNAE', invoice.service?.cnae || '-'],
        ['NBS', invoice.service?.nbsCode || '-'],
        ['Classificação IBS/CBS', [invoice.service?.ibsCbsTaxClassCode, invoice.service?.ibsCbsOperationCode].filter(Boolean).join(' / ') || '-'],
      ]);

      document.rect(margin, y, contentWidth, 74).stroke(border);
      this.danfseTitle(document, margin + 4, y + 4, 'DISCRIMINAÇÃO DO SERVIÇO');
      document.font('Helvetica').fontSize(7).fillColor('#111827').text(invoice.serviceDescription || '-', margin + 8, y + 18, { width: contentWidth - 16, height: 48, ellipsis: true });
      y += 80;

      const halfWidth = (contentWidth - 6) / 2;
      const taxStartY = y;
      const taxEndY = this.drawDanfseBox(document, margin, taxStartY, halfWidth, 'TRIBUTAÇÃO MUNICIPAL', [
        ['Regime tributário', settings.taxRegime || '-'],
        ['Regime especial', settings.specialTaxRegime || 'Nenhum'],
        ['Optante Simples Nacional', settings.isSimpleNational ? 'Sim' : 'Não'],
        ['Incentivo fiscal', settings.hasFiscalIncentive ? 'Sim' : 'Não'],
        ['Retenção ISS', invoice.issWithheld ? 'Sim' : 'Não'],
      ], 62);
      const valuesEndY = this.drawDanfseBox(document, margin + halfWidth + 6, taxStartY, halfWidth, 'VALORES DA NFS-e', [
        ['Valor do serviço', this.formatPdfCurrency(amount)],
        ['Alíquota ISS', `${this.formatPdfNumber(issRate)}%`],
        ['Valor ISS estimado', this.formatPdfCurrency(issValue)],
        ['Descontos/Deduções', this.formatPdfCurrency(discounts + deductions)],
        ['Valor líquido', this.formatPdfCurrency(amount - discounts - deductions)],
      ], 62);
      y = Math.max(taxEndY, valuesEndY);

      y += 6;
      document.rect(margin, y, contentWidth, 28).stroke(border);
      this.danfseTitle(document, margin + 4, y + 4, 'INFORMAÇÕES COMPLEMENTARES');
      document.font('Helvetica').fontSize(6.7).fillColor('#111827').text(invoice.additionalInformation || 'Documento auxiliar gerado conforme especificações do DANFSe v2.0. O XML autorizado permanece como documento fiscal eletrônico.', margin + 8, y + 16, { width: contentWidth - 16, height: 10, ellipsis: true });
      document.font('Helvetica').fontSize(5.8).fillColor(muted).text('DANFSe v2.0 - Documento Auxiliar da Nota Fiscal de Serviço eletrônica', margin, 824, { width: contentWidth, align: 'center' });
      document.end();
    });
  }

  private drawDanfseHeader(document: PDFKit.PDFDocument, x: number, y: number, width: number, primary: string, city: string, environment: string, warning: string) {
    document.rect(x, y, width, 34).stroke('#4a5568');
    document.font('Helvetica-Bold').fontSize(16).fillColor(primary).text('NFS-e', x + 10, y + 6, { width: 90 });
    document.font('Helvetica').fontSize(5.8).fillColor('#4b5563').text('Nota Fiscal de Serviço eletrônica', x + 10, y + 23, { width: 120 });
    document.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('DANFSe v2.0', x + 150, y + 7, { width: 270, align: 'center' });
    document.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Documento Auxiliar da NFS-e', x + 150, y + 18, { width: 270, align: 'center' });
    if (warning) document.font('Helvetica-Bold').fontSize(8).fillColor('#d00000').text(warning, x + 150, y + 28, { width: 270, align: 'center' });
    document.font('Helvetica').fontSize(7.5).fillColor('#111827').text(`Município: ${city}`, x + width - 145, y + 6, { width: 136, align: 'right' });
    document.font('Helvetica').fontSize(5.8).fillColor('#4b5563').text(`Ambiente gerador: Sistema Nacional NFS-e\nTipo de ambiente: ${environment}`, x + width - 145, y + 18, { width: 136, align: 'right' });
  }

  private drawDanfseBox(document: PDFKit.PDFDocument, x: number, y: number, width: number, title: string, fields: Array<[string, string]>, height = 62) {
    const columns = width < 330 ? 2 : 3;
    const columnWidth = (width - 16) / columns;
    const rowCount = Math.max(1, Math.ceil(fields.length / columns));
    const rowHeights = Array.from({ length: rowCount }, () => 22);

    fields.forEach(([label, value], index) => {
      const row = Math.floor(index / columns);
      rowHeights[row] = Math.max(rowHeights[row], this.danfseFieldHeight(document, columnWidth - 6, label, value));
    });

    const rowOffsets = rowHeights.reduce<number[]>((offsets, rowHeight, index) => {
      offsets[index] = index === 0 ? 0 : offsets[index - 1] + rowHeights[index - 1] + 6;
      return offsets;
    }, []);
    const computedHeight = Math.max(height, 28 + rowOffsets[rowOffsets.length - 1] + rowHeights[rowHeights.length - 1]);

    document.rect(x, y, width, computedHeight).stroke('#4a5568');
    this.danfseTitle(document, x + 4, y + 4, title);
    fields.forEach(([label, value], index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      this.danfseField(document, x + 8 + column * columnWidth, y + 18 + rowOffsets[row], columnWidth - 6, label, value);
    });
    return y + computedHeight + 6;
  }

  private danfseFieldHeight(document: PDFKit.PDFDocument, width: number, label: string, value: string) {
    document.font('Helvetica-Bold').fontSize(6);
    const labelHeight = document.heightOfString(label || '-', { width });
    document.font('Helvetica').fontSize(7);
    const valueHeight = document.heightOfString(value || '-', { width });
    return Math.max(22, labelHeight + valueHeight + 4);
  }

  private danfseTitle(document: PDFKit.PDFDocument, x: number, y: number, title: string) {
    document.font('Helvetica-Bold').fontSize(7).fillColor('#111827').text(title.toUpperCase(), x, y);
  }

  private danfseField(document: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string) {
    document.font('Helvetica-Bold').fontSize(6).fillColor('#374151').text(label, x, y, { width });
    document.font('Helvetica').fontSize(7).fillColor('#111827').text(value || '-', x, y + 8, { width, height: 14, ellipsis: true });
  }

  private formatPdfDate(value: Date | null | undefined) {
    if (!value) return '-';
    return value.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  private formatPdfDateTime(value: Date | null | undefined) {
    if (!value) return '-';
    return value.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  private formatPdfCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(value) ? value : 0);
  }

  private formatPdfNumber(value: number) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
  }

  private invoiceStatusLabelPdf(status: InvoiceStatus) {
    const labels: Record<InvoiceStatus, string> = {
      DRAFT: 'Rascunho',
      PROCESSING: 'Processando',
      AUTHORIZED: 'Autorizada',
      REJECTED: 'Rejeitada',
      CANCELLED: 'Cancelada',
    };
    return labels[status] || status;
  }

  private formatCpfCnpj(value: string) {
    const digits = this.onlyDigits(value || '');
    if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return value || '-';
  }

  private joinAddress(address?: string | null, number?: string | null, neighborhood?: string | null, zipCode?: string | null) {
    return [address, number, neighborhood, zipCode ? `CEP ${zipCode}` : ''].filter(Boolean).join(', ') || '-';
  }

  private async generateInvoicePdf(invoice: Awaited<ReturnType<NfseService['getCompanyInvoice']>>) {
    return new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      const amount = Number(invoice.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const issuedAt = invoice.issuedAt ? invoice.issuedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';

      document.fontSize(16).text('DANFSE - Documento Auxiliar da NFS-e', { align: 'center' });
      document.moveDown(0.6);
      document.fontSize(9).fillColor('#5f7487').text('Documento gerado pelo sistema ZIP NFS-e a partir dos dados autorizados e do XML retornado pela API nacional.', { align: 'center' });
      document.moveDown(1.2);

      this.writePdfLine(document, 'Número', invoice.number || '-');
      this.writePdfLine(document, 'Chave de acesso', invoice.accessKey || '-');
      this.writePdfLine(document, 'Status', invoice.status);
      this.writePdfLine(document, 'Emissão', issuedAt);
      document.moveDown();

      document.fontSize(12).fillColor('#003b5c').text('Prestador', { underline: true });
      document.moveDown(0.35);
      this.writePdfLine(document, 'Razão social', invoice.company.legalName);
      this.writePdfLine(document, 'CNPJ', invoice.company.cnpj);
      this.writePdfLine(document, 'Município/UF', [invoice.company.city, invoice.company.state].filter(Boolean).join('/') || '-');
      document.moveDown();

      document.fontSize(12).fillColor('#003b5c').text('Tomador', { underline: true });
      document.moveDown(0.35);
      this.writePdfLine(document, 'Nome', invoice.customer?.name || '-');
      this.writePdfLine(document, 'Documento', invoice.customer?.document || '-');
      this.writePdfLine(document, 'E-mail', invoice.customer?.email || '-');
      document.moveDown();

      document.fontSize(12).fillColor('#003b5c').text('Serviço', { underline: true });
      document.moveDown(0.35);
      this.writePdfLine(document, 'Código nacional', invoice.nationalTaxCode || invoice.service?.nationalTaxCode || '-');
      this.writePdfLine(document, 'Código municipal', invoice.municipalServiceCode || invoice.service?.municipalServiceCode || '-');
      this.writePdfLine(document, 'Município de incidência', invoice.municipalIbgeCode || '-');
      this.writePdfLine(document, 'Valor do serviço', `R$ ${amount}`);
      document.moveDown(0.5);
      document.fontSize(10).fillColor('#003b5c').text('Discriminação do serviço');
      document.moveDown(0.2);
      document.fontSize(10).fillColor('#243b53').text(invoice.serviceDescription || '-', { width: 500 });
      document.end();
    });
  }

  private writePdfLine(document: PDFKit.PDFDocument, label: string, value: string) {
    document.fontSize(10).fillColor('#003b5c').text(`${label}: `, { continued: true });
    document.fillColor('#243b53').text(value || '-');
  }

  private extractEventXml(payload: unknown) {
    if (!payload || typeof payload !== 'object') return null;
    const gzip = this.findStringValue(payload, ['eventoXmlGZipB64', 'EventoXmlGZipB64', 'xmlGZipB64']);
    const decoded = this.nationalApi.decodeGzipBase64(gzip);
    if (decoded) return decoded;
    const directXml = this.findStringValue(payload, ['eventoXml', 'EventoXml', 'xml', 'XML']);
    return directXml?.trim().startsWith('<') ? directXml.trim() : null;
  }
  private extractNfseXml(payload: unknown) {
    if (!payload || typeof payload !== 'object') return null;
    const gzip = this.findStringValue(payload, ['nfseXmlGZipB64', 'NfseXmlGZipB64', 'xmlGZipB64']);
    const decoded = this.nationalApi.decodeGzipBase64(gzip);
    if (decoded) return decoded;
    const directXml = this.findStringValue(payload, ['nfseXml', 'NfseXml', 'xml', 'XML']);
    return directXml?.trim().startsWith('<') ? directXml.trim() : null;
  }

  private extractNfseXmlFromText(text: string) {
    const trimmed = text?.trim();
    if (!trimmed?.startsWith('<')) return null;
    return trimmed;
  }

  private extractStatusFromNationalResponse(
    response: { body: string; json?: unknown },
    responseXml?: string | null,
    eventsResponse?: { body: string; json?: unknown } | null,
    eventsXml?: string | null,
  ): InvoiceStatus | null {
    const eventStatusCandidate = this.findStringValue(eventsResponse?.json, [
      'status',
      'situacao',
      'estado',
      'tipoEvento',
      'tpEvento',
      'codigoEvento',
      'descEvento',
      'xDescEvento',
    ]);
    const normalizedEventCandidate = this.normalizeNationalText(eventStatusCandidate || '');
    if (this.isCancelledStatusText(normalizedEventCandidate) || this.isCancellationEventText(normalizedEventCandidate)) return InvoiceStatus.CANCELLED;

    const eventText = this.normalizeNationalText([
      eventsResponse?.body || '',
      eventsXml || '',
      eventsResponse?.json ? JSON.stringify(eventsResponse.json) : '',
    ].join('\n'));
    if (this.isCancelledStatusText(eventText) || this.isCancellationEventText(eventText)) return InvoiceStatus.CANCELLED;

    const statusCandidate = this.findStringValue(response.json, [
      'status',
      'situacao',
      'sitNfse',
      'situacaoNfse',
      'situacaoNFSe',
      'estado',
      'cStat',
      'codigoStatus',
      'statusCode',
    ]);
    const normalizedCandidate = this.normalizeNationalText(statusCandidate || '');
    if (this.isCancelledStatusText(normalizedCandidate) || ['101', '135', '151', '155'].includes(normalizedCandidate)) return InvoiceStatus.CANCELLED;
    if (this.isAuthorizedStatusText(normalizedCandidate) || ['100', '200'].includes(normalizedCandidate)) return InvoiceStatus.AUTHORIZED;

    const text = this.normalizeNationalText([
      response.body,
      responseXml || '',
      response.json ? JSON.stringify(response.json) : '',
    ].join('\n'));
    if (this.isCancelledStatusText(text)) return InvoiceStatus.CANCELLED;
    if (this.isAuthorizedStatusText(text) || Boolean(responseXml) || Boolean(this.extractAccessKey(response.json)) || Boolean(this.extractAccessKeyFromText(response.body))) return InvoiceStatus.AUTHORIZED;
    return null;
  }

  private normalizeNationalText(value: string) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private isCancelledStatusText(value: string) {
    return /\bcancelad[ao]\b|\bcancelamento\b|\bnfse\s+cancelad[ao]\b|\bevento\s+de\s+cancelamento\b/.test(value);
  }

  private isCancellationEventText(value: string) {
    return /\be101101\b/.test(value) || /<(?:\w+:)?(?:tpevento|tpevt)\b[^>]*>\s*101101\s*</.test(value);
  }

  private isAuthorizedStatusText(value: string) {
    return /\bautorizad[ao]\b|\bnormal\b|\bemitid[ao]\b|\bnfse\s+autorizad[ao]\b/.test(value);
  }

  private nationalResponsePayload(response: { body: string; statusCode: number; json?: unknown }): Prisma.InputJsonValue {
    return response.json === undefined ? { body: response.body, statusCode: response.statusCode } : (response.json as Prisma.InputJsonValue);
  }

  private formatNationalApiError(response: { body: string; statusCode: number; json?: unknown }) {
    const payload = response.json;
    if (payload && typeof payload === 'object') {
      const candidate = payload as Record<string, any>;
      const errors = Array.isArray(candidate.erros) ? candidate.erros : candidate.erro ? [candidate.erro] : [];
      const message = errors
        .map((error) => [error?.codigo || error?.Codigo, error?.descricao || error?.Descricao, error?.complemento || error?.Complemento].filter(Boolean).join(' - '))
        .filter(Boolean)
        .join(' | ');
      if (message) return message.slice(0, 2000);
    }
    return (response.body || `Falha na API nacional de NFS-e. Status ${response.statusCode}.`).slice(0, 2000);
  }

  private extractNationalApiErrorCode(response: { body: string; json?: unknown }) {
    const payload = response.json;
    if (payload && typeof payload === 'object') {
      const candidate = payload as Record<string, any>;
      const errors = Array.isArray(candidate.erros) ? candidate.erros : candidate.erro ? [candidate.erro] : [];
      const code = errors.map((error) => error?.codigo || error?.Codigo).find(Boolean);
      if (code) return String(code);
    }
    return response.body.match(/\bE\d{4}\b/)?.[0] || null;
  }

  private extractDpsIdFromXml(xml: string) {
    return xml.match(/<infDPS\b[^>]*\bId="([^"]+)"/)?.[1] || null;
  }

  private extractAccessKey(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as Record<string, any>;
    return candidate.chaveAcesso || candidate.chave || candidate.accessKey || candidate.nfse?.chaveAcesso || null;
  }

  private extractAccessKeyFromText(text: string) {
    return text.match(/\b\d{30,60}\b/)?.[0] || null;
  }

  private extractInvoiceNumber(payload: unknown): string | null {
    return this.findStringValue(payload, ['numero', 'numeroNfse', 'nNFSe', 'nNfse', 'number']);
  }

  private extractInvoiceNumberFromText(text: string) {
    return this.extractTagValue(text, ['nNFSe', 'nNfse', 'numero', 'numeroNfse']);
  }

  private extractVerificationCode(payload: unknown): string | null {
    return this.findStringValue(payload, ['codigoVerificacao', 'codVerificacao', 'xCodVerif', 'verificationCode']);
  }

  private extractVerificationCodeFromText(text: string) {
    return this.extractTagValue(text, ['xCodVerif', 'codigoVerificacao', 'codVerificacao']);
  }

  private findStringValue(payload: unknown, keys: string[]): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    for (const value of Object.values(record)) {
      const nested = this.findStringValue(value, keys);
      if (nested) return nested;
    }
    return null;
  }

  private extractTagValue(text: string, tags: string[]) {
    for (const tag of tags) {
      const match = text.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]+)</(?:\\w+:)?${tag}>`, 'i'));
      if (match?.[1]?.trim()) return match[1].trim();
    }
    return null;
  }

  private certificateStatusLabel(status: CertificateStatus) {
    return ({
      VALID: 'Valido',
      EXPIRED: 'Vencido',
      INVALID: 'Invalido',
      PENDING: 'Pendente',
      REVOKED: 'Desvinculado',
    } as Record<CertificateStatus, string>)[status] || status;
  }

  private buildInvoiceDateRange(startDate?: string, endDate?: string): Prisma.DateTimeFilter {
    return {
      ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000-03:00`) } : {}),
      ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999-03:00`) } : {}),
    };
  }

  private buildInvoiceWhere(companyId: string, query: any): Prisma.NfseInvoiceWhereInput {
    const search = String(query.search || '').trim();
    const and: Prisma.NfseInvoiceWhereInput[] = [];
    if (query.startDate || query.endDate) {
      const dateRange = this.buildInvoiceDateRange(query.startDate, query.endDate);
      and.push({
        OR: [
          { issuedAt: dateRange },
          { AND: [{ issuedAt: null }, { createdAt: dateRange }] },
        ],
      });
    }
    if (search) {
      const amountFilters = this.searchAmountFilters(search);
      const searchFilters: Prisma.NfseInvoiceWhereInput[] = [
        { number: { contains: search, mode: 'insensitive' } },
        { accessKey: { contains: search, mode: 'insensitive' } },
        { serviceDescription: { contains: search, mode: 'insensitive' } },
        { errorMessage: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
      searchFilters.push(...amountFilters);
      and.push({
        OR: searchFilters,
      });
    }
    return {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  private buildCustomerWhere(companyId: string, term: string): Prisma.CustomerWhereInput {
    return {
      companyId,
      ...(term ? {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { document: { contains: term } },
          { email: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
          { state: { contains: term, mode: 'insensitive' } },
        ],
      } : {}),
    };
  }

  private sortDirection(query: any, fallback: Prisma.SortOrder = 'asc'): Prisma.SortOrder {
    const value = String(query?.sortDirection || '').toLowerCase();
    if (value === 'desc') return 'desc';
    if (value === 'asc') return 'asc';
    return fallback;
  }

  private buildCustomerOrderBy(query: any): Prisma.CustomerOrderByWithRelationInput[] {
    const direction = this.sortDirection(query);
    const map: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
      name: { name: direction },
      document: { document: direction },
      email: { email: direction },
      city: { city: direction },
      state: { state: direction },
      status: { isActive: direction },
      createdAt: { createdAt: direction },
      updatedAt: { updatedAt: direction },
    };
    const key = String(query.sortBy || 'name');
    return [map[key] || map.name, { name: 'asc' }];
  }

  private buildInvoiceOrderBy(query: any): Prisma.NfseInvoiceOrderByWithRelationInput[] {
    const direction = this.sortDirection(query, 'desc');
    const map: Record<string, Prisma.NfseInvoiceOrderByWithRelationInput> = {
      number: { number: direction },
      customer: { customer: { name: direction } },
      issuedAt: { issuedAt: direction },
      createdAt: { createdAt: direction },
      amount: { amount: direction },
      status: { status: direction },
      accessKey: { accessKey: direction },
    };
    const key = String(query.sortBy || 'createdAt');
    return [map[key] || map.createdAt, { createdAt: 'desc' }];
  }
  private searchAmountFilters(search: string): Prisma.NfseInvoiceWhereInput[] {
    const compact = search.trim().replace(/\s/g, '').replace(/^r\$/i, '');
    if (!compact || !/^[\d.,]+$/.test(compact)) return [];
    const normalized = this.normalizeDecimal(search);
    if (!normalized || !/^\d+(\.\d{1,2})?$/.test(normalized)) return [];

    const filters: Prisma.NfseInvoiceWhereInput[] = [{ amount: new Prisma.Decimal(normalized) }];
    const separatorIndex = this.monetarySearchSeparatorIndex(compact);
    const integerDigits = this.onlyDigits(separatorIndex >= 0 ? compact.slice(0, separatorIndex) : compact);
    const fractionDigits = separatorIndex >= 0 ? this.onlyDigits(compact.slice(separatorIndex + 1)).slice(0, 2) : '';
    const integerPart = integerDigits || '0';

    if (separatorIndex >= 0) {
      if (!fractionDigits) filters.push(this.amountRangeFilter(integerPart, String(Number(integerPart) + 1)));
      else if (fractionDigits.length === 1) {
        const start = Number(`${integerPart}.${fractionDigits}`);
        filters.push(this.amountRangeFilter(start.toFixed(1), (start + 0.1).toFixed(1)));
      }
      return filters;
    }

    const prefix = integerDigits.replace(/^0+(?=\d)/, '');
    if (!prefix) return filters;
    for (let digits = prefix.length; digits <= 12; digits += 1) {
      const zeros = digits - prefix.length;
      const scale = 10n ** BigInt(zeros);
      const start = BigInt(prefix) * scale;
      const end = (BigInt(prefix) + 1n) * scale;
      filters.push(this.amountRangeFilter(start.toString(), end.toString()));
    }
    return filters;
  }

  private monetarySearchSeparatorIndex(value: string) {
    const lastComma = value.lastIndexOf(',');
    const lastDot = value.lastIndexOf('.');
    let separatorIndex = Math.max(lastComma, lastDot);
    if (separatorIndex >= 0 && lastComma < 0 && lastDot >= 0) {
      const fractionCandidate = this.onlyDigits(value.slice(lastDot + 1));
      if (fractionCandidate.length > 2) separatorIndex = -1;
    }
    return separatorIndex;
  }

  private amountRangeFilter(start: string, end: string): Prisma.NfseInvoiceWhereInput {
    return { amount: { gte: new Prisma.Decimal(start), lt: new Prisma.Decimal(end) } };
  }

  private formatReportDecimal(value: { toString(): string } | number | string | null) {
    if (value === null || value === undefined) return '';
    return this.normalizeDecimal(value).replace('.', ',');
  }

  private formatReportDate(value: Date | null) {
    if (!value) return '';
    return value.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  private toCsv(rows: Array<Record<string, string | number | boolean | null | undefined>>) {
    if (!rows.length) return 'Sem dados';
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [headers.join(';'), ...rows.map((row) => headers.map((header) => escape(row[header])).join(';'))].join('\r\n');
  }

  private async getNextInvoiceNumber(companyId: string) {
    const invoices = await this.prisma.nfseInvoice.findMany({ where: { companyId }, select: { number: true, rpsNumber: true } });
    const highest = invoices.reduce((max, invoice) => {
      const values = [invoice.number, invoice.rpsNumber].map((value) => Number(String(value || '').replace(/\D/g, ''))).filter(Number.isFinite);
      return Math.max(max, ...values, 0);
    }, 0);
    return highest + 1;
  }

  private async ensureCompanyAccess(userId: string, accountRole: AccountRole, companyId: string, write = false, permission?: CompanyPermissionKey | CompanyPermissionKey[]) {
    if (accountRole === AccountRole.ADMIN) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
      if (!company) throw new NotFoundException('Empresa não encontrada.');
      return;
    }
    const link = await this.prisma.companyUser.findUnique({ where: { userId_companyId: { userId, companyId } }, select: { role: true, permissions: true, status: true, company: { select: { isActive: true } } } });
    if (!link || !link.company.isActive || link.status !== CompanyUserStatus.ACTIVE) throw new ForbiddenException('Acesso não autorizado à empresa.');
    if (permission) {
      const required = Array.isArray(permission) ? permission : [permission];
      if (!hasAnyCompanyPermission(link.role, link.permissions, required)) throw new ForbiddenException('Acesso não autorizado para esta funcionalidade.');
      return;
    }
    if (write && !hasAnyCompanyPermission(link.role, link.permissions, ['nfse.settings.edit', 'nfse.settings.delete', 'nfse.invoices.create', 'nfse.invoices.edit', 'nfse.invoices.delete', 'nfse.takers.create', 'nfse.takers.edit', 'nfse.takers.delete'])) throw new ForbiddenException('Perfil sem permissão de alteração.');
  }

  private async ensureCustomer(companyId: string, customerId: string, includeInactive = false) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId, ...(includeInactive ? {} : { isActive: true }) }, select: { id: true } });
    if (!customer) throw new NotFoundException('Tomador não encontrado.');
  }

  private async ensureService(companyId: string, serviceId: string, includeInactive = false) {
    const service = await this.prisma.nfseService.findFirst({ where: { id: serviceId, companyId, ...(includeInactive ? {} : { isActive: true }) }, select: { id: true } });
    if (!service) throw new NotFoundException('Serviço não encontrado.');
  }

  private async ensureUsableCertificate(certificate: { id: string; status: CertificateStatus; validUntil: Date | null; encryptedPath: string; encryptedPassword: string | null } | null, companyId: string) {
    if (!certificate) throw new BadRequestException('Vincule um certificado A1 valido antes de transmitir ou consultar a NFS-e.');
    if (!certificate.encryptedPath || !certificate.encryptedPassword) throw new BadRequestException('Certificado sem arquivo ou senha vinculada. Desvincule e envie o certificado novamente.');
    if (certificate.status === CertificateStatus.REVOKED || certificate.status === CertificateStatus.INVALID) throw new BadRequestException('Certificado invalido ou desvinculado. Envie um certificado A1 valido.');
    if (certificate.status === CertificateStatus.EXPIRED || (certificate.validUntil && certificate.validUntil < new Date())) {
      await this.prisma.digitalCertificate.updateMany({ where: { id: certificate.id, companyId }, data: { status: CertificateStatus.EXPIRED } });
      throw new BadRequestException('Certificado vencido. Desvincule o certificado atual e envie um certificado valido.');
    }
  }

  private clean<T extends Record<string, any>>(dto: T) {
    return Object.fromEntries(Object.entries(dto || {}).filter(([, value]) => value !== undefined && value !== ''));
  }

  private optionalString(value: any) {
    const text = String(value ?? '').trim();
    return text || null;
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
    const normalized = this.normalizeDecimal(value);
    if (!/^\d+(\.\d+)?$/.test(normalized)) throw new BadRequestException(message);
    return new Prisma.Decimal(normalized);
  }

  private normalizeDecimal(value: any) {
    const text = String(value ?? '').trim().replace(/\s/g, '').replace(/[^\d,.]/g, '');
    if (!text) return '';
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    let separatorIndex = Math.max(lastComma, lastDot);
    if (separatorIndex >= 0 && lastComma < 0 && lastDot >= 0) {
      const fractionCandidate = this.onlyDigits(text.slice(lastDot + 1));
      if (fractionCandidate.length > 2) separatorIndex = -1;
    }
    const integerDigits = this.onlyDigits(separatorIndex >= 0 ? text.slice(0, separatorIndex) : text);
    const fractionDigits = separatorIndex >= 0 ? this.onlyDigits(text.slice(separatorIndex + 1)).slice(0, 2) : '';
    return fractionDigits ? `${integerDigits || '0'}.${fractionDigits}` : integerDigits || '0';
  }

  private onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }

  private ensureValidCnpj(cnpj: string) {
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj) || !this.isValidCnpj(cnpj)) throw new BadRequestException('CNPJ invalido.');
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

  private toCustomerLookup(data: {
    cnpj: string;
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
    address?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    country?: string;
  }) {
    return {
      document: this.onlyDigits(data.cnpj),
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      municipalRegistration: '',
      stateRegistration: '',
      zipCode: this.onlyDigits(data.zipCode || ''),
      address: data.address || '',
      number: data.number || '',
      complement: data.complement || '',
      neighborhood: data.neighborhood || '',
      city: data.city || '',
      state: data.state || '',
      country: data.country || 'Brasil',
    };
  }

  private async lookupBrasilApi(cnpj: string) {
    try {
      const response = await this.fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (response.status === 404) throw new NotFoundException('CNPJ nao encontrado.');
      if (!response.ok) return null;
      const data = (await response.json()) as BrasilApiCnpjResponse;
      return this.toCustomerLookup({
        cnpj: data.cnpj || cnpj,
        name: data.razao_social || data.nome_fantasia || '',
        email: data.email || '',
        phone: data.ddd_telefone_1 || data.ddd_telefone_2 || '',
        zipCode: data.cep || '',
        address: data.logradouro || '',
        number: data.numero || '',
        complement: data.complemento || '',
        neighborhood: data.bairro || '',
        city: data.municipio || '',
        state: data.uf || '',
        country: data.pais || 'Brasil',
      });
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
        const message = data.message?.toLowerCase() || '';
        if (message.includes('nao encontrada') || message.includes('não encontrada')) throw new NotFoundException('CNPJ nao encontrado.');
        return null;
      }
      return this.toCustomerLookup({
        cnpj: data.cnpj || cnpj,
        name: data.nome || data.fantasia || '',
        email: data.email || '',
        phone: data.telefone || '',
        zipCode: data.cep || '',
        address: data.logradouro || '',
        number: data.numero || '',
        complement: data.complemento || '',
        neighborhood: data.bairro || '',
        city: data.municipio || '',
        state: data.uf || '',
        country: 'Brasil',
      });
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

  private requiredString(value: any, message: string) {
    const normalized = String(value || '').trim();
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }
}
