import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CompanyUserStatus, Prisma } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { CompanyPermissionKey, hasAnyCompanyPermission } from '../permissions/company-permissions';
import { AcessoriasApiService } from './acessorias-api.service';

type PlainRecord = Record<string, any>;
type AccountingArea = 'documents' | 'taxes' | 'requests' | 'processes';

type CompanyAccess = {
  id: string;
  cnpj: string;
  legalName: string;
};

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService, private readonly acessorias: AcessoriasApiService) {}

  async listDocuments(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.documents.view');
    await this.ensureSynced(company, 'documents', query);
    return this.listCached(company.id, 'documents', query);
  }

  async listTaxes(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.taxes.view');
    await this.ensureSynced(company, 'taxes', query);
    return this.listCached(company.id, 'taxes', query);
  }

  async listRequests(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.requests.view');
    await this.ensureSynced(company, 'requests', query);
    return this.listCached(company.id, 'requests', query);
  }

  async listProcesses(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.processes.view');
    await this.ensureSynced(company, 'processes', query);
    return this.listCached(company.id, 'processes', query);
  }

  async listDepartments(userId: string, accountRole: AccountRole, companyId: string) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.requests.view');
    const payload = await this.acessorias.getCompany(company.cnpj, { departments: true });
    const departments = this.asArray((payload as PlainRecord)?.Departamentos).map((department) => ({
      id: this.text(department.ID),
      name: this.text(department.Nome),
      responsibleName: this.text(department.RespNome),
      responsibleEmail: this.text(department.RespEmail),
    })).filter((department) => department.id && department.name);
    return { source: 'ACESSORIAS', items: departments };
  }

  async createRequest(userId: string, accountRole: AccountRole, companyId: string, dto: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.requests.edit');
    const subject = this.requiredString(dto.subject || dto.assunto, 'Assunto da solicitacao obrigatorio.').slice(0, 100);
    const departmentId = this.requiredString(dto.departmentId || dto.departamento, 'Departamento obrigatorio.');
    const description = this.requiredString(dto.description || dto.descricao, 'Descricao obrigatoria.');
    const priority = this.requiredString(dto.priority || dto.prioridade || '2', 'Prioridade obrigatoria.');
    const type = this.text(dto.type || dto.tipo || 'E') || 'E';
    const dueDate = this.isoDate(dto.dueDate || dto.data_prazo);

    const response = await this.acessorias.createRequest({
      assunto: subject,
      empresa: company.cnpj,
      departamento: departmentId,
      prioridade: priority,
      descricao: description,
      tipo: type,
      data_prazo: dueDate,
    });
    await this.syncArea(company, 'requests', { refresh: '1' }).catch(() => undefined);
    return response;
  }

  async downloadFile(userId: string, accountRole: AccountRole, companyId: string, fileId: string) {
    const file = await this.prisma.accountingFile.findFirst({
      where: { id: fileId, record: { companyId } },
      include: { record: true },
    });
    if (!file) throw new NotFoundException('Arquivo contabil nao encontrado.');
    await this.ensureCompanyAccess(userId, accountRole, companyId, this.permissionForArea(file.record.area));
    const path = this.existingStoredFilePath(file.path);
    if (!path) throw new NotFoundException('Arquivo contabil ainda nao esta disponivel localmente.');
    return {
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      contentBase64: readFileSync(path).toString('base64'),
    };
  }

  private async ensureSynced(company: CompanyAccess, area: AccountingArea, query: any) {
    if (query?.refresh === '1' || query?.refresh === 'true') return this.syncArea(company, area, query);
    const sync = await this.prisma.accountingSync.findUnique({ where: { companyId_provider_area: { companyId: company.id, provider: 'ACESSORIAS', area } } });
    if (!sync) await this.syncArea(company, area, query);
  }

  private async syncArea(company: CompanyAccess, area: AccountingArea, query: any) {
    try {
      const entries = await this.fetchArea(company, area, query);
      const records = await Promise.all(entries.map((entry) => this.upsertRecord(company.id, area, entry)));
      await this.prisma.accountingSync.upsert({
        where: { companyId_provider_area: { companyId: company.id, provider: 'ACESSORIAS', area } },
        update: { lastSyncedAt: new Date(), lastResultCount: records.length, lastError: null },
        create: { companyId: company.id, provider: 'ACESSORIAS', area, lastSyncedAt: new Date(), lastResultCount: records.length },
      });
      return records;
    } catch (error) {
      await this.prisma.accountingSync.upsert({
        where: { companyId_provider_area: { companyId: company.id, provider: 'ACESSORIAS', area } },
        update: { lastSyncedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 500) : 'Falha ao sincronizar Acessorias.' },
        create: { companyId: company.id, provider: 'ACESSORIAS', area, lastSyncedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 500) : 'Falha ao sincronizar Acessorias.' },
      });
      throw error;
    }
  }

  private async fetchArea(company: CompanyAccess, area: AccountingArea, query: any) {
    if (area === 'documents' || area === 'taxes') {
      const payload = await this.acessorias.listDeliveries(company.cnpj, {
        ...this.deliveryDateRange(query),
        Pagina: this.page(query),
        attachments: 'S',
        config: 'S',
        situation: query?.status,
        department_id: query?.departmentId,
      });
      return this.asArray(payload).flatMap((item) => this.asArray(item.Entregas).map((delivery) => (area === 'documents' ? this.deliveryToDocument(item, delivery) : this.deliveryToTax(item, delivery))));
    }
    if (area === 'requests') {
      const payload = await this.acessorias.listRequests({ Pagina: this.page(query), ...this.requestDateFilters(query) });
      return this.asArray(payload).filter((item) => this.sameDocument(item.EmpCNPJ, company.cnpj)).map((item) => this.requestToRecord(item));
    }
    const payload = await this.acessorias.listProcesses({ Pagina: this.page(query), ...this.processDateFilters(query) });
    return this.asArray(payload).filter((item) => this.sameDocument(item.EmpCNPJ, company.cnpj)).map((item) => this.processToRecord(item));
  }

  private async listCached(companyId: string, area: AccountingArea, query: any) {
    const sortBy = this.text(query?.sortBy) || this.defaultSortBy(area);
    const sortDirection = this.text(query?.sortDirection).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const records = await this.prisma.accountingRecord.findMany({
      where: { companyId, provider: 'ACESSORIAS', area },
      include: { files: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: this.accountingOrderBy(sortBy, sortDirection, area),
      take: 200,
    });
    return {
      source: 'ACESSORIAS',
      page: this.page(query),
      items: records.map((record) => ({
        ...((record.normalized || {}) as PlainRecord),
        id: record.externalId,
        cacheId: record.id,
        title: record.title,
        status: record.status,
        department: record.department,
        localFileId: record.files[0]?.id || '',
        localFileName: record.files[0]?.fileName || '',
        syncedAt: record.syncedAt,
      })),
    };
  }

  private async upsertRecord(companyId: string, area: AccountingArea, entry: PlainRecord) {
    const record = await this.prisma.accountingRecord.upsert({
      where: { companyId_provider_area_externalId: { companyId, provider: 'ACESSORIAS', area, externalId: entry.externalId } },
      update: {
        title: entry.title,
        description: entry.description || null,
        status: entry.status || null,
        department: entry.department || null,
        dueDate: this.dateOrNull(entry.dueDate),
        sentAt: this.dateOrNull(entry.sentAt),
        openedAt: this.dateOrNull(entry.openedAt),
        updatedExternalAt: this.dateOrNull(entry.updatedExternalAt),
        payload: entry.payload as Prisma.InputJsonValue,
        normalized: entry.normalized as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
      create: {
        companyId,
        provider: 'ACESSORIAS',
        area,
        externalId: entry.externalId,
        title: entry.title,
        description: entry.description || null,
        status: entry.status || null,
        department: entry.department || null,
        dueDate: this.dateOrNull(entry.dueDate),
        sentAt: this.dateOrNull(entry.sentAt),
        openedAt: this.dateOrNull(entry.openedAt),
        updatedExternalAt: this.dateOrNull(entry.updatedExternalAt),
        payload: entry.payload as Prisma.InputJsonValue,
        normalized: entry.normalized as Prisma.InputJsonValue,
      },
    });
    if (entry.attachmentUrl) {
      await this.storeAttachment(record.id, entry.externalId, entry.attachmentName || (entry.externalId + '.pdf'), entry.attachmentUrl).catch(() => undefined);
    }
    return record;
  }

  private async storeAttachment(recordId: string, externalId: string, fileName: string, sourceUrl: string) {
    const existing = await this.prisma.accountingFile.findFirst({ where: { recordId, sourceUrl } });
    if (existing && this.existingStoredFilePath(existing.path)) return existing;
    const downloaded = await this.acessorias.downloadFile(sourceUrl);
    const safeName = this.safeFileName(fileName || `${externalId}.pdf`);
    const path = this.writeStoredFile(recordId, safeName, downloaded.buffer);
    return this.prisma.accountingFile.create({
      data: {
        recordId,
        provider: 'ACESSORIAS',
        externalId,
        fileName: safeName,
        mimeType: downloaded.mimeType,
        path,
        sourceUrl,
        sizeBytes: downloaded.buffer.byteLength,
      },
    });
  }

  private deliveryToDocument(company: PlainRecord, delivery: PlainRecord) {
    const attachment = this.findAttachment(delivery);
    const normalized = {
      id: this.text(delivery.Config?.EntID || delivery.ID || delivery.Nome),
      description: this.text(delivery.Nome),
      dueDate: this.text(delivery.EntDtPrazo),
      delayDate: this.text(delivery.EntDtAtraso),
      sentAt: this.zeroDateToEmpty(delivery.EntDtEntrega),
      status: this.text(delivery.Status),
      department: this.text(delivery.Config?.DptoNome || delivery.DptoNome),
      responsible: this.text(delivery.Config?.RespEntrega || delivery.Config?.RespPrazo),
      companyName: this.text(company.Razao),
      fileName: attachment.name,
    };
    return this.recordEntry(normalized.id, normalized.description, normalized.status, normalized.department, normalized.dueDate, normalized.sentAt, '', this.text(delivery.EntLastDH), normalized, { company, delivery }, attachment);
  }

  private deliveryToTax(company: PlainRecord, delivery: PlainRecord) {
    const document = this.deliveryToDocument(company, delivery);
    const normalized = {
      ...(document.normalized as PlainRecord),
      competence: this.text(delivery.EntCompetencia),
      guideRead: this.text(delivery.EntGuiaLida),
      fine: this.text(delivery.EntMulta) === 'S',
    };
    return { ...document, normalized };
  }

  private requestToRecord(item: PlainRecord) {
    const normalized = {
      id: this.text(item.SolID),
      subject: this.text(item.SolAssunto),
      status: this.text(item.SolStatus),
      type: this.text(item.SolTipo),
      priority: this.text(item.SolPrioridade),
      openedAt: this.text(item.SolDHAbertura),
      dueDate: this.text(item.SolDTPrazo),
      updatedAt: this.text(item.SolDHUAt),
      department: this.text(item.DptoNome),
      companyName: this.text(item.EmpNome),
      officeResponsibles: this.asUnknownArray(item.SolOfficeResp).map((value) => this.text(value)).filter(Boolean),
      companyResponsibles: this.asUnknownArray(item.SolEmpResp).map((value) => this.text(value)).filter(Boolean),
    };
    return this.recordEntry(normalized.id, normalized.subject, normalized.status, normalized.department, normalized.dueDate, '', normalized.openedAt, normalized.updatedAt, normalized, item);
  }

  private processToRecord(item: PlainRecord) {
    const normalized = {
      id: this.text(item.ProcID),
      name: this.text(item.ProcTitulo || item.ProcNome),
      creator: this.text(item.ProcCriador),
      manager: this.text(item.ProcGestor),
      status: this.text(item.ProcStatus),
      percentage: this.text(item.ProcPorcentagem),
      startedAt: this.text(item.ProcInicio),
      completedAt: this.text(item.ProcConclusao),
      updatedAt: this.text(item.DtLastDH),
      department: this.text(item.ProcDepartamento),
      companyName: this.text(item.EmpNome),
    };
    return this.recordEntry(normalized.id, normalized.name, normalized.status, normalized.department, normalized.completedAt, '', normalized.startedAt, normalized.updatedAt, normalized, item);
  }

  private recordEntry(externalId: string, title: string, status: string, department: string, dueDate: string, sentAt: string, openedAt: string, updatedExternalAt: string, normalized: PlainRecord, payload: unknown, attachment?: { name: string; url: string }) {
    return {
      externalId: externalId || `${title}-${dueDate || openedAt || updatedExternalAt}`,
      title: title || '-',
      description: title || '',
      status,
      department,
      dueDate,
      sentAt,
      openedAt,
      updatedExternalAt,
      normalized,
      payload,
      attachmentName: attachment?.name || '',
      attachmentUrl: attachment?.url || '',
    };
  }

  private deliveryDateRange(query: any) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      DtInitial: this.isoDate(query?.startDate) || this.dateOnly(start),
      DtFinal: this.isoDate(query?.endDate) || this.dateOnly(now),
    };
  }

  private requestDateFilters(query: any) {
    return {
      SolAberturaIni: this.isoDate(query?.startDate),
      SolAberturaFim: this.isoDate(query?.endDate),
      SolStatus: query?.status,
    };
  }

  private processDateFilters(query: any) {
    return {
      ProcInicioIni: this.isoDate(query?.startDate),
      ProcInicioFim: this.isoDate(query?.endDate),
      ProcStatus: query?.status,
    };
  }

  private async ensureCompanyAccess(userId: string, accountRole: AccountRole, companyId: string, permission: CompanyPermissionKey): Promise<CompanyAccess> {
    if (accountRole === AccountRole.ADMIN) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, cnpj: true, legalName: true } });
      if (!company) throw new NotFoundException('Empresa nao encontrada.');
      return company;
    }
    const link = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { role: true, permissions: true, status: true, company: { select: { id: true, cnpj: true, legalName: true, isActive: true } } },
    });
    if (!link || !link.company.isActive || link.status !== CompanyUserStatus.ACTIVE) throw new ForbiddenException('Acesso nao autorizado a empresa.');
    if (!hasAnyCompanyPermission(link.role, link.permissions, [permission])) throw new ForbiddenException('Acesso nao autorizado para esta funcionalidade.');
    return link.company;
  }

  private permissionForArea(area: string): CompanyPermissionKey {
    const map: Record<string, CompanyPermissionKey> = {
      documents: 'accounting.documents.view',
      taxes: 'accounting.taxes.view',
      requests: 'accounting.requests.view',
      processes: 'accounting.processes.view',
    };
    return map[area] || 'accounting.documents.view';
  }

  private accountingOrderBy(sortBy: string, sortDirection: 'asc' | 'desc', area: AccountingArea): Prisma.AccountingRecordOrderByWithRelationInput[] {
    const map: Record<string, Prisma.AccountingRecordOrderByWithRelationInput> = {
      title: { title: sortDirection },
      description: { title: sortDirection },
      department: { department: sortDirection },
      status: { status: sortDirection },
      dueDate: { dueDate: sortDirection },
      sentAt: { sentAt: sortDirection },
      openedAt: { openedAt: sortDirection },
      updatedAt: { updatedExternalAt: sortDirection },
    };
    return [map[sortBy] || map[this.defaultSortBy(area)], { title: 'asc' }];
  }

  private defaultSortBy(area: AccountingArea) {
    if (area === 'requests') return 'openedAt';
    if (area === 'processes') return 'updatedAt';
    return 'dueDate';
  }

  private page(query: any) {
    const value = Number(query?.page || query?.Pagina || 1);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  }

  private asArray(value: unknown): PlainRecord[] {
    return Array.isArray(value) ? (value as PlainRecord[]) : [];
  }

  private asUnknownArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private text(value: unknown) {
    return value === undefined || value === null ? '' : String(value).trim();
  }

  private requiredString(value: unknown, message: string) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private sameDocument(left: unknown, right: string) {
    return this.onlyDigits(this.text(left)) === this.onlyDigits(right);
  }

  private onlyDigits(value: string) {
    return String(value || '').replace(/\D/g, '');
  }

  private isoDate(value: unknown) {
    const text = this.text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
  }

  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private dateOrNull(value: unknown) {
    const text = this.text(value);
    if (!text || text === '0000-00-00') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00.000Z`);
    const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (brDate) return new Date(`${brDate[3]}-${brDate[2]}-${brDate[1]}T${brDate[4] || '00'}:${brDate[5] || '00'}:${brDate[6] || '00'}.000Z`);
    return null;
  }

  private zeroDateToEmpty(value: unknown) {
    const text = this.text(value);
    return text === '0000-00-00' ? '' : text;
  }

  private findAttachment(payload: unknown): { name: string; url: string } {
    if (!payload || typeof payload !== 'object') return { name: '', url: '' };
    const record = payload as PlainRecord;
    const directUrl = this.text(record.Url || record.URL || record.Link || record.link || record.href);
    if (directUrl.startsWith('http')) return { name: this.text(record.Nome || record.name || record.fileName) || 'arquivo.pdf', url: directUrl };
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = this.findAttachment(item);
          if (found.url) return found;
        }
      } else if (value && typeof value === 'object') {
        const found = this.findAttachment(value);
        if (found.url) return found;
      }
    }
    return { name: '', url: '' };
  }

  private writeStoredFile(recordId: string, fileName: string, content: Buffer) {
    const directory = join(this.storageRoot(), 'accounting', recordId);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, this.safeFileName(fileName));
    writeFileSync(path, content);
    return path;
  }

  private existingStoredFilePath(storedPath: string) {
    const candidates = [
      storedPath,
      isAbsolute(storedPath) ? storedPath : join(process.cwd(), storedPath),
      isAbsolute(storedPath) ? storedPath : join(this.storageRoot(), storedPath),
    ];
    return candidates.find((candidate, index) => candidates.indexOf(candidate) === index && existsSync(candidate)) || null;
  }

  private storageRoot() {
    return join(process.cwd(), 'storage');
  }

  private safeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'arquivo';
  }
}
