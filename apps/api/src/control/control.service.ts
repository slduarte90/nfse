import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CompanyUserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CompanyPermissionKey, hasAnyCompanyPermission } from '../permissions/company-permissions';
import { EKontrollApiService } from './ekontroll-api.service';

type ControlDepartment = 'accounting' | 'tax' | 'payroll';

@Injectable()
export class ControlService {
  constructor(private readonly prisma: PrismaService, private readonly eKontroll: EKontrollApiService) {}

  async getOverview(userId: string, accountRole: AccountRole, companyId: string) {
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, 'control.overview.view');
    const methods = {
      accounting: process.env.EKONTROLL_METHOD_ACCOUNTING || '',
      tax: process.env.EKONTROLL_METHOD_TAX || '',
      payroll: process.env.EKONTROLL_METHOD_PAYROLL || '',
    };
    const missingMethods = Object.entries(methods).filter(([, value]) => !value).map(([key]) => key);
    const departments = await Promise.all((['accounting', 'tax', 'payroll'] as ControlDepartment[]).map(async (department) => {
      const method = methods[department];
      if (!method || !this.eKontroll.isConfigured()) return this.departmentPayload(department);
      try {
        const remoteData = await this.eKontroll.callMethod(method, this.companyParams(company));
        return this.departmentPayload(department, remoteData);
      } catch (error) {
        return this.departmentPayload(department, null, error instanceof Error ? error.message : 'Falha ao consultar os indicadores.');
      }
    }));
    return {
      source: 'EKONTROLL',
      configured: this.eKontroll.isConfigured(),
      company: { id: company.id, legalName: company.legalName, cnpj: company.cnpj },
      departments,
      api: {
        status: !this.eKontroll.isConfigured() ? 'missing-credentials' : missingMethods.length ? 'missing-methods' : 'configured',
        message: !this.eKontroll.isConfigured()
          ? 'Configure a chave de indicadores no backend para consultar dados reais.'
          : missingMethods.length
            ? 'Chave configurada, mas ainda faltam os métodos por departamento no backend.'
            : 'Indicadores configurados com métodos por departamento.',
        methods,
      },
    };
  }

  async getDepartment(userId: string, accountRole: AccountRole, companyId: string, department: string) {
    const normalized = this.normalizeDepartment(department);
    const company = await this.ensureCompanyAccess(userId, accountRole, companyId, this.permissionForDepartment(normalized));
    const configuredMethod = process.env[`EKONTROLL_METHOD_${normalized.toUpperCase()}`];
    let remoteData: unknown = null;
    let remoteError = '';
    if (configuredMethod && this.eKontroll.isConfigured()) {
      try {
        remoteData = await this.eKontroll.callMethod(configuredMethod, this.companyParams(company));
      } catch (error) {
        remoteError = error instanceof Error ? error.message : 'Falha ao consultar os indicadores.';
      }
    }
    return {
      source: 'EKONTROLL',
      configured: this.eKontroll.isConfigured(),
      method: configuredMethod || '',
      remoteData,
      remoteError,
      ...this.departmentPayload(normalized, remoteData, remoteError),
    };
  }

  private departmentPayload(department: ControlDepartment, remoteData: unknown = null, remoteError = '') {
    const catalog = {
      accounting: {
        title: 'Contábil',
        description: 'Indicadores para apresentações gerenciais de desempenho patrimonial e resultado.',
        indicators: [
          ['Receita bruta', 'Evolução mensal da receita e tendência do período.'],
          ['Resultado líquido', 'Lucro/prejuízo líquido e margem sobre receita.'],
          ['EBITDA', 'Capacidade operacional de geração de caixa.'],
          ['Liquidez corrente', 'Relação entre ativos e passivos de curto prazo.'],
          ['Endividamento', 'Participação de capital de terceiros no negócio.'],
          ['Despesas por centro', 'Composição das despesas administrativas e operacionais.'],
        ],
      },
      tax: {
        title: 'Fiscal',
        description: 'Indicadores para demonstrar carga tributária, obrigações e riscos fiscais.',
        indicators: [
          ['Carga tributária efetiva', 'Percentual de tributos sobre faturamento.'],
          ['Tributos por competência', 'Guias apuradas e pagas por mês.'],
          ['Créditos fiscais', 'Saldo e aproveitamento de créditos quando aplicável.'],
          ['Obrigações entregues', 'Entregas concluídas por competência e departamento.'],
          ['Pendências fiscais', 'Itens em aberto que podem gerar risco ou multa.'],
          ['Comparativo regime tributário', 'Visão para análise de enquadramento.'],
        ],
      },
      payroll: {
        title: 'Departamento pessoal',
        description: 'Indicadores de equipe, folha, admissões, desligamentos e encargos.',
        indicators: [
          ['Total de colaboradores', 'Quantidade ativa e evolução do quadro.'],
          ['Folha bruta', 'Custo mensal da folha e variação por competência.'],
          ['Encargos e provisões', 'INSS, FGTS, férias, 13º e demais provisões.'],
          ['Admissões e demissões', 'Movimentação de pessoal no período.'],
          ['Turnover', 'Índice de rotatividade para análise de estabilidade.'],
          ['Férias e afastamentos', 'Controle de vencimentos, gozos e afastamentos.'],
        ],
      },
    } as const;
    const data = catalog[department];
    const values = this.extractControlValues(remoteData);
    return {
      department,
      title: data.title,
      description: data.description,
      cards: this.controlCards(department, data.indicators, values, remoteData, remoteError),
      legacyCards: data.indicators.slice(0, 4).map(([name, description], index) => ({
        id: `${department}-${index}`,
        name,
        description,
        value: '-',
        trend: 'Aguardando integração do método de indicadores',
      })),
      indicators: data.indicators.map(([name, description], index) => ({ id: `${department}-indicator-${index}`, name, description })),
      charts: [
        { id: `${department}-evolution`, title: 'Evolução por competência', type: 'line', points: [] },
        { id: `${department}-composition`, title: 'Composição do período', type: 'bar', points: [] },
      ],
    };
  }

  private normalizeDepartment(value: string): ControlDepartment {
    const text = String(value || '').toLowerCase();
    if (['fiscal', 'tax'].includes(text)) return 'tax';
    if (['pessoal', 'payroll', 'dp'].includes(text)) return 'payroll';
    return 'accounting';
  }

  private controlCards(department: ControlDepartment, indicators: ReadonlyArray<readonly [string, string]>, values: Record<string, string>, remoteData: unknown, remoteError: string) {
    return indicators.slice(0, 4).map(([name, description], index) => ({
      id: `${department}-${index}`,
      name,
      description,
      value: values[this.normalizeKey(name)] || values[String(index)] || '-',
      trend: remoteError || (remoteData ? 'Dados recebidos dos indicadores' : 'Aguardando integracao do metodo de indicadores'),
    }));
  }

  private extractControlValues(remoteData: unknown) {
    const values: Record<string, string> = {};
    const visit = (value: unknown, depth = 0) => {
      if (!value || depth > 3) return;
      if (Array.isArray(value)) {
        value.slice(0, 12).forEach((item, index) => {
          if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>;
            const label = this.text(record.nome || record.name || record.indicador || record.indicator || record.titulo || record.title || record.descricao || record.description);
            const amount = this.text(record.valor || record.value || record.total || record.resultado || record.amount || record.quantidade || record.quantity);
            if (label && amount) values[this.normalizeKey(label)] = amount;
            if (amount) values[String(index)] = amount;
          } else if (item !== null && item !== undefined) {
            values[String(index)] = String(item);
          }
          visit(item, depth + 1);
        });
        return;
      }
      if (typeof value !== 'object') return;
      Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
        if (entry === null || entry === undefined) return;
        if (typeof entry !== 'object') values[this.normalizeKey(key)] = String(entry);
        else visit(entry, depth + 1);
      });
    };
    visit(remoteData);
    return values;
  }

  private companyParams(company: { id: string; cnpj: string; legalName: string }) {
    return {
      companyId: company.id,
      cnpj: this.onlyDigits(company.cnpj),
      document: this.onlyDigits(company.cnpj),
      legalName: company.legalName,
    };
  }

  private normalizeKey(value: unknown) {
    return this.text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
  }

  private onlyDigits(value: string) {
    return String(value || '').replace(/\D/g, '');
  }

  private text(value: unknown) {
    return value === undefined || value === null ? '' : String(value).trim();
  }

  private permissionForDepartment(department: ControlDepartment): CompanyPermissionKey {
    if (department === 'tax') return 'control.tax.view';
    if (department === 'payroll') return 'control.payroll.view';
    return 'control.accounting.view';
  }

  private async ensureCompanyAccess(userId: string, accountRole: AccountRole, companyId: string, permission: CompanyPermissionKey) {
    if (accountRole === AccountRole.ADMIN) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, cnpj: true, legalName: true } });
      if (!company) throw new NotFoundException('Empresa não encontrada.');
      return company;
    }
    const link = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { role: true, permissions: true, status: true, company: { select: { id: true, cnpj: true, legalName: true, isActive: true } } },
    });
    if (!link || !link.company.isActive || link.status !== CompanyUserStatus.ACTIVE) throw new ForbiddenException('Acesso não autorizado à empresa.');
    if (!hasAnyCompanyPermission(link.role, link.permissions, [permission])) throw new ForbiddenException('Acesso não autorizado para esta funcionalidade.');
    return link.company;
  }
}
