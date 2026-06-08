import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AccountRole, CompanyUserStatus, Prisma } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { CompanyPermissionKey, hasAnyCompanyPermission } from '../permissions/company-permissions';
import { AcessoriasApiService } from './acessorias-api.service';

type PlainRecord = Record<string, any>;
type AccountingArea = 'documents' | 'taxes' | 'requests' | 'processes';

type NormalizedAccountingAttachment = { fileName: string; mimeType: string; buffer: Buffer; sizeBytes: number };

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

  async getRecordDetail(userId: string, accountRole: AccountRole, companyId: string, area: string, recordId: string) {
    const accountingArea = this.normalizeArea(area);
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, this.permissionForArea(accountingArea));
    const record = await this.prisma.accountingRecord.findFirst({
      where: {
        companyId: company.id,
        provider: 'ACESSORIAS',
        area: accountingArea,
        OR: [{ id: recordId }, { externalId: recordId }],
      },
      include: { files: { orderBy: { createdAt: 'asc' } } },
    });
    if (!record) throw new NotFoundException('Registro contabil nao encontrado.');

    const normalized = this.jsonObject(record.normalized);
    const payload = this.jsonObject(record.payload);
    const files = record.files.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      direction: file.direction,
      sizeBytes: file.sizeBytes || 0,
      downloadedAt: this.isoDateTime(file.downloadedAt),
    }));

    return {
      source: 'ACESSORIAS',
      area: accountingArea,
      id: record.externalId,
      cacheId: record.id,
      title: record.title,
      description: record.description || '',
      status: record.status || '',
      department: record.department || '',
      dueDate: this.isoDateTime(record.dueDate),
      sentAt: this.isoDateTime(record.sentAt),
      openedAt: this.isoDateTime(record.openedAt),
      updatedAt: this.isoDateTime(record.updatedExternalAt),
      syncedAt: this.isoDateTime(record.syncedAt),
      item: normalized,
      history: this.extractDetailHistory(payload, normalized, record, files),
      steps: this.extractDetailSteps(payload, normalized, record),
      files,
    };
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
    const attachments = this.normalizeRequestAttachments(dto.attachments);

    const response = await this.acessorias.createRequest({
      assunto: subject,
      empresa: company.cnpj,
      departamento: departmentId,
      prioridade: priority,
      descricao: description,
      tipo: type,
      data_prazo: dueDate,
    }, attachments);
    const externalId = this.extractRequestExternalId(response);
    await this.syncArea(company, 'requests', { refresh: '1' }).catch(() => undefined);
    const syncedRecord = externalId ? await this.prisma.accountingRecord.findUnique({ where: { companyId_provider_area_externalId: { companyId: company.id, provider: 'ACESSORIAS', area: 'requests', externalId } } }) : null;
    const record = syncedRecord || await this.upsertCreatedRequestFallback(company.id, { externalId, subject, departmentId, description, priority, dueDate, response });
    await Promise.all(attachments.map((attachment) => this.storeOutboundAttachment(company.id, record.id, record.externalId, attachment)));
    return { response, id: record.externalId, attachmentsStored: attachments.length };
  }

  private async upsertCreatedRequestFallback(companyId: string, input: { externalId: string; subject: string; departmentId: string; description: string; priority: string; dueDate?: string; response: unknown }) {
    const now = new Date().toISOString();
    const externalId = input.externalId || `local-${randomUUID()}`;
    const status = this.findStringValue(input.response, ['SolStatus', 'status', 'Status', 'situacao', 'Situacao']) || 'Cliente';
    const department = this.findStringValue(input.response, ['DptoNome', 'departamento', 'department', 'Departamento']) || input.departmentId;
    const openedAt = this.findStringValue(input.response, ['SolDHAbertura', 'createdAt', 'abertura', 'Abertura']) || now;
    const updatedAt = this.findStringValue(input.response, ['SolDHUAt', 'updatedAt', 'Atualizacao']) || now;
    const normalized = {
      id: externalId,
      subject: input.subject,
      status,
      type: 'E',
      priority: input.priority,
      openedAt,
      dueDate: input.dueDate || '',
      updatedAt,
      department,
    };
    return this.upsertRecord(companyId, 'requests', this.recordEntry(externalId, input.subject, status, department, input.dueDate || '', '', openedAt, updatedAt, normalized, input.response));
  }

  async downloadFile(userId: string, accountRole: AccountRole, companyId: string, fileId: string) {
    const file = await this.prisma.accountingFile.findFirst({
      where: { id: fileId, OR: [{ record: { companyId } }, { companyId }] },
      include: { record: true },
    });
    if (!file) throw new NotFoundException('Arquivo contabil nao encontrado.');
    await this.ensureCompanyAccess(userId, accountRole, companyId, this.permissionForArea(file.record?.area || file.area || 'requests'));
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
      await this.pruneStaleRecords(company.id, area, entries);
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
      return this.deliveryContainers(payload).flatMap((item) => this.asArray(item.Entregas).filter((delivery) => this.deliveryBelongsToArea(area, delivery)).map((delivery) => (area === 'documents' ? this.deliveryToDocument(item, delivery) : this.deliveryToTax(item, delivery))));
    }
    if (area === 'requests') {
      const payload = await this.fetchPagedAcessorias((params) => this.acessorias.listRequests(params), this.requestDateFilters(query));
      return payload.filter((item) => this.sameDocument(item.EmpCNPJ, company.cnpj)).map((item) => this.requestToRecord(item));
    }
    const payload = await this.fetchPagedAcessorias((params) => this.acessorias.listProcesses(params), this.processDateFilters(query));
    return payload.filter((item) => this.sameDocument(item.EmpCNPJ, company.cnpj)).map((item) => this.processToRecord(item));
  }
  private async fetchPagedAcessorias(fetchPage: (query: Record<string, string | number | boolean | undefined | null>) => Promise<unknown[]>, query: Record<string, string | number | boolean | undefined | null>) {
    const maxPages = 25;
    const records: PlainRecord[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const items = this.asArray(await fetchPage({ ...query, Pagina: page }));
      records.push(...items);
      if (items.length < 20) break;
    }
    return records;
  }
  private async listCached(companyId: string, area: AccountingArea, query: any) {
    const sortBy = this.text(query?.sortBy) || this.defaultSortBy(area);
    const sortDirection = this.text(query?.sortDirection).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const records = await this.prisma.accountingRecord.findMany({
      where: { companyId, provider: 'ACESSORIAS', area },
      include: { files: { orderBy: { createdAt: 'desc' }, take: 3 } },
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
        localFiles: record.files.map((file) => ({ id: file.id, fileName: file.fileName, direction: file.direction, mimeType: file.mimeType })),
        localFileCount: record.files.length,
        syncedAt: record.syncedAt,
      })),
    };
  }

  private normalizeArea(area: string): AccountingArea {
    const value = this.text(area).toLowerCase();
    if (value === 'documents' || value === 'taxes' || value === 'requests' || value === 'processes') return value;
    throw new BadRequestException('Area contabil invalida.');
  }

  private jsonObject(value: unknown): PlainRecord {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as PlainRecord : {};
  }

  private isoDateTime(value: unknown) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString();
    return this.text(value);
  }

  private extractDetailHistory(payload: PlainRecord, normalized: PlainRecord, record: { title: string; status: string | null; department: string | null; openedAt: Date | null; updatedExternalAt: Date | null }, files: Array<{ id: string; fileName: string; direction: string }>) {
    const candidates: PlainRecord[] = [];
    this.collectAccountingObjects(payload, candidates, 0, /hist|mens|msg|intera|atend|respost|coment|timeline|andament|sol/i);
    const events = candidates
      .map((item, index) => this.normalizeHistoryObject(item, index))
      .filter((item): item is { id: string; title: string; text: string; author: string; date: string; status: string; kind: string } => Boolean(item));

    const deduped = this.dedupeDetailItems(events);
    if (deduped.length) return deduped.sort((a, b) => this.sortableDate(a.date) - this.sortableDate(b.date));

    const fallback = [
      {
        id: 'opened',
        title: 'Abertura',
        text: this.text(normalized.subject || normalized.name || normalized.description || record.title),
        author: this.text(normalized.creator || normalized.manager || normalized.companyName),
        date: this.isoDateTime(record.openedAt),
        status: this.text(record.status),
        kind: 'message',
      },
      {
        id: 'current-status',
        title: 'Status atual',
        text: this.text(record.department) ? `Departamento: ${this.text(record.department)}` : '',
        author: '',
        date: this.isoDateTime(record.updatedExternalAt),
        status: this.text(record.status),
        kind: 'status',
      },
    ].filter((item) => item.text || item.status || item.date);

    if (files.length) {
      fallback.push({
        id: 'files',
        title: 'Arquivos vinculados',
        text: files.map((file) => `${file.direction === 'OUTBOUND' ? 'Enviado' : 'Recebido'}: ${file.fileName}`).join('; '),
        author: '',
        date: '',
        status: '',
        kind: 'file',
      });
    }
    return fallback;
  }

  private extractDetailSteps(payload: PlainRecord, normalized: PlainRecord, record: { title: string; status: string | null; openedAt: Date | null; updatedExternalAt: Date | null }) {
    const candidates: PlainRecord[] = [];
    this.collectAccountingObjects(payload, candidates, 0, /etap|fase|passo|andament|check|progres|task|proc/i);
    const steps = candidates
      .map((item, index) => this.normalizeStepObject(item, index))
      .filter((item): item is { id: string; title: string; status: string; date: string; responsible: string; percentage: string } => Boolean(item));
    const deduped = this.dedupeDetailItems(steps);
    if (deduped.length) return deduped;

    const percentage = this.normalizePercentage(normalized.percentage || normalized.progress || normalized.ProcPorcentagem);
    if (!percentage && !record.status) return [];
    return [{
      id: 'current-step',
      title: this.text(normalized.name || record.title || 'Processo'),
      status: this.text(record.status),
      date: this.isoDateTime(record.updatedExternalAt || record.openedAt),
      responsible: this.text(normalized.manager || normalized.creator),
      percentage,
    }];
  }

  private collectAccountingObjects(value: unknown, output: PlainRecord[], depth: number, pathPattern: RegExp, path = '') {
    if (depth > 6 || output.length > 120 || !value) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const nextPath = `${path}.${index}`;
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const record = item as PlainRecord;
          if (pathPattern.test(path) || this.hasDetailFields(record)) output.push(record);
          this.collectAccountingObjects(record, output, depth + 1, pathPattern, nextPath);
        }
      });
      return;
    }
    if (typeof value !== 'object') return;
    Object.entries(value as PlainRecord).forEach(([key, entry]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (Array.isArray(entry) || (entry && typeof entry === 'object')) this.collectAccountingObjects(entry, output, depth + 1, pathPattern, nextPath);
    });
  }

  private hasDetailFields(record: PlainRecord) {
    const keys = Object.keys(record).join(' ').toLowerCase();
    return /(hist|mens|msg|texto|descricao|descri|observa|resposta|coment|status|etapa|fase|andament|arquivo|anexo|data|dt|dh)/.test(keys);
  }

  private normalizeHistoryObject(record: PlainRecord, index: number) {
    const title = this.firstMatchingField(record, [/assunto/i, /titulo/i, /t[íi]tulo/i, /^tipo$/i, /evento/i, /status/i]);
    const text = this.firstMatchingField(record, [/mensagem/i, /message/i, /^msg$/i, /texto/i, /descri/i, /observa/i, /resposta/i, /coment/i, /histor/i, /solicit/i, /detalhe/i]);
    const author = this.firstMatchingField(record, [/autor/i, /usuario/i, /usu/i, /analista/i, /atendente/i, /responsavel/i, /respons[áa]vel/i, /respnome/i, /nomeusuario/i]);
    const date = this.firstMatchingField(record, [/datahora/i, /dh/i, /^dt/i, /data/i, /created/i, /updated/i, /abertura/i, /last/i]);
    const status = this.firstMatchingField(record, [/status/i, /situacao/i, /situa[çc][ãa]o/i, /etapa/i]);
    if (!title && !text && !status && !date) return null;
    const kind = /arquivo|anexo/i.test(`${title} ${text}`) ? 'file' : /status|etapa|fase/i.test(`${title} ${status}`) ? 'status' : 'message';
    return { id: `history-${index}`, title: title || status || 'Atualizacao', text: text === title ? '' : text, author, date, status, kind };
  }

  private normalizeStepObject(record: PlainRecord, index: number) {
    const title = this.firstMatchingField(record, [/etapa/i, /fase/i, /passo/i, /titulo/i, /t[íi]tulo/i, /nome/i, /descri/i, /task/i, /atividade/i]);
    const status = this.firstMatchingField(record, [/status/i, /situacao/i, /situa[çc][ãa]o/i, /conclu/i]);
    const date = this.firstMatchingField(record, [/conclus/i, /fim/i, /inicio/i, /in[íi]cio/i, /data/i, /^dt/i, /dh/i, /updated/i]);
    const responsible = this.firstMatchingField(record, [/respons/i, /gestor/i, /usuario/i, /analista/i, /atendente/i]);
    const percentage = this.normalizePercentage(this.firstMatchingField(record, [/percent/i, /porcent/i, /progres/i]));
    if (!title && !status && !percentage) return null;
    return { id: `step-${index}`, title: title || 'Etapa', status, date, responsible, percentage };
  }

  private firstMatchingField(record: PlainRecord, patterns: RegExp[]) {
    for (const [key, value] of Object.entries(record)) {
      if (!patterns.some((pattern) => pattern.test(key))) continue;
      const text = this.text(value);
      if (text && text !== '[object Object]') return text;
    }
    return '';
  }

  private normalizePercentage(value: unknown) {
    const text = this.text(value);
    const match = text.match(/\d+(?:[,.]\d+)?/);
    if (!match) return '';
    const number = Math.max(0, Math.min(100, Number(match[0].replace(',', '.'))));
    if (!Number.isFinite(number)) return '';
    return `${number.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  }

  private dedupeDetailItems<T extends { title: string; text?: string; status?: string; date?: string }>(items: T[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.title}|${item.text || ''}|${item.status || ''}|${item.date || ''}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private sortableDate(value: string) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
  }
  private async pruneStaleRecords(companyId: string, area: AccountingArea, entries: PlainRecord[]) {
    const currentExternalIds = Array.from(new Set(entries.map((entry) => this.text(entry.externalId)).filter(Boolean)));
    const protectedSince = new Date(Date.now() - 60 * 60 * 1000);
    const staleRecords = await this.prisma.accountingRecord.findMany({
      where: {
        companyId,
        provider: 'ACESSORIAS',
        area,
        externalId: {
          ...(currentExternalIds.length ? { notIn: currentExternalIds } : {}),
          not: { startsWith: 'local-' },
        },
        createdAt: { lt: protectedSince },
      },
      select: { id: true },
    });
    const staleIds = staleRecords.map((record) => record.id);
    if (!staleIds.length) return;
    await this.prisma.accountingFile.updateMany({ where: { recordId: { in: staleIds } }, data: { recordId: null } });
    await this.prisma.accountingRecord.deleteMany({ where: { id: { in: staleIds } } });
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
    const attachments = Array.isArray(entry.attachments) ? entry.attachments : entry.attachmentUrl ? [{ name: entry.attachmentName || (entry.externalId + '.pdf'), url: entry.attachmentUrl }] : [];
    for (const attachment of attachments) {
      await this.storeAttachment(companyId, area, record.id, entry.externalId, attachment.name || (entry.externalId + '.pdf'), attachment.url).catch(() => undefined);
    }
    await this.prisma.accountingFile.updateMany({ where: { companyId, area, provider: 'ACESSORIAS', externalId: entry.externalId, recordId: null }, data: { recordId: record.id } });
    return record;
  }

  private async storeAttachment(companyId: string, area: AccountingArea, recordId: string, externalId: string, fileName: string, sourceUrl: string) {
    if (!sourceUrl) return null;
    const existing = await this.prisma.accountingFile.findFirst({ where: { recordId, sourceUrl } });
    if (existing && this.existingStoredFilePath(existing.path)) return existing;
    const downloaded = await this.acessorias.downloadFile(sourceUrl);
    const safeName = this.safeFileName(fileName || `${externalId}.pdf`);
    const path = this.writeStoredFile(recordId, safeName, downloaded.buffer);
    return this.prisma.accountingFile.create({
      data: {
        recordId,
        companyId,
        provider: 'ACESSORIAS',
        area,
        direction: 'INBOUND',
        externalId,
        fileName: safeName,
        mimeType: downloaded.mimeType,
        path,
        sourceUrl,
        sizeBytes: downloaded.buffer.byteLength,
      },
    });
  }

  private deliveryBelongsToArea(area: AccountingArea, delivery: PlainRecord) {
    const isTax = this.isTaxDelivery(delivery);
    if (area === 'taxes') return isTax;
    if (area === 'documents') return !isTax;
    return true;
  }

  private isTaxDelivery(delivery: PlainRecord) {
    const type = this.text(delivery.Config?.Tipo).toUpperCase();
    if (type === 'O') return true;
    const name = this.text(delivery.Nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    return /\b(PGDAS|DCTF|DCTFWEB|DARF|GPS|FGTS|INSS|ISS|ICMS|IRRF|PIS|COFINS|CSLL|REINF|GUIA|IMPOSTO|TRIBUTO)\b/.test(name);
  }
  private deliveryContainers(payload: unknown): PlainRecord[] {
    if (Array.isArray(payload)) return payload as PlainRecord[];
    if (payload && typeof payload === 'object') {
      const record = payload as PlainRecord;
      if (Array.isArray(record.Entregas)) return [record];
      for (const value of Object.values(record)) {
        if (Array.isArray(value) && value.some((item) => item && typeof item === 'object' && Array.isArray((item as PlainRecord).Entregas))) {
          return value as PlainRecord[];
        }
      }
    }
    return [];
  }
  private deliveryToDocument(company: PlainRecord, delivery: PlainRecord) {
    const attachments = this.findAttachments(delivery);
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
      fileName: attachments[0]?.name || '',
    };
    return this.recordEntry(normalized.id, normalized.description, normalized.status, normalized.department, normalized.dueDate, normalized.sentAt, '', this.text(delivery.EntLastDH), normalized, { company, delivery }, attachments);
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
    return this.recordEntry(normalized.id, normalized.subject, normalized.status, normalized.department, normalized.dueDate, '', normalized.openedAt, normalized.updatedAt, normalized, item, this.findAttachments(item));
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
    return this.recordEntry(normalized.id, normalized.name, normalized.status, normalized.department, normalized.completedAt, '', normalized.startedAt, normalized.updatedAt, normalized, item, this.findAttachments(item));
  }

  private recordEntry(externalId: string, title: string, status: string, department: string, dueDate: string, sentAt: string, openedAt: string, updatedExternalAt: string, normalized: PlainRecord, payload: unknown, attachments: Array<{ name: string; url: string }> = []) {
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
      attachmentName: attachments[0]?.name || '',
      attachmentUrl: attachments[0]?.url || '',
      attachments,
    };
  }

  private deliveryDateRange(query: any) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      DtInitial: this.isoDate(query?.startDate) || this.dateOnly(start),
      DtFinal: this.isoDate(query?.endDate) || this.dateOnly(end),
    };
  }
  private requestDateFilters(query: any) {
    const range = this.monthDateRange(query);
    return {
      SolAberturaIni: range.startDate,
      SolAberturaFim: range.endDate,
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

  private monthDateRange(query: any) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      startDate: this.isoDate(query?.startDate) || this.dateOnly(start),
      endDate: this.isoDate(query?.endDate) || this.dateOnly(now),
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

  private normalizeRequestAttachments(value: unknown): NormalizedAccountingAttachment[] {
    const items = Array.isArray(value) ? value : [];
    if (items.length > 5) throw new BadRequestException('Envie no maximo 5 anexos por solicitacao.');
    let totalSize = 0;
    return items.map((item, index) => {
      const record = (item || {}) as PlainRecord;
      const fileName = this.safeFileName(this.requiredString(record.fileName || record.name || `anexo-${index + 1}`, 'Nome do anexo obrigatorio.'));
      const mimeType = this.text(record.mimeType || record.type) || 'application/octet-stream';
      const rawBase64 = this.text(record.contentBase64 || record.base64).replace(/^data:.*;base64,/, '');
      if (!rawBase64 || !/^[a-zA-Z0-9+/=]+$/.test(rawBase64)) throw new BadRequestException(`Conteudo do anexo ${fileName} invalido.`);
      const buffer = Buffer.from(rawBase64, 'base64');
      if (!buffer.byteLength) throw new BadRequestException(`Anexo ${fileName} esta vazio.`);
      if (buffer.byteLength > 10 * 1024 * 1024) throw new BadRequestException(`Anexo ${fileName} excede 10MB.`);
      totalSize += buffer.byteLength;
      if (totalSize > 20 * 1024 * 1024) throw new BadRequestException('Anexos excedem 20MB no total.');
      return { fileName, mimeType, buffer, sizeBytes: buffer.byteLength };
    });
  }

  private async storeOutboundAttachment(companyId: string, recordId: string | null, externalId: string, attachment: NormalizedAccountingAttachment) {
    const storageKey = recordId || `request-${companyId}-${randomUUID()}`;
    const path = this.writeStoredFile(storageKey, attachment.fileName, attachment.buffer);
    return this.prisma.accountingFile.create({
      data: {
        recordId,
        companyId,
        provider: 'ACESSORIAS',
        area: 'requests',
        direction: 'OUTBOUND',
        externalId: externalId || null,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        path,
        sizeBytes: attachment.sizeBytes,
      },
    });
  }

  private extractRequestExternalId(payload: unknown) {
    const direct = this.findStringValue(payload, ['SolID', 'id', 'ID', 'requestId', 'solicitacaoId', 'protocolo']);
    if (direct) return this.onlyDigits(direct) || direct;
    const raw = typeof payload === 'string' ? payload : payload ? JSON.stringify(payload) : '';
    const patterns = [
      /SolID["'\s:=]+(\d{2,})/i,
      /\[(\d{2,})\]/,
      /solicita[çc][ãa]o\D{0,24}(\d{2,})/i,
      /\bID\D{0,8}(\d{2,})/i,
    ];
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) return match[1];
    }
    return '';
  }

  private findStringValue(payload: unknown, keys: string[]): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as PlainRecord;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const nested = this.findStringValue(item, keys);
          if (nested) return nested;
        }
      } else if (value && typeof value === 'object') {
        const nested = this.findStringValue(value, keys);
        if (nested) return nested;
      }
    }
    return null;
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

  private findAttachments(payload: unknown, seen = new Set<string>()): Array<{ name: string; url: string }> {
    if (!payload || typeof payload !== 'object') return [];
    const record = payload as PlainRecord;
    const directUrl = this.text(record.Url || record.URL || record.Link || record.link || record.href || record.DownloadUrl || record.downloadUrl);
    const results: Array<{ name: string; url: string }> = [];

    if (directUrl.startsWith('http') && !seen.has(directUrl)) {
      seen.add(directUrl);
      results.push({ name: this.text(record.Nome || record.name || record.fileName || record.Arquivo || record.Descricao) || 'arquivo.pdf', url: directUrl });
    }

    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) results.push(...this.findAttachments(item, seen));
      } else if (value && typeof value === 'object') {
        results.push(...this.findAttachments(value, seen));
      }
    }
    return results;
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
