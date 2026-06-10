import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AccountRole, CompanyUserStatus, Prisma } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { PrismaService } from '../database/prisma.service';
import { CompanyPermissionKey, hasAnyCompanyPermission } from '../permissions/company-permissions';
import { AcessoriasApiService } from './acessorias-api.service';

const pdfParse: (buffer: Buffer) => Promise<{ text?: string }> = require('pdf-parse');

type PlainRecord = Record<string, any>;
type AccountingArea = 'documents' | 'taxes' | 'requests' | 'processes';
type AccountingAttachmentRef = { name: string; url: string; record?: PlainRecord };

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
    let record = await this.prisma.accountingRecord.findFirst({
      where: {
        companyId: company.id,
        provider: 'ACESSORIAS',
        area: accountingArea,
        OR: [{ id: recordId }, { externalId: recordId }],
      },
      include: { files: { orderBy: { createdAt: 'asc' } } },
    });
    if (!record) throw new NotFoundException('Registro contabil nao encontrado.');
    let detailRecord = record;
    if (accountingArea === 'requests' && record.externalId && !record.externalId.startsWith('local-')) {
      detailRecord = await this.refreshRequestDetail(company, record).catch(() => record);
    } else if (accountingArea === 'processes' && record.externalId) {
      detailRecord = await this.refreshProcessDetail(company, record).catch(() => record);
    }

    const normalized = this.jsonObject(detailRecord.normalized);
    const payload = this.jsonObject(detailRecord.payload);
    const files = detailRecord.files.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      direction: file.direction,
      sourceUrl: file.sourceUrl || '',
      sizeBytes: file.sizeBytes || 0,
      downloadedAt: this.isoDateTime(file.downloadedAt),
    }));
    const requestStatus = this.requestStatusState(payload, normalized, detailRecord.status || '');

    return {
      source: 'ACESSORIAS',
      area: accountingArea,
      id: detailRecord.externalId,
      cacheId: detailRecord.id,
      title: detailRecord.title,
      description: detailRecord.description || '',
      status: detailRecord.status || '',
      department: detailRecord.department || '',
      dueDate: this.isoDateTime(detailRecord.dueDate),
      sentAt: this.isoDateTime(detailRecord.sentAt),
      openedAt: this.isoDateTime(detailRecord.openedAt),
      updatedAt: this.isoDateTime(detailRecord.updatedExternalAt),
      syncedAt: this.isoDateTime(detailRecord.syncedAt),
      item: normalized,
      history: this.extractDetailHistory(payload, normalized, detailRecord, files),
      steps: this.extractDetailSteps(payload, normalized, detailRecord),
      files,
      statusHint: requestStatus.hint,
      canReply: accountingArea === 'requests' && requestStatus.canReply,
      canReopen: accountingArea === 'requests' && requestStatus.canReopen,
      canEvaluate: accountingArea === 'requests' && requestStatus.canEvaluate,
      rating: this.requestRating(normalized),
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
    const author = await this.userDisplayName(userId);
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
    await this.appendLocalClientInteraction(record.id, {
      title: 'Solicitação enviada pelo cliente',
      message: description,
      author,
      status: 'Cliente',
      attachments,
    });
    return { response, id: record.externalId, attachmentsStored: attachments.length };
  }

  async commentRequest(userId: string, accountRole: AccountRole, companyId: string, requestId: string, dto: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.requests.edit');
    const author = await this.userDisplayName(userId);
    const record = await this.findRequestRecord(company.id, requestId);
    if (record.externalId.startsWith('local-')) throw new BadRequestException('A solicitacao ainda nao possui ID da Acessorias para receber interacoes.');
    const attachments = this.normalizeRequestAttachments(dto?.attachments);
    const typedMessage = this.text(dto?.message || dto?.description || dto?.descricao);
    const statusSol = this.normalizeRequestStatusCode(dto?.statusSol || dto?.status || 'R');
    if (!typedMessage && !attachments.length && statusSol !== 'F') throw new BadRequestException('Informe uma mensagem ou anexe um arquivo na solicitacao.');
    const message = (typedMessage || (statusSol === 'F' ? 'Solicitacao marcada como resolvida pelo cliente.' : 'Anexo enviado pelo cliente.')).slice(0, 5000);
    const reopen = this.truthy(dto?.reopen) || this.isFinalizedRequest(record.status || '');
    const response = await this.acessorias.updateRequest(record.externalId, {
      statusSol,
      descricao: message,
      reabrir: reopen ? '1' : undefined,
    }, attachments);
    const refreshed = await this.refreshRequestDetail(company, record).catch(() => record);
    await Promise.all(attachments.map((attachment) => this.storeOutboundAttachment(company.id, refreshed.id, refreshed.externalId, attachment)));
    await this.appendLocalClientInteraction(refreshed.id, {
      title: statusSol === 'F' ? 'Solicitação marcada como resolvida pelo cliente' : reopen ? 'Solicitação reaberta pelo cliente' : 'Mensagem enviada pelo cliente',
      message,
      author,
      status: statusSol === 'F' ? 'Finalizada pelo cliente' : 'Resolvendo',
      attachments,
    });
    return { response, id: refreshed.externalId, attachmentsStored: attachments.length };
  }

  async evaluateRequest(userId: string, accountRole: AccountRole, companyId: string, requestId: string, dto: any) {
    await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.requests.edit');
    const record = await this.findRequestRecord(companyId, requestId);
    if (!this.isFinalizedRequest(record.status || '')) throw new BadRequestException('Avaliacao disponivel apenas para solicitacoes finalizadas.');
    const score = Number(dto?.score || dto?.rating || dto?.nota);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new BadRequestException('Informe uma avaliacao de 1 a 5.');
    const normalized = this.jsonObject(record.normalized);
    const updated = await this.prisma.accountingRecord.update({
      where: { id: record.id },
      data: {
        normalized: {
          ...normalized,
          clientRating: score,
          clientRatingComment: this.text(dto?.comment || dto?.comentario).slice(0, 1000),
          clientRatingAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    return { id: updated.externalId, score };
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

  private async findRequestRecord(companyId: string, requestId: string) {
    const record = await this.prisma.accountingRecord.findFirst({
      where: {
        companyId,
        provider: 'ACESSORIAS',
        area: 'requests',
        OR: [{ id: requestId }, { externalId: requestId }],
      },
      include: { files: { orderBy: { createdAt: 'asc' } } },
    });
    if (!record) throw new NotFoundException('Solicitacao nao encontrada.');
    return record;
  }

  private async refreshRequestDetail(company: CompanyAccess, record: Awaited<ReturnType<AccountingService['findRequestRecord']>>) {
    const payload = await this.acessorias.getRequest(record.externalId);
    const detail = this.pickRequestDetail(payload, company.cnpj, record.externalId);
    if (!detail) return record;
    await this.upsertRecord(company.id, 'requests', this.requestToRecord(detail));
    return this.findRequestRecord(company.id, record.externalId);
  }

  private async refreshProcessDetail(company: CompanyAccess, record: { id: string; externalId: string }) {
    const payload = await this.acessorias.getProcess(record.externalId);
    const detail = this.pickProcessDetail(payload, company.cnpj, record.externalId);
    if (!detail.ProcID || !this.sameDocument(detail.EmpCNPJ, company.cnpj)) return this.prisma.accountingRecord.findUniqueOrThrow({ where: { id: record.id }, include: { files: { orderBy: { createdAt: 'asc' } } } });
    await this.upsertRecord(company.id, 'processes', this.processToRecord(detail));
    return this.prisma.accountingRecord.findFirstOrThrow({
      where: { companyId: company.id, provider: 'ACESSORIAS', area: 'processes', externalId: record.externalId },
      include: { files: { orderBy: { createdAt: 'asc' } } },
    });
  }

  private pickRequestDetail(payload: unknown, companyCnpj: string, requestId: string) {
    const candidates: PlainRecord[] = [];
    this.collectRequestObjects(payload, candidates, 0);
    return candidates.find((item) => this.text(item.SolID) === requestId && (!item.EmpCNPJ || this.sameDocument(item.EmpCNPJ, companyCnpj)))
      || candidates.find((item) => this.text(item.SolID) === requestId)
      || null;
  }

  private pickProcessDetail(payload: unknown, companyCnpj: string, processId: string) {
    const candidates: PlainRecord[] = [];
    this.collectAccountingObjects(payload, candidates, 0, /proc/i);
    return candidates.find((item) => this.text(item.ProcID) === processId && (!item.EmpCNPJ || this.sameDocument(item.EmpCNPJ, companyCnpj)))
      || candidates.find((item) => this.text(item.ProcID) === processId)
      || {};
  }

  private collectRequestObjects(value: unknown, output: PlainRecord[], depth: number) {
    if (depth > 6 || !value) return;
    if (Array.isArray(value)) {
      value.forEach((item) => this.collectRequestObjects(item, output, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as PlainRecord;
    if (record.SolID) output.push(record);
    Object.values(record).forEach((entry) => {
      if (entry && typeof entry === 'object') this.collectRequestObjects(entry, output, depth + 1);
    });
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
    if (area === 'documents') {
      const payload = await this.acessorias.getCompany(company.cnpj, { attachments: 'S', documents: 'S', files: 'S', ged: 'S' });
      const companyRecord = this.jsonObject(payload);
      const companyDocuments = this.companyAttachmentDocuments(company, payload);
      const deliveryDocuments = await this.fetchDeliveryDocuments(company, query).catch(() => []);
      const processDocuments = await this.fetchProcessDocuments(company, query, this.text(companyRecord.ID)).catch(() => []);
      return this.dedupeRecordEntries([...processDocuments, ...deliveryDocuments, ...companyDocuments]);
    }
    if (area === 'taxes') {
      const entries: PlainRecord[] = [];
      const seenExternalIds = new Set<string>();
      const maxPages = 25;
      for (const dateRange of this.deliveryDateRanges(query)) {
        for (let page = 1; page <= maxPages; page += 1) {
          const payload = await this.acessorias.listDeliveries(company.cnpj, {
            ...dateRange,
            Pagina: page,
            attachments: 'S',
            config: 'S',
            situation: query?.status,
            department_id: query?.departmentId,
          });
          const pageEntries = this.deliveryContainers(payload)
            .flatMap((item) => this.asArray(item.Entregas)
              .filter((delivery) => this.deliveryBelongsToArea(area, delivery))
              .map((delivery) => this.deliveryToTax(item, delivery)));
          let newItems = 0;
          for (const entry of pageEntries) {
            const key = this.text(entry.externalId);
            if (!key || seenExternalIds.has(key)) continue;
            seenExternalIds.add(key);
            entries.push(entry);
            newItems += 1;
          }
          if (!pageEntries.length || pageEntries.length < 20 || newItems === 0) break;
        }
      }
      return entries;
    }
    if (area === 'requests') {
      const payload = await this.fetchPagedAcessorias((params) => this.acessorias.listRequests(params), this.requestDateFilters(query));
      return payload.filter((item) => this.sameDocument(item.EmpCNPJ, company.cnpj)).map((item) => this.requestToRecord(item));
    }
    const companyRecord = this.jsonObject(await this.acessorias.getCompany(company.cnpj, {}).catch(() => ({})));
    const payload = await this.fetchPagedAcessorias((params) => this.acessorias.listProcesses(params), this.processDateFilters(query), 60);
    return payload.filter((item) => this.processBelongsToCompany(item, company, this.text(companyRecord.ID))).map((item) => this.processToRecord(item));
  }
  private async fetchPagedAcessorias(fetchPage: (query: Record<string, string | number | boolean | undefined | null>) => Promise<unknown[]>, query: Record<string, string | number | boolean | undefined | null>, maxPages = 25) {
    const records: PlainRecord[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const items = this.asArray(await fetchPage({ ...query, Pagina: page }));
      records.push(...items);
      if (items.length < 20) break;
    }
    return records;
  }

  private async fetchDeliveryDocuments(company: CompanyAccess, query: any) {
    const entries: PlainRecord[] = [];
    const seenExternalIds = new Set<string>();
    const maxPages = 10;
    for (const dateRange of this.deliveryDateRanges(query)) {
      for (let page = 1; page <= maxPages; page += 1) {
        const payload = await this.acessorias.listDeliveries(company.cnpj, {
          ...dateRange,
          Pagina: page,
          attachments: 'S',
          config: 'S',
          department_id: query?.departmentId,
        });
        const pageEntries = this.deliveryContainers(payload)
          .flatMap((item) => this.asArray(item.Entregas)
            .filter((delivery) => this.deliveryBelongsToArea('documents', delivery) && this.findAttachments(delivery).length > 0)
            .map((delivery) => this.deliveryToDocument(item, delivery)));
        let newItems = 0;
        for (const entry of pageEntries) {
          const key = this.text(entry.externalId);
          if (!key || seenExternalIds.has(key)) continue;
          seenExternalIds.add(key);
          entries.push(entry);
          newItems += 1;
        }
        if (!pageEntries.length || pageEntries.length < 20 || newItems === 0) break;
      }
    }
    return entries;
  }

  private async fetchProcessDocuments(company: CompanyAccess, query: any, externalCompanyId: string) {
    const payload = await this.fetchPagedAcessorias((params) => this.acessorias.listProcesses(params), this.processDateFilters(query), 60);
    return payload
      .filter((item) => this.processBelongsToCompany(item, company, externalCompanyId))
      .flatMap((item) => this.processToDocuments(company, item));
  }

  private dedupeRecordEntries<T extends PlainRecord>(entries: T[]) {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = this.text(entry.externalId);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private processBelongsToCompany(item: PlainRecord, company: CompanyAccess, externalCompanyId = '') {
    if (item.EmpCNPJ) return this.sameDocument(item.EmpCNPJ, company.cnpj);
    if (externalCompanyId && this.text(item.EmpID) === externalCompanyId) return true;
    const leftName = this.normalizeComparableText(item.EmpNome || item.Razao || item.Empresa);
    const rightName = this.normalizeComparableText(company.legalName);
    return Boolean(leftName && rightName && (leftName === rightName || leftName.includes(rightName) || rightName.includes(leftName)));
  }

  private async listCached(companyId: string, area: AccountingArea, query: any) {
    const page = this.page(query);
    const pageSize = this.pageSize(query);
    const sortBy = this.text(query?.sortBy) || this.defaultSortBy(area);
    const sortDirection = this.text(query?.sortDirection).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const search = this.text(query?.search);
    const department = this.text(query?.department);
    const startDate = this.dateFromQuery(query?.startDate);
    const endDate = this.dateFromQuery(query?.endDate);
    if (endDate) endDate.setUTCHours(23, 59, 59, 999);

    const andConditions: Prisma.AccountingRecordWhereInput[] = [];
    if (area === 'taxes') andConditions.push({ sentAt: { not: null } }, { files: { some: {} } });
    if (area === 'documents') andConditions.push({ files: { some: {} } });
    if (department) andConditions.push({ department: { contains: department, mode: 'insensitive' } });
    if (startDate || endDate) {
      const dateField = area === 'requests' ? 'openedAt' : area === 'processes' ? 'updatedExternalAt' : area === 'documents' ? 'sentAt' : 'dueDate';
      const dateFilter: Prisma.DateTimeNullableFilter = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      andConditions.push({ [dateField]: dateFilter } as Prisma.AccountingRecordWhereInput);
    }
    if (search) {
      const terms = search.split(/\s+/).filter(Boolean).slice(0, 5);
      for (const term of terms) {
        andConditions.push({
          OR: [
            { externalId: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { status: { contains: term, mode: 'insensitive' } },
            { department: { contains: term, mode: 'insensitive' } },
          ],
        });
      }
    }

    const where: Prisma.AccountingRecordWhereInput = {
      companyId,
      provider: 'ACESSORIAS',
      area,
      ...(andConditions.length ? { AND: andConditions } : {}),
    };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.accountingRecord.count({ where }),
      this.prisma.accountingRecord.findMany({
        where,
        include: { files: { orderBy: { createdAt: 'desc' }, take: 5 } },
        orderBy: this.accountingOrderBy(sortBy, sortDirection, area),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const preparedRecords = area === 'taxes'
      ? await Promise.all(records.map((record) => this.refreshTaxDueDateFromStoredFiles(record)))
      : area === 'documents'
        ? await Promise.all(records.map((record) => this.refreshDocumentDisplayFromStoredFiles(record)))
        : records;
    return {
      source: 'ACESSORIAS',
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: preparedRecords.map((record) => ({
        ...((record.normalized || {}) as PlainRecord),
        id: record.externalId,
        cacheId: record.id,
        title: record.title,
        status: area === 'taxes' && record.dueDate ? this.formatDateDash(this.dateToIso(record.dueDate)) : record.status,
        department: record.department,
        dueDate: this.dateToIso(record.dueDate),
        sentAt: this.dateToIso(record.sentAt),
        openedAt: this.dateToIso(record.openedAt),
        updatedAt: this.dateToIso(record.updatedExternalAt),
        localFileId: record.files[0]?.id || '',
        localFileName: record.files[0]?.fileName || '',
        localFiles: record.files.map((file: PlainRecord) => ({ id: file.id, fileName: file.fileName, direction: file.direction, mimeType: file.mimeType })),
        localFileCount: record.files.length,
        syncedAt: record.syncedAt,
      })),
    };
  }

  private pageSize(query: any) {
    const value = Number(query?.pageSize || 20);
    return [20, 50, 100].includes(value) ? value : 20;
  }

  private dateFromQuery(value: unknown) {
    const text = this.isoDate(value);
    return text ? new Date(`${text}T00:00:00.000Z`) : null;
  }

  private dateToIso(value?: Date | string | null) {
    if (!value) return '';
    if (typeof value === 'string') return this.isoDate(value) || value;
    return value.toISOString().slice(0, 10);
  }

  private async refreshTaxDueDateFromStoredFiles(record: PlainRecord) {
    if (record.dueDate) return record;
    const files = Array.isArray(record.files) ? record.files : [];
    const file = files.find((item) => /\.(pdf|bin)$/i.test(this.text(item.fileName || item.path)) || this.text(item.mimeType).includes('pdf'));
    const path = file ? this.existingStoredFilePath(this.text(file.path)) : null;
    if (!path) return record;
    const updated = await this.updateTaxDueDateFromPdf(this.text(record.id), readFileSync(path)).catch(() => null);
    return updated ? { ...record, dueDate: updated.dueDate, status: updated.status, normalized: updated.normalized } : record;
  }

  private async refreshDocumentDisplayFromStoredFiles(record: PlainRecord) {
    const files = Array.isArray(record.files) ? record.files : [];
    const firstFile = files[0];
    const normalized = this.jsonObject(record.normalized);
    const currentTitle = this.text(record.title || normalized.description || normalized.fileName);
    const fileName = this.displayFileName(firstFile?.fileName || normalized.fileName || '');
    const shouldUseFileName = Boolean(fileName && this.isGenericCompanyDocumentName(currentTitle));
    const department = this.text(record.department || normalized.department) || 'Cadastro da empresa';
    const sentAt = record.sentAt || firstFile?.createdAt || null;
    if (!shouldUseFileName && record.department && record.sentAt) return record;

    const nextNormalized = {
      ...normalized,
      description: shouldUseFileName ? fileName : (normalized.description || currentTitle),
      fileName: shouldUseFileName ? fileName : (normalized.fileName || fileName),
      department,
      sentAt: this.dateToIso(sentAt) || normalized.sentAt || '',
    };
    const updated = await this.prisma.accountingRecord.update({
      where: { id: this.text(record.id) },
      data: {
        title: shouldUseFileName ? fileName : record.title,
        description: shouldUseFileName ? fileName : record.description,
        department,
        sentAt: sentAt ? new Date(sentAt) : record.sentAt,
        normalized: nextNormalized as Prisma.InputJsonValue,
      },
      select: { title: true, description: true, department: true, sentAt: true, normalized: true },
    }).catch(() => null);
    return updated ? { ...record, ...updated } : record;
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

  private extractDetailHistory(payload: PlainRecord, normalized: PlainRecord, record: { title: string; status: string | null; department: string | null; openedAt: Date | null; updatedExternalAt: Date | null }, files: Array<{ id: string; fileName: string; direction: string; sourceUrl?: string }>) {
    const requestInteractions = this.extractRequestInteractions(payload, files);
    const localClientInteractions = this.extractLocalClientInteractions(normalized, files);
    if (requestInteractions.length || localClientInteractions.length) {
      const localTexts = new Set(localClientInteractions.map((item) => this.normalizeComparableText(item.text)).filter(Boolean));
      const remoteWithoutLocalDuplicates = requestInteractions.filter((item) => !localTexts.has(this.normalizeComparableText(item.text)));
      return this.dedupeDetailItems([...remoteWithoutLocalDuplicates, ...localClientInteractions])
        .sort((a, b) => this.sortableDate(a.date) - this.sortableDate(b.date));
    }

    const candidates: PlainRecord[] = [];
    this.collectAccountingObjects(payload, candidates, 0, /hist|mens|msg|intera|atend|respost|coment|timeline|andament|sol/i);
    const events = candidates
      .map((item, index) => this.normalizeHistoryObject(item, index))
      .filter((item): item is { id: string; title: string; text: string; author: string; date: string; status: string; kind: string; origin?: string; attachments?: unknown[] } => Boolean(item));

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

  private extractRequestInteractions(payload: PlainRecord, files: Array<{ id: string; fileName: string; direction: string; sourceUrl?: string }>) {
    const groups = this.asUnknownArray(payload.SolInteracoes);
    const interactions = groups.flatMap((group) => Array.isArray(group) ? this.asUnknownArray(group) : [group]).filter((item): item is PlainRecord => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
    return interactions.map((item, index) => {
      const author = this.text(item.CmtUsuario || item.Usuario || item.Autor);
      const text = this.cleanRequestComment(this.text(item.CmtText || item.Comentario || item.Texto || item.Descricao));
      const attachments = this.findAttachments(item).map((attachment) => {
        const matched = files.find((file) => file.sourceUrl === attachment.url || file.fileName === this.safeFileName(attachment.name));
        return {
          id: matched?.id || '',
          fileName: matched?.fileName || this.safeFileName(attachment.name),
          direction: matched?.direction || this.requestMessageOrigin(item, payload),
          sourceUrl: attachment.url,
        };
      });
      return {
        id: `interaction-${index}`,
        title: this.text(item.CmtTipo) || 'Mensagem',
        text,
        author,
        date: this.text(item.CmtDH || item.Data || item.createdAt),
        status: '',
        kind: attachments.length ? 'file' : 'message',
        origin: this.requestMessageOrigin(item, payload),
        attachments,
      };
    }).filter((item) => item.text || item.attachments.length || item.date);
  }

  private requestMessageOrigin(item: PlainRecord, request: PlainRecord) {
    const explicit = this.text(item.CmtTipoUsuario || item.TipoUsuario || item.Origem).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/extern|client|cliente|empresa|portal|app/.test(explicit)) return 'client';
    if (/intern|office|contador|contabil|analist|atendent/.test(explicit)) return 'office';
    const author = this.text(item.CmtUsuario || item.Usuario || item.Autor).toLowerCase();
    const clientNames = [this.text(request.SolUsuario), ...this.asUnknownArray(request.SolEmpResp).map((value) => this.text(value))].map((value) => value.toLowerCase()).filter(Boolean);
    if (author && clientNames.includes(author)) return 'client';
    const officeNames = this.asUnknownArray(request.SolOfficeResp).map((value) => this.text(value).toLowerCase()).filter(Boolean);
    if (author && officeNames.includes(author)) return 'office';
    return 'system';
  }

  private cleanRequestComment(value: string) {
    return value.replace(/^coment[aá]rio:\s*/i, '').trim();
  }

  private extractDetailSteps(payload: PlainRecord, normalized: PlainRecord, record: { title: string; status: string | null; openedAt: Date | null; updatedExternalAt: Date | null }) {
    const candidates: PlainRecord[] = [];
    this.collectAccountingObjects(payload, candidates, 0, /etap|fase|passo|andament|check|progres|task|proc/i);
    const steps = candidates
      .map((item, index) => this.normalizeProcessStepObject(item, index))
      .filter((item): item is { id: string; title: string; status: string; date: string; responsible: string; percentage: string; completed: boolean } => Boolean(item));
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
      completed: /conclu|finaliz|encerr/i.test(this.text(record.status)),
    }];
  }

  private collectAccountingObjects(value: unknown, output: PlainRecord[], depth: number, pathPattern: RegExp, path = '') {
    if (depth > 6 || output.length > 120 || !value) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const nextPath = `${path}.${index}`;
        if (Array.isArray(item)) {
          this.collectAccountingObjects(item, output, depth + 1, pathPattern, nextPath);
        } else if (item && typeof item === 'object') {
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

  private normalizeProcessStepObject(record: PlainRecord, index: number) {
    const looksLikeStep = (record.Nome && (record.Status || record.Tipo || record.Automacao)) || record.Etapa || record.Fase || record.Passo;
    if (!looksLikeStep) return null;
    const automation = this.jsonObject(record.Automacao);
    const delivery = this.jsonObject(automation.Entrega);
    if (!this.isClientVisibleProcessStep(record, delivery)) return null;
    const title = this.firstMatchingField(record, [/etapa/i, /fase/i, /passo/i, /titulo/i, /nome/i, /descri/i, /task/i, /atividade/i]);
    const completed = this.isCompletedProcessStep(record, delivery);
    const status = completed ? 'Concluida' : 'Pendente';
    const date = this.firstMatchingField(delivery, [/prazo/i, /previs/i, /venc/i, /entdtprazo/i, /data/i, /^dt/i])
      || this.firstMatchingField(record, [/prazo/i, /previs/i, /venc/i, /conclus/i, /fim/i, /data/i, /^dt/i]);
    const responsible = this.firstMatchingField(record, [/respons/i, /gestor/i, /usuario/i, /analista/i, /atendente/i])
      || this.firstMatchingField(delivery, [/respons/i, /gestor/i, /usuario/i, /analista/i, /atendente/i]);
    const percentage = this.normalizePercentage(this.firstMatchingField(record, [/percent/i, /porcent/i, /progres/i]));
    if (!title && !status && !percentage) return null;
    return { id: `step-${index}`, title: title || 'Etapa', status, date, responsible, percentage, completed };
  }

  private isClientVisibleProcessStep(record: PlainRecord, delivery: PlainRecord) {
    const visibility = this.deepText([record.Mostrar, record.MostrarCliente, record.MostrarApp, record.Visible, record.Visivel, record.ExibirCliente, record.ExibirApp, delivery.Mostrar, delivery.MostrarCliente, delivery.MostrarApp, delivery.Visible, delivery.Visivel]);
    if (!visibility.trim()) return true;
    const text = this.normalizeComparableText(visibility);
    return /mostrar\s+(pro\s+cliente|para\s+cliente|no\s+app|app)|cliente|app/.test(text);
  }

  private isCompletedProcessStep(record: PlainRecord, delivery: PlainRecord) {
    const completionDate = this.firstMatchingField(record, [/conclus/i, /finaliz/i, /entdtentrega/i])
      || this.firstMatchingField(delivery, [/entrega/i, /conclus/i, /finaliz/i, /realiz/i]);
    if (completionDate && !/^0{4}-0{2}-0{2}/.test(completionDate)) return true;
    const text = this.normalizeComparableText(this.deepText([record.Status, record.StatusExecucao, record.Situacao, record.Concluido, record.Finalizado, delivery.Status, delivery.Situacao]));
    return /(^|\s)(ok|sim|true|1)(\s|$)|conclu|finaliz|entreg|realiz/.test(text);
  }

  private deepText(values: unknown[]) {
    return values.map((value) => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }).join(' ');
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
    const existing = await this.prisma.accountingRecord.findUnique({
      where: { companyId_provider_area_externalId: { companyId, provider: 'ACESSORIAS', area, externalId: entry.externalId } },
      select: { normalized: true },
    });
    const normalized = this.mergeLocalNormalizedState(existing?.normalized, entry.normalized);
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
        normalized: normalized as Prisma.InputJsonValue,
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
        normalized: normalized as Prisma.InputJsonValue,
      },
    });
    const attachments: AccountingAttachmentRef[] = Array.isArray(entry.attachments) ? entry.attachments : entry.attachmentUrl ? [{ name: entry.attachmentName || (entry.externalId + '.pdf'), url: entry.attachmentUrl }] : [];
    for (const attachment of attachments) {
      await this.storeAttachment(companyId, area, record.id, entry.externalId, attachment.name || (entry.externalId + '.pdf'), attachment.url).catch(() => undefined);
    }
    await this.prisma.accountingFile.updateMany({ where: { companyId, area, provider: 'ACESSORIAS', externalId: entry.externalId, recordId: null }, data: { recordId: record.id } });
    return record;
  }

  private mergeLocalNormalizedState(current: unknown, incoming: unknown) {
    const currentObject = this.jsonObject(current);
    const incomingObject = this.jsonObject(incoming);
    const localClientInteractions = this.asUnknownArray(currentObject.localClientInteractions);
    const clientRating = currentObject.clientRating;
    const clientRatingComment = currentObject.clientRatingComment;
    const clientRatingAt = currentObject.clientRatingAt;
    return {
      ...incomingObject,
      ...(localClientInteractions.length ? { localClientInteractions } : {}),
      ...(clientRating !== undefined ? { clientRating } : {}),
      ...(clientRatingComment !== undefined ? { clientRatingComment } : {}),
      ...(clientRatingAt !== undefined ? { clientRatingAt } : {}),
    };
  }

  private async storeAttachment(companyId: string, area: AccountingArea, recordId: string, externalId: string, fileName: string, sourceUrl: string) {
    if (!sourceUrl) return null;
    const existing = await this.prisma.accountingFile.findFirst({ where: { recordId, sourceUrl } });
    if (existing && this.existingStoredFilePath(existing.path)) return existing;
    const downloaded = await this.acessorias.downloadFile(sourceUrl);
    let displayName = this.displayFileName(downloaded.fileName || fileName || `${externalId}.pdf`);
    let safeName = this.safeFileName(displayName);
    const usefulExtension = /\.(pdf|xml|xlsx?|docx?|pptx?|odt|ods|zip|rar|7z|csv|txt|png|jpe?g|gif|bmp|tiff?|pfx|p12|json|xsd|p7s|cer|crt)$/i.test(safeName);
    if (!usefulExtension) {
      const extension = this.extensionForDownloadedFile(downloaded.mimeType, downloaded.buffer);
      // Nunca substituir uma extensão existente por .bin (tipo desconhecido):
      // preserva o nome exatamente como veio da Acessórias.
      if (extension !== '.bin') {
        safeName = safeName.replace(/\.[a-z0-9]{2,5}$/i, '') + extension;
        displayName = displayName.replace(/\.[a-z0-9]{2,5}$/i, '') + extension;
      }
    }
    const path = this.writeStoredFile(recordId, safeName, downloaded.buffer);
    const created = await this.prisma.accountingFile.create({
      data: {
        recordId,
        companyId,
        provider: 'ACESSORIAS',
        area,
        direction: 'INBOUND',
        externalId,
        fileName: displayName,
        mimeType: downloaded.mimeType,
        path,
        sourceUrl,
        sizeBytes: downloaded.buffer.byteLength,
      },
    });
    if (area === 'documents' && this.isGenericCompanyDocumentName(fileName) && displayName) await this.updateDocumentNameFromAttachment(recordId, displayName);
    if (area === 'taxes') await this.updateTaxDueDateFromPdf(recordId, downloaded.buffer);
    return created;
  }

  private isGenericCompanyDocumentName(value: string) {
    return /^documento_cadastral_\d+\.(pdf|bin|xml|zip|docx?)$/i.test(this.safeFileName(value || '')) || /^Documento cadastral \d+/i.test(value || '');
  }

  private async updateDocumentNameFromAttachment(recordId: string, fileName: string) {
    const record = await this.prisma.accountingRecord.findUnique({ where: { id: recordId }, select: { normalized: true } });
    if (!record) return;
    const normalized = { ...this.jsonObject(record.normalized), description: fileName, fileName };
    await this.prisma.accountingRecord.update({
      where: { id: recordId },
      data: { title: fileName, description: fileName, normalized: normalized as Prisma.InputJsonValue },
    });
  }

  private async updateTaxDueDateFromPdf(recordId: string, buffer: Buffer) {
    const dueDate = await this.extractDueDateFromPdf(buffer);
    if (!dueDate) return;
    const record = await this.prisma.accountingRecord.findUnique({ where: { id: recordId }, select: { normalized: true } });
    if (!record) return;
    const normalized = { ...this.jsonObject(record.normalized), guideDueDate: dueDate };
    return this.prisma.accountingRecord.update({
      where: { id: recordId },
      data: { dueDate: this.dateOrNull(dueDate), status: this.formatDateDash(dueDate), normalized: normalized as Prisma.InputJsonValue },
      select: { dueDate: true, status: true, normalized: true },
    });
  }

  private async extractDueDateFromPdf(buffer: Buffer) {
    const text = await this.extractPdfText(buffer);
    const patterns = [
      /(?:vencimento|vencto|vcto|venc\.?|data\s+de\s+vencimento|validade)\D{0,120}(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i,
      /(?:pagar|pague)\s+ate\D{0,120}(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i,
      /(?:vencimento|vencto|vcto|data\s+de\s+vencimento|pagar\s+at[eé]|pague\s+at[eé])\D{0,80}(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i,
      /(\d{2}[\/.-]\d{2}[\/.-]\d{4})\D{0,40}(?:vencimento|vencto|vcto)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const iso = match?.[1] ? this.brDateToIso(match[1]) : '';
      if (iso) return iso;
    }
    return '';
  }

  private async extractPdfText(buffer: Buffer) {
    const raw = buffer.toString('latin1');
    const chunks: string[] = [];
    try {
      const parsed = await pdfParse(buffer);
      if (parsed.text) chunks.push(parsed.text);
    } catch {
      // Mantem fallback manual para PDFs que o parser nao consiga abrir.
    }
    chunks.push(raw);
    for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      const before = raw.slice(Math.max(0, (match.index || 0) - 200), match.index || 0);
      if (!/FlateDecode/i.test(before)) continue;
      try {
        chunks.push(inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'));
      } catch {
        // PDFs com filtros adicionais permanecem cobertos pela leitura bruta.
      }
    }
    return chunks.join('\n').replace(/\\([()\\])/g, '$1').replace(/\s+/g, ' ');
  }

  private brDateToIso(value: string) {
    const match = value.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
    if (!match) return '';
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? '' : iso;
  }

  private formatDateDash(value: string) {
    const iso = this.isoDate(value);
    if (!iso) return value;
    const [year, month, day] = iso.split('-');
    return `${day}-${month}-${year}`;
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

  private processToDocuments(company: CompanyAccess, process: PlainRecord) {
    const attachments = this.findAttachments(process);
    const processId = this.text(process.ProcID || process.ID || process.Codigo || this.hashText(JSON.stringify(process).slice(0, 500)));
    const processName = this.text(process.ProcTitulo || process.ProcNome || process.Nome || process.Titulo || 'Processo');
    const department = this.firstMatchingField(process, [/dpto/i, /depart/i, /area/i]) || 'Processos';
    const responsible = this.firstMatchingField(process, [/criador/i, /usuario/i, /autor/i, /respons/i, /gestor/i]) || '';
    const sentAtFallback = this.firstMatchingField(process, [/last/i, /updated/i, /dt/i, /data/i, /inicio/i]);
    return attachments.map((attachment, index) => {
      const source = this.jsonObject(attachment.record);
      const fileName = this.displayFileName(attachment.name || this.firstMatchingField(source, [/nome/i, /arquivo/i, /descri/i]) || `Documento do processo ${index + 1}.pdf`);
      const stepName = this.firstMatchingField(source, [/passo/i, /etapa/i, /fase/i, /atividade/i]) || this.text(source.Nome);
      const sentAt = this.firstMatchingField(source, [/cmt.?dh/i, /data.?hora/i, /created/i, /criado/i, /dt/i, /data/i, /last/i]) || sentAtFallback;
      const author = this.firstMatchingField(source, [/usuario/i, /autor/i, /respons/i, /respnome/i]) || responsible;
      const normalized = {
        id: `${processId}-document-${this.hashText(attachment.url || fileName || String(index))}`,
        description: fileName,
        dueDate: '',
        delayDate: '',
        sentAt,
        status: 'Anexado',
        department,
        responsible: author,
        companyName: this.text(process.EmpNome) || company.legalName,
        fileName,
        processId,
        processName,
        stepName,
      };
      return this.recordEntry(normalized.id, fileName, normalized.status, normalized.department, '', normalized.sentAt, '', sentAt || sentAtFallback, normalized, { process, attachment: source }, [{ ...attachment, name: fileName }]);
    });
  }

  private companyAttachmentDocuments(company: CompanyAccess, payload: unknown) {
    const record = this.jsonObject(payload);
    const attachments = this.findAttachments(record);
    const companyExternalId = this.text(record.ID) || this.onlyDigits(this.text(record.Identificador)) || company.id;
    return attachments.map((attachment, index) => {
      const fileName = this.companyAttachmentLabel(attachment.name, index);
      const normalized = {
        id: `${companyExternalId}-document-${index + 1}`,
        description: fileName,
        dueDate: '',
        delayDate: '',
        sentAt: this.text(record.DataDoCadastro),
        status: 'Anexado',
        department: 'Cadastro da empresa',
        responsible: 'Acessórias',
        companyName: this.text(record.Razao) || company.legalName,
        fileName,
      };
      return this.recordEntry(normalized.id, normalized.description, normalized.status, normalized.department, '', normalized.sentAt, '', normalized.sentAt, normalized, { company: record }, [{ ...attachment, name: fileName }]);
    });
  }

  private companyAttachmentLabel(name: string, index: number) {
    const cleaned = /^arquivo(?:\.[a-z0-9]{2,5})?$/i.test(this.text(name)) ? '' : this.displayFileName(name || '');
    return cleaned || `Documento cadastral ${index + 1}.pdf`;
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
      closed: this.text(item.SolEncerrada),
      rating: this.text(item.SolAvaliacao),
      requester: this.text(item.SolUsuario),
      userType: this.text(item.SolTipoUsuario),
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

  private recordEntry(externalId: string, title: string, status: string, department: string, dueDate: string, sentAt: string, openedAt: string, updatedExternalAt: string, normalized: PlainRecord, payload: unknown, attachments: AccountingAttachmentRef[] = []) {
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
    const start = new Date(2020, 0, 1);
    return {
      DtInitial: this.isoDate(query?.startDate) || this.dateOnly(start),
      DtFinal: this.isoDate(query?.endDate) || this.dateOnly(now),
    };
  }

  private deliveryDateRanges(query: any) {
    const requestedStart = this.isoDate(query?.startDate);
    const requestedEnd = this.isoDate(query?.endDate);
    const now = new Date();
    const startYear = Number((requestedStart || '2020-01-01').slice(0, 4));
    const endYear = Number((requestedEnd || this.dateOnly(now)).slice(0, 4));
    const ranges: Array<{ DtInitial: string; DtFinal: string }> = [];
    for (let year = startYear; year <= endYear; year += 1) {
      const first = `${year}-01-01`;
      const last = `${year}-12-31`;
      ranges.push({
        DtInitial: requestedStart && year === startYear ? requestedStart : first,
        DtFinal: requestedEnd && year === endYear ? requestedEnd : (year === now.getFullYear() ? this.dateOnly(now) : last),
      });
    }
    return ranges.length ? ranges : [this.deliveryDateRange(query)];
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
    const now = new Date();
    return {
      ProcInicioIni: this.isoDate(query?.startDate) || '2020-01-01',
      ProcInicioFim: this.isoDate(query?.endDate) || this.dateOnly(now),
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

  private requestStatusState(payload: PlainRecord, normalized: PlainRecord, status: string) {
    const value = this.text(status || payload.SolStatus || normalized.status).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const finalized = /finaliz|encerr/.test(value);
    if (/cliente/.test(value)) return { canReply: true, canReopen: false, canEvaluate: false, hint: 'Aguardando retorno do cliente.' };
    if (/resolv|progress|andament/.test(value)) return { canReply: true, canReopen: false, canEvaluate: false, hint: 'Demanda em atendimento pela contabilidade. O cliente ainda pode complementar informacoes.' };
    if (finalized) return { canReply: false, canReopen: true, canEvaluate: true, hint: 'Solicitacao finalizada. O cliente pode avaliar ou reabrir se precisar.' };
    return { canReply: true, canReopen: false, canEvaluate: false, hint: 'Solicitacao aberta.' };
  }

  private requestRating(normalized: PlainRecord) {
    const score = Number(normalized.clientRating || normalized.rating || 0);
    if (!Number.isFinite(score) || score < 1) return null;
    return {
      score,
      comment: this.text(normalized.clientRatingComment),
      evaluatedAt: this.text(normalized.clientRatingAt),
    };
  }

  private isFinalizedRequest(status: string) {
    const value = this.text(status).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /finaliz|encerr/.test(value);
  }

  private normalizeRequestStatusCode(value: unknown) {
    const status = this.text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (status === 'C' || status.includes('CLIENTE')) return 'C';
    if (status === 'F' || status.includes('FINAL')) return 'F';
    return 'R';
  }

  private truthy(value: unknown) {
    const text = this.text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return value === true || ['1', 's', 'sim', 'true', 'yes'].includes(text);
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
    return 'sentAt';
  }

  private normalizeRequestAttachments(value: unknown): NormalizedAccountingAttachment[] {
    const items = Array.isArray(value) ? value : [];
    if (items.length > 10) throw new BadRequestException('Envie no maximo 10 anexos por solicitacao.');
    let totalSize = 0;
    return items.map((item, index) => {
      const record = (item || {}) as PlainRecord;
      const fileName = this.safeFileName(this.requiredString(record.fileName || record.name || `anexo-${index + 1}`, 'Nome do anexo obrigatorio.'));
      const mimeType = this.text(record.mimeType || record.type) || 'application/octet-stream';
      const rawBase64 = this.text(record.contentBase64 || record.base64).replace(/^data:.*;base64,/, '');
      if (!rawBase64 || !/^[a-zA-Z0-9+/=]+$/.test(rawBase64)) throw new BadRequestException(`Conteudo do anexo ${fileName} invalido.`);
      const buffer = Buffer.from(rawBase64, 'base64');
      if (!buffer.byteLength) throw new BadRequestException(`Anexo ${fileName} esta vazio.`);
      if (buffer.byteLength > 30 * 1024 * 1024) throw new BadRequestException(`Anexo ${fileName} excede 30MB.`);
      totalSize += buffer.byteLength;
      if (totalSize > 30 * 1024 * 1024) throw new BadRequestException('Anexos excedem 30MB no total.');
      return { fileName, mimeType, buffer, sizeBytes: buffer.byteLength };
    });
  }

  private async userDisplayName(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    return user?.name || user?.email || 'Cliente';
  }

  private async appendLocalClientInteraction(recordId: string, interaction: { title: string; message: string; author: string; status?: string; attachments?: NormalizedAccountingAttachment[] }) {
    const record = await this.prisma.accountingRecord.findUnique({ where: { id: recordId }, select: { normalized: true } });
    if (!record) return;
    const normalized = this.jsonObject(record.normalized);
    const current = this.asUnknownArray(normalized.localClientInteractions).filter((item): item is PlainRecord => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
    const next = {
      id: `client-${Date.now()}-${randomUUID()}`,
      title: interaction.title,
      text: interaction.message,
      author: interaction.author,
      date: new Date().toISOString(),
      status: interaction.status || '',
      kind: interaction.attachments?.length ? 'file' : 'message',
      origin: 'client',
      attachments: (interaction.attachments || []).map((attachment) => ({ fileName: attachment.fileName, sizeBytes: attachment.sizeBytes, direction: 'OUTBOUND' })),
    };
    await this.prisma.accountingRecord.update({
      where: { id: recordId },
      data: { normalized: { ...normalized, localClientInteractions: [...current, next] } as Prisma.InputJsonValue },
    });
  }

  private extractLocalClientInteractions(normalized: PlainRecord, files: Array<{ id: string; fileName: string; direction: string; sourceUrl?: string }>) {
    return this.asUnknownArray(normalized.localClientInteractions)
      .filter((item): item is PlainRecord => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
      .map((item, index) => {
        const requestedAttachments = this.asUnknownArray(item.attachments).filter((attachment): attachment is PlainRecord => Boolean(attachment && typeof attachment === 'object' && !Array.isArray(attachment)));
        const attachments = requestedAttachments.map((attachment) => {
          const fileName = this.safeFileName(this.text(attachment.fileName || attachment.name));
          const matched = files.find((file) => file.direction === 'OUTBOUND' && file.fileName === fileName);
          return {
            id: matched?.id || '',
            fileName: matched?.fileName || fileName,
            direction: 'OUTBOUND',
            sourceUrl: matched?.sourceUrl || '',
          };
        }).filter((attachment) => attachment.fileName);
        return {
          id: this.text(item.id) || `client-local-${index}`,
          title: this.text(item.title) || 'Mensagem enviada pelo cliente',
          text: this.text(item.text || item.message),
          author: this.text(item.author) || 'Cliente',
          date: this.text(item.date),
          status: this.text(item.status),
          kind: attachments.length ? 'file' : 'message',
          origin: 'client',
          attachments,
        };
      })
      .filter((item) => item.text || item.attachments.length || item.date);
  }

  private normalizeComparableText(value: string) {
    return this.text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private async storeOutboundAttachment(companyId: string, recordId: string | null, externalId: string, attachment: NormalizedAccountingAttachment) {
    const existing = await this.prisma.accountingFile.findFirst({ where: { recordId, companyId, provider: 'ACESSORIAS', area: 'requests', direction: 'OUTBOUND', externalId: externalId || null, fileName: attachment.fileName } });
    if (existing && this.existingStoredFilePath(existing.path)) return existing;
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

  private findAttachments(payload: unknown, seen = new Set<string>()): AccountingAttachmentRef[] {
    if (typeof payload === 'string') {
      const url = this.text(payload);
      if (/^https?:\/\//i.test(url) && !seen.has(url)) {
        seen.add(url);
        return [{ name: this.attachmentNameFromUrl(url), url }];
      }
      return [];
    }
    if (Array.isArray(payload)) return payload.flatMap((item) => this.findAttachments(item, seen));
    if (!payload || typeof payload !== 'object') return [];
    const record = payload as PlainRecord;
    const directUrl = this.text(record.Url || record.URL || record.Link || record.link || record.href || record.DownloadUrl || record.downloadUrl);
    const results: AccountingAttachmentRef[] = [];

    if (directUrl.startsWith('http') && !seen.has(directUrl)) {
      seen.add(directUrl);
      results.push({ name: this.text(record.Nome || record.name || record.fileName || record.Arquivo || record.Descricao) || 'arquivo.pdf', url: directUrl, record });
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

  private attachmentNameFromUrl(url: string) {
    try {
      const parsed = new URL(url);
      const name = parsed.pathname.split('/').filter(Boolean).pop() || '';
      if (name && /\.(pdf|xml|xlsx?|docx?|zip|csv|txt|png|jpe?g)$/i.test(name)) return name;
    } catch {
      return 'arquivo.pdf';
    }
    return 'arquivo';
  }

  private displayFileName(value: string) {
    let name = this.text(value).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    try {
      name = decodeURIComponent(name);
    } catch {
      // Mantem o nome original quando nao for URL-encoded valido.
    }
    name = name
      .replace(/_+\.(pdf|docx?|xlsx?|xml|zip|csv|txt|png|jpe?g)$/i, '.$1')
      .replace(/\.(pdf|docx?|xlsx?|xml|zip|csv|txt|png|jpe?g)_+\.\1$/i, '.$1')
      .replace(/\.pfx_+\.bin$/i, '.pfx')
      .replace(/\.pdf_+\.pdf$/i, '.pdf')
      .replace(/__+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return name || 'arquivo.pdf';
  }

  private hashText(value: string) {
    return createHash('sha1').update(value || randomUUID()).digest('hex').slice(0, 16);
  }

  private extensionForDownloadedFile(mimeType: string, buffer: Buffer) {
    const header = buffer.subarray(0, 64);
    if (header.subarray(0, 5).toString('utf8') === '%PDF-') return '.pdf';
    if (header.subarray(0, 2).toString('utf8') === 'PK') return '.zip';
    if (header.toString('utf8').trimStart().startsWith('<')) return '.xml';
    return this.extensionForMime(mimeType);
  }

  private extensionForMime(mimeType: string) {
    const type = this.text(mimeType).toLowerCase();
    if (type.includes('pdf')) return '.pdf';
    if (type.includes('xml')) return '.xml';
    if (type.includes('spreadsheet') || type.includes('excel')) return '.xlsx';
    if (type.includes('zip')) return '.zip';
    if (type.includes('png')) return '.png';
    if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
    return '.bin';
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
