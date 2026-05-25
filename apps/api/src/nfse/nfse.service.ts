import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CertificateStatus, CompanyUserStatus, InvoiceStatus, NfseEnvironment, Prisma, StorageKind, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
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

  async getHomologationChecklist(userId: string, accountRole: AccountRole, companyId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
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
    const suggestedBaseUrl = this.nationalApi.getDefaultBaseUrl(NfseEnvironment.PRODUCTION_RESTRICTED);
    const serviceIssues = [
      !defaultService?.nationalTaxCode ? 'codigo nacional' : '',
      !defaultService?.issRate ? 'aliquota ISS' : '',
    ].filter(Boolean);

    const items: HomologationCheckItem[] = [
      {
        id: 'environment',
        title: 'Ambiente de homologacao',
        status: settings.environment === NfseEnvironment.PRODUCTION_RESTRICTED && baseUrl.includes('producaorestrita') && !baseUrl.includes('/contribuintes') ? 'READY' : 'WARNING',
        severity: settings.environment === NfseEnvironment.PRODUCTION_RESTRICTED ? 'attention' : 'blocking',
        message: settings.environment === NfseEnvironment.PRODUCTION_RESTRICTED
          ? `Base configurada: ${baseUrl}`
          : 'A empresa esta marcada para producao. Para testes, use homologacao/producao restrita.',
        action: `Usar ${suggestedBaseUrl} nos testes de emissao.`,
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
        ? 'Resolver os itens obrigatorios antes de transmitir uma NFS-e em homologacao.'
        : 'Conferir os codigos de servico e aliquotas; depois cadastrar uma NFS-e simples para transmitir em homologacao.',
      items,
    };
  }

  async listServices(userId: string, accountRole: AccountRole, companyId: string, status = 'active') {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    const isActive = status === 'inactive' ? false : status === 'all' ? undefined : true;
    return this.prisma.nfseService.findMany({
      where: { companyId, ...(isActive === undefined ? {} : { isActive }) },
      include: { _count: { select: { invoices: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
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
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
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
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    await this.ensureService(companyId, serviceId);
    return this.prisma.nfseService.update({ where: { id: serviceId }, data: { isActive: false } });
  }

  async removeService(userId: string, accountRole: AccountRole, companyId: string, serviceId: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    await this.ensureService(companyId, serviceId, true);
    const linkedInvoices = await this.prisma.nfseInvoice.count({ where: { companyId, serviceId } });
    if (linkedInvoices > 0) {
      throw new BadRequestException('Servico ja utilizado em nota fiscal. Para preservar o historico, ele pode apenas ser inativado.');
    }
    return this.prisma.nfseService.delete({ where: { id: serviceId } });
  }

  async listCustomers(userId: string, accountRole: AccountRole, companyId: string, search = '') {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    const term = search.trim();
    return this.prisma.customer.findMany({
      where: { companyId, ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { document: { contains: term } }, { email: { contains: term, mode: 'insensitive' } }] } : {}) },
      include: { _count: { select: { invoices: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async lookupCustomerCnpj(userId: string, accountRole: AccountRole, companyId: string, cnpjInput: string) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    const cnpj = this.onlyDigits(cnpjInput || '');
    this.ensureValidCnpj(cnpj);

    const brasilApiData = await this.lookupBrasilApi(cnpj);
    if (brasilApiData) return brasilApiData;

    const receitaWsData = await this.lookupReceitaWs(cnpj);
    if (receitaWsData) return receitaWsData;

    throw new BadRequestException('Nao foi possivel consultar o CNPJ agora. Tente novamente.');
  }

  async createCustomer(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
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
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
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
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    await this.ensureCustomer(companyId, customerId, true);
    const linkedInvoices = await this.prisma.nfseInvoice.count({ where: { companyId, customerId } });
    if (linkedInvoices > 0) {
      throw new BadRequestException('Tomador ja utilizado em nota fiscal. Para preservar o historico, ele pode apenas ser inativado.');
    }
    return this.prisma.customer.delete({ where: { id: customerId } });
  }

  async listInvoices(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId);
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 20), 1), 100);
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
      and.push({
        OR: [
          { number: { contains: search, mode: 'insensitive' } },
          { accessKey: { contains: search, mode: 'insensitive' } },
          { serviceDescription: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    const where: Prisma.NfseInvoiceWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(and.length ? { AND: and } : {}),
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
    const settings = await this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
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
        requestPayload: dto,
      },
      include: { customer: true, service: true },
    });
  }

  async updateInvoice(userId: string, accountRole: AccountRole, companyId: string, invoiceId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    const invoice = await this.getCompanyInvoice(companyId, invoiceId);
    if (!this.isLocalEditableInvoice(invoice)) {
      throw new BadRequestException('Apenas NFS-e local em rascunho ou rejeitada, sem chave de acesso, pode ser editada.');
    }
    if (dto.customerId) await this.ensureCustomer(companyId, dto.customerId);
    if (dto.serviceId) await this.ensureService(companyId, dto.serviceId);

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
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
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
    await this.ensureCompanyAccess(userId, accountRole, companyId, true);
    const invoice = await this.getCompanyInvoice(companyId, invoiceId);
    if (!this.isLocalEditableInvoice(invoice)) {
      throw new BadRequestException('Somente NFS-e local em rascunho ou rejeitada, sem chave de acesso, pode ser transmitida.');
    }
    const settings = await this.prisma.nfseSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
    this.validateInvoiceForTransmission(invoice);
    const certificate = settings.certificateId ? await this.prisma.digitalCertificate.findFirst({ where: { id: settings.certificateId, companyId } }) : null;
    await this.ensureUsableCertificate(certificate, companyId);

    await this.prisma.nfseInvoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.PROCESSING } });

    try {
      const dpsXml = this.nationalApi.generateDpsXml(settings, invoice);
      const response = await this.nationalApi.transmitDps(settings, invoice, certificate?.encryptedPath, certificate?.encryptedPassword || undefined);
      const success = response.statusCode >= 200 && response.statusCode < 300;
      const accessKey = this.extractAccessKey(response.json) || this.extractAccessKeyFromText(response.body) || invoice.accessKey;
      const number = success ? this.extractInvoiceNumber(response.json) || this.extractInvoiceNumberFromText(response.body) || invoice.number : invoice.number;
      const verificationCode = success ? this.extractVerificationCode(response.json) || this.extractVerificationCodeFromText(response.body) || invoice.verificationCode : invoice.verificationCode;
      const updated = await this.prisma.nfseInvoice.update({
        where: { id: invoiceId },
        data: {
          status: success ? InvoiceStatus.AUTHORIZED : InvoiceStatus.REJECTED,
          accessKey,
          number,
          verificationCode,
          responsePayload: response.json === undefined ? { body: response.body, statusCode: response.statusCode } : (response.json as Prisma.InputJsonValue),
          errorMessage: success ? null : response.body.slice(0, 2000),
          issuedAt: success ? new Date() : invoice.issuedAt,
        },
        include: { customer: true, service: true },
      });
      await this.recordEvent(invoiceId, success ? 'TRANSMIT_SUCCESS' : 'TRANSMIT_REJECTED', response);
      await this.storeXml(invoiceId, 'dps-envio.xml', dpsXml);
      if (response.body) await this.storeXml(invoiceId, success ? 'nfse-retorno.xml' : 'nfse-rejeicao.xml', response.body);
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
    await this.ensureUsableCertificate(certificate, companyId);
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
      const match = text.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
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

  private async getNextInvoiceNumber(companyId: string) {
    const invoices = await this.prisma.nfseInvoice.findMany({ where: { companyId }, select: { number: true, rpsNumber: true } });
    const highest = invoices.reduce((max, invoice) => {
      const values = [invoice.number, invoice.rpsNumber].map((value) => Number(String(value || '').replace(/\D/g, ''))).filter(Number.isFinite);
      return Math.max(max, ...values, 0);
    }, 0);
    return highest + 1;
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
    const normalized = String(value).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(normalized)) throw new BadRequestException(message);
    return new Prisma.Decimal(normalized);
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
