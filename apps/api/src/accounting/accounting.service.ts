import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CompanyUserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CompanyPermissionKey, hasAnyCompanyPermission } from '../permissions/company-permissions';
import { AcessoriasApiService } from './acessorias-api.service';

type PlainRecord = Record<string, any>;

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService, private readonly acessorias: AcessoriasApiService) {}

  async listDocuments(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.documents.view');
    const result = await this.loadDeliveries(company.cnpj, query);
    return {
      source: 'ACESSORIAS',
      page: this.page(query),
      items: result.map((item) => this.deliveryToDocument(item)),
    };
  }

  async listTaxes(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.taxes.view');
    const result = await this.loadDeliveries(company.cnpj, query);
    return {
      source: 'ACESSORIAS',
      page: this.page(query),
      items: result.map((item) => this.deliveryToTax(item)),
    };
  }

  async listRequests(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.requests.view');
    const payload = await this.acessorias.listRequests({ Pagina: this.page(query), ...this.requestDateFilters(query) });
    return {
      source: 'ACESSORIAS',
      page: this.page(query),
      items: this.asArray(payload).filter((item) => this.sameDocument(item.EmpCNPJ, company.cnpj)).map((item) => ({
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
        officeResponsibles: this.asArray(item.SolOfficeResp).map((value) => this.text(value)).filter(Boolean),
        companyResponsibles: this.asArray(item.SolEmpResp).map((value) => this.text(value)).filter(Boolean),
      })),
    };
  }

  async listProcesses(userId: string, accountRole: AccountRole, companyId: string, query: any) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'accounting.processes.view');
    const payload = await this.acessorias.listProcesses({ Pagina: this.page(query), ...this.processDateFilters(query) });
    return {
      source: 'ACESSORIAS',
      page: this.page(query),
      items: this.asArray(payload).filter((item) => this.sameDocument(item.EmpCNPJ, company.cnpj)).map((item) => ({
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
      })),
    };
  }

  private async loadDeliveries(cnpj: string, query: any) {
    const dates = this.deliveryDateRange(query);
    const payload = await this.acessorias.listDeliveries(cnpj, {
      DtInitial: dates.startDate,
      DtFinal: dates.endDate,
      Pagina: this.page(query),
      attachments: 'S',
      config: 'S',
      situation: query?.status,
      department_id: query?.departmentId,
    });
    return this.asArray(payload).flatMap((company) => this.asArray(company?.Entregas).map((delivery) => ({ company, delivery })));
  }

  private deliveryToDocument(entry: { company: PlainRecord; delivery: PlainRecord }) {
    const attachment = this.findAttachment(entry.delivery);
    return {
      id: this.text(entry.delivery.Config?.EntID || entry.delivery.ID || entry.delivery.Nome),
      description: this.text(entry.delivery.Nome),
      dueDate: this.text(entry.delivery.EntDtPrazo),
      delayDate: this.text(entry.delivery.EntDtAtraso),
      sentAt: this.zeroDateToEmpty(entry.delivery.EntDtEntrega),
      status: this.text(entry.delivery.Status),
      department: this.text(entry.delivery.Config?.DptoNome || entry.delivery.DptoNome),
      responsible: this.text(entry.delivery.Config?.RespEntrega || entry.delivery.Config?.RespPrazo),
      companyName: this.text(entry.company.Razao),
      downloadUrl: attachment.url,
      fileName: attachment.name,
    };
  }

  private deliveryToTax(entry: { company: PlainRecord; delivery: PlainRecord }) {
    const document = this.deliveryToDocument(entry);
    return {
      ...document,
      competence: this.text(entry.delivery.EntCompetencia),
      guideRead: this.text(entry.delivery.EntGuiaLida),
      fine: this.text(entry.delivery.EntMulta) === 'S',
    };
  }

  private deliveryDateRange(query: any) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      startDate: this.isoDate(query?.startDate) || this.dateOnly(start),
      endDate: this.isoDate(query?.endDate) || this.dateOnly(now),
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

  private async ensureCompanyAccess(userId: string, accountRole: AccountRole, companyId: string, permission: CompanyPermissionKey) {
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

  private page(query: any) {
    const value = Number(query?.page || query?.Pagina || 1);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  }

  private asArray(value: unknown): PlainRecord[] {
    return Array.isArray(value) ? (value as PlainRecord[]) : [];
  }

  private text(value: unknown) {
    return value === undefined || value === null ? '' : String(value).trim();
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

  private zeroDateToEmpty(value: unknown) {
    const text = this.text(value);
    return text === '0000-00-00' ? '' : text;
  }

  private findAttachment(payload: unknown): { name: string; url: string } {
    if (!payload || typeof payload !== 'object') return { name: '', url: '' };
    const record = payload as PlainRecord;
    const directUrl = this.text(record.Url || record.URL || record.Link || record.link || record.href);
    if (directUrl.startsWith('http')) return { name: this.text(record.Nome || record.name || record.fileName), url: directUrl };
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
}
