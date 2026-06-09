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
    return {
      source: 'EKONTROLL',
      configured: this.eKontroll.isConfigured(),
      company: { id: company.id, legalName: company.legalName, cnpj: company.cnpj },
      departments: ['accounting', 'tax', 'payroll'].map((department) => this.departmentPayload(department as ControlDepartment)),
      api: {
        status: this.eKontroll.isConfigured() ? 'configured' : 'missing-credentials',
        message: this.eKontroll.isConfigured()
          ? 'E-Kontroll configurado no backend. Os métodos oficiais podem ser vinculados por departamento conforme liberação da e-API.'
          : 'Configure EKONTROLL_API_KEY no backend para consultar dados reais.',
      },
    };
  }

  async getDepartment(userId: string, accountRole: AccountRole, companyId: string, department: string) {
    const normalized = this.normalizeDepartment(department);
    await this.ensureCompanyAccess(userId, accountRole, companyId, this.permissionForDepartment(normalized));
    const configuredMethod = process.env[`EKONTROLL_METHOD_${normalized.toUpperCase()}`];
    let remoteData: unknown = null;
    let remoteError = '';
    if (configuredMethod && this.eKontroll.isConfigured()) {
      try {
        remoteData = await this.eKontroll.callMethod(configuredMethod, { companyId });
      } catch (error) {
        remoteError = error instanceof Error ? error.message : 'Falha ao consultar E-Kontroll.';
      }
    }
    return {
      source: 'EKONTROLL',
      configured: this.eKontroll.isConfigured(),
      method: configuredMethod || '',
      remoteData,
      remoteError,
      ...this.departmentPayload(normalized),
    };
  }

  private departmentPayload(department: ControlDepartment) {
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
    return {
      department,
      title: data.title,
      description: data.description,
      cards: data.indicators.slice(0, 4).map(([name, description], index) => ({
        id: `${department}-${index}`,
        name,
        description,
        value: '-',
        trend: 'Aguardando integração do método E-Kontroll',
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
