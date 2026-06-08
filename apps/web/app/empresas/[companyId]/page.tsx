'use client';

import { ChangeEvent, FormEvent, Fragment, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import '../../company-module.css';
import '../../nfse-module.css';

const apiBase = 'http://localhost:3333';
const pageSizeOptions = [20, 50, 100];

type AccountRole = 'ADMIN' | 'USER';
type CompanyRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'ADMIN_VIEW';
type CompanyPermission =
  | 'nfse.invoices.view'
  | 'nfse.invoices.create'
  | 'nfse.invoices.edit'
  | 'nfse.invoices.delete'
  | 'nfse.invoices.transmit'
  | 'nfse.invoices.sync'
  | 'nfse.takers.view'
  | 'nfse.takers.create'
  | 'nfse.takers.edit'
  | 'nfse.takers.delete'
  | 'nfse.settings.view'
  | 'nfse.settings.edit'
  | 'nfse.settings.delete'
  | 'accounting.documents.view'
  | 'accounting.documents.edit'
  | 'accounting.documents.delete'
  | 'accounting.taxes.view'
  | 'accounting.taxes.edit'
  | 'accounting.taxes.delete'
  | 'accounting.requests.view'
  | 'accounting.requests.edit'
  | 'accounting.requests.delete'
  | 'accounting.processes.view'
  | 'accounting.processes.edit'
  | 'accounting.processes.delete';
type ModuleSection = 'home' | 'settings' | 'nfse-takers' | 'nfse-list' | 'nfse-recurring' | 'nfse-params' | 'accounting-documents' | 'accounting-taxes' | 'accounting-requests' | 'accounting-processes' | 'control-overview' | 'control-accounting' | 'control-tax' | 'control-payroll';
type InvoiceStatus = 'DRAFT' | 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED';
type MessageTone = 'success' | 'error';
type SortDirection = 'asc' | 'desc';
type SortState = { key: string; direction: SortDirection };
type ApiRequester = <T>(path: string, options?: RequestInit) => Promise<T>;

type StoredUser = { id: string; name: string; email: string; accountRole: AccountRole };
type Company = { id: string; legalName: string; tradeName?: string | null; cnpj: string; city: string; state: string; taxRegime: string; role: CompanyRole; permissions?: CompanyPermission[] };
type Customer = { id: string; name: string; document: string; email?: string | null; phone?: string | null; city?: string | null; state?: string | null; address?: string | null; number?: string | null; neighborhood?: string | null; zipCode?: string | null; municipalRegistration?: string | null; stateRegistration?: string | null; country?: string | null; isForeign?: boolean; isActive?: boolean; _count?: { invoices?: number } };
type NfseServiceItem = { id: string; name: string; nationalTaxCode: string; municipalServiceCode?: string | null; cityServiceCode?: string | null; cnae?: string | null; nbsCode?: string | null; ibsCbsTaxClassCode?: string | null; ibsCbsOperationCode?: string | null; issRate?: string | number | null; description?: string | null; isDefault?: boolean; isIssWithheld?: boolean; isActive?: boolean; _count?: { invoices?: number } };
type NfseSettings = { environment?: string; apiBaseUrl?: string | null; apiVersion?: string | null; municipalIbgeCode?: string | null; municipalRegistration?: string | null; taxRegime?: string; specialTaxRegime?: string | null; isSimpleNational?: boolean; hasFiscalIncentive?: boolean; defaultIssWithheld?: boolean; defaultOperationNature?: string | null; defaultRpsSeries?: string | null };
type CertificateSummary = { id: string; originalFileName: string; subjectName?: string | null; issuerName?: string | null; serialNumber?: string | null; validFrom?: string | null; validUntil?: string | null; status: string; createdAt: string };
type HomologationCheckStatus = 'READY' | 'PENDING' | 'WARNING';
type HomologationCheckItem = { id: string; title: string; status: HomologationCheckStatus; severity: 'blocking' | 'attention' | 'manual'; message: string; action: string };
type HomologationChecklist = { ready: boolean; readyCount: number; totalCount: number; blockingCount: number; generatedAt: string; nextStep: string; api: { environment: string; baseUrl: string; suggestedBaseUrl: string; docsUrl: string }; items: HomologationCheckItem[] };
type NfseInvoice = { id: string; number?: string | null; accessKey?: string | null; status: InvoiceStatus; amount: string | number; serviceDescription: string; serviceCode?: string | null; nationalTaxCode?: string | null; municipalServiceCode?: string | null; municipalIbgeCode?: string | null; competenceDate?: string | null; operationNature?: string | null; issRate?: string | number | null; issWithheld?: boolean; additionalInformation?: string | null; issuedAt?: string | null; createdAt: string; updatedAt?: string | null; createdByName?: string | null; updatedByName?: string | null; transmittedByName?: string | null; errorMessage?: string | null; customer?: Customer | null; service?: NfseServiceItem | null };
type NfseRecurrence = { id: string; frequency: string; interval: number; startDate: string; nextRunAt: string; endDate?: string | null; status: string; amount: string | number; issRate?: string | number | null; serviceDescription: string; nationalTaxCode?: string | null; municipalServiceCode?: string | null; municipalIbgeCode?: string | null; customer?: Customer | null; service?: NfseServiceItem | null; lastRunAt?: string | null };
type DeleteInvoiceResponse = { deletedId?: string; deletedIds?: string[]; nextNumber: number };
type InvoiceListResponse = { items: NfseInvoice[]; total: number; page: number; pageSize: number; totalPages: number };
type ReportResponse = { fileName: string; mimeType: string; contentBase64: string };
type StoredFile = { fileName: string; path: string; kind: 'XML' | 'PDF'; mimeType?: string; contentBase64?: string };
type DownloadableStoredFile = StoredFile & { contentBase64: string };
type IbgeMunicipality = { id: number; nome: string; microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } };
type ZipEntry = { name: string; content: string | Uint8Array };
type AccountingDocumentItem = { id: string; cacheId?: string; description: string; dueDate?: string; delayDate?: string; sentAt?: string; status?: string; department?: string; responsible?: string; companyName?: string; downloadUrl?: string; fileName?: string; localFileId?: string; localFileName?: string; localFiles?: Array<{ id: string; fileName: string; direction?: string; mimeType?: string }>; localFileCount?: number };
type AccountingTaxItem = AccountingDocumentItem & { competence?: string; guideRead?: string; fine?: boolean };
type AccountingRequestItem = { id: string; cacheId?: string; subject: string; status?: string; type?: string; priority?: string; openedAt?: string; dueDate?: string; updatedAt?: string; department?: string; officeResponsibles?: string[]; companyResponsibles?: string[]; localFileId?: string; localFileName?: string; localFiles?: Array<{ id: string; fileName: string; direction?: string; mimeType?: string }>; localFileCount?: number };
type AccountingProcessItem = { id: string; cacheId?: string; name: string; creator?: string; manager?: string; status?: string; percentage?: string; startedAt?: string; completedAt?: string; updatedAt?: string; department?: string };
type AccountingArea = 'documents' | 'taxes' | 'requests' | 'processes';
type AccountingDetailFile = { id: string; fileName: string; mimeType?: string; direction?: string; sourceUrl?: string; sizeBytes?: number; downloadedAt?: string };
type AccountingDetailHistoryItem = { id: string; title: string; text?: string; author?: string; date?: string; status?: string; kind?: string; origin?: 'client' | 'office' | 'system' | string; attachments?: AccountingDetailFile[] };
type AccountingDetailStep = { id: string; title: string; status?: string; date?: string; responsible?: string; percentage?: string };
type AccountingDetailResponse = { source: 'ACESSORIAS'; area: AccountingArea; id: string; cacheId: string; title: string; description?: string; status?: string; department?: string; dueDate?: string; sentAt?: string; openedAt?: string; updatedAt?: string; syncedAt?: string; history: AccountingDetailHistoryItem[]; steps: AccountingDetailStep[]; files: AccountingDetailFile[]; statusHint?: string; canReply?: boolean; canReopen?: boolean; canEvaluate?: boolean; rating?: { score: number; comment?: string; evaluatedAt?: string } | null };
type AccountingListResponse<T> = { source: 'ACESSORIAS'; page: number; pageSize: number; total: number; totalPages: number; items: T[] };
type AccountingFileResponse = { id: string; fileName: string; mimeType: string; contentBase64: string };
type AccountingDepartment = { id: string; name: string; responsibleName?: string; responsibleEmail?: string };
type AccountingDepartmentResponse = { source: 'ACESSORIAS'; items: AccountingDepartment[] };
type ControlIndicator = { id: string; name: string; description: string; value?: string; trend?: string };
type ControlDepartmentData = { department: string; title: string; description: string; cards: ControlIndicator[]; indicators: ControlIndicator[]; charts: Array<{ id: string; title: string; type: string; points: unknown[] }> };
type ControlOverviewResponse = { source: 'EKONTROLL'; configured: boolean; company?: { id: string; legalName: string; cnpj: string }; departments: ControlDepartmentData[]; api?: { status: string; message: string } };
type AccountingData = {
  documents: AccountingDocumentItem[];
  taxes: AccountingTaxItem[];
  requests: AccountingRequestItem[];
  processes: AccountingProcessItem[];
};

type TakerForm = {
  name: string;
  document: string;
  email: string;
  phone: string;
  municipalRegistration: string;
  stateRegistration: string;
  zipCode: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
};

type InvoiceForm = {
  customerId: string;
  serviceId: string;
  competenceDate: string;
  municipalIbgeCode: string;
  serviceDescription: string;
  nationalTaxCode: string;
  municipalServiceCode: string;
  operationNature: string;
  amount: string;
  issRate: string;
  issWithheld: boolean;
  additionalInformation: string;
};

type RecurrenceForm = {
  customerId: string;
  serviceId: string;
  frequency: string;
  interval: string;
  startDate: string;
  endDate: string;
  amount: string;
  issRate: string;
  issWithheld: boolean;
  serviceDescription: string;
  nationalTaxCode: string;
  municipalServiceCode: string;
  municipalIbgeCode: string;
  additionalInformation: string;
};

const emptyTakerForm: TakerForm = {
  name: '',
  document: '',
  email: '',
  phone: '',
  municipalRegistration: '',
  stateRegistration: '',
  zipCode: '',
  address: '',
  number: '',
  neighborhood: '',
  city: '',
  state: '',
  country: 'Brasil',
};

type AccountingRequestAttachment = { fileName: string; mimeType: string; contentBase64: string; sizeBytes: number };

type AccountingRequestForm = {
  subject: string;
  departmentId: string;
  priority: string;
  dueDate: string;
  description: string;
  attachments: AccountingRequestAttachment[];
};
type AccountingReplyForm = { message: string; statusSol: 'R' | 'F'; reopen: boolean; attachments: AccountingRequestAttachment[] };
type AccountingEvaluationForm = { score: string; comment: string };

type CancelInvoiceForm = {
  reasonCode: string;
  reasonText: string;
};

const emptyInvoiceForm: InvoiceForm = {
  customerId: '',
  serviceId: '',
  competenceDate: '',
  municipalIbgeCode: '',
  serviceDescription: '',
  nationalTaxCode: '',
  municipalServiceCode: '',
  operationNature: '',
  amount: '',
  issRate: '',
  issWithheld: false,
  additionalInformation: '',
};

const emptyRecurrenceForm: RecurrenceForm = {
  customerId: '',
  serviceId: '',
  frequency: 'MONTHLY',
  interval: '01',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  amount: '',
  issRate: '',
  issWithheld: false,
  serviceDescription: '',
  nationalTaxCode: '',
  municipalServiceCode: '',
  municipalIbgeCode: '',
  additionalInformation: '',
};

const emptyAccountingRequestForm: AccountingRequestForm = {
  subject: '',
  departmentId: '',
  priority: '2',
  dueDate: '',
  description: '',
  attachments: [],
};
const emptyAccountingReplyForm: AccountingReplyForm = { message: '', statusSol: 'R', reopen: false, attachments: [] };
const emptyAccountingEvaluationForm: AccountingEvaluationForm = { score: '5', comment: '' };

const emptyCancelInvoiceForm: CancelInvoiceForm = {
  reasonCode: '2',
  reasonText: '',
};

const NFSE_NATIONAL_API_GAPS = [
  { title: 'Cancelamento por substituição', tip: 'Usar evento e105102 quando a nota substituta já existir e o município aceitar substituição.' },
  { title: 'Solicitação de análise fiscal', tip: 'Usar evento e101103 quando o cancelamento direto for bloqueado por prazo, valor ou regra municipal.' },
  { title: 'Manifestação de NFS-e', tip: 'Confirmação, rejeição e anulação por prestador, tomador ou intermediário via eventos e202/e203/e204.' },
  { title: 'Consulta específica de eventos', tip: 'Adicionar tela detalhada por tipo/sequência para auditoria fina dos eventos vinculados à chave.' },
  { title: 'Parametrização nacional', tip: 'Consultar convênio municipal e alíquotas oficiais por município, serviço e competência antes da emissão.' },
];
const SECTION_PERMISSIONS: Partial<Record<ModuleSection, CompanyPermission>> = {
  'nfse-list': 'nfse.invoices.view',
  'nfse-recurring': 'nfse.invoices.view',
  'nfse-takers': 'nfse.takers.view',
  'nfse-params': 'nfse.settings.view',
  settings: 'nfse.settings.view',
  'accounting-documents': 'accounting.documents.view',
  'accounting-taxes': 'accounting.taxes.view',
  'accounting-requests': 'accounting.requests.view',
  'accounting-processes': 'accounting.processes.view',
};

const encoder = new TextEncoder();

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatDocument(value: string) {
  const digits = onlyDigits(value);
  if (digits.length <= 11 && !/[a-z]/i.test(value)) return formatCpf(digits);
  if (digits.length <= 14 && !/[a-z]/i.test(value)) return formatCnpj(digits);
  return value;
}

function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

function roleLabel(role: string) {
  return ({ OWNER: 'Responsável', ADMIN: 'Administrador', OPERATOR: 'Operador', VIEWER: 'Visualizador', ADMIN_VIEW: 'Administrador' } as Record<string, string>)[role] || role;
}

function hasPermission(company: Company | null, permission: CompanyPermission) {
  if (!company) return false;
  if (company.role === 'ADMIN_VIEW') return true;
  return Boolean(company.permissions?.includes(permission));
}

function hasAnyPermission(company: Company | null, permissions: CompanyPermission[]) {
  return permissions.some((permission) => hasPermission(company, permission));
}

function canOpenSection(company: Company | null, section: ModuleSection) {
  const permission = SECTION_PERMISSIONS[section];
  return !permission || hasPermission(company, permission);
}

function firstAllowedSection(company: Company | null): ModuleSection {
  const sections: ModuleSection[] = ['nfse-list', 'nfse-recurring', 'nfse-takers', 'nfse-params', 'accounting-documents', 'accounting-taxes', 'accounting-requests', 'accounting-processes', 'control-overview'];
  return sections.find((section) => canOpenSection(company, section)) || 'home';
}

function invoiceStatusLabel(status: string) {
  return ({ DRAFT: 'Rascunho', PROCESSING: 'Processando', AUTHORIZED: 'Autorizada', REJECTED: 'Rejeitada', CANCELLED: 'Cancelada' } as Record<string, string>)[status] || status;
}

function recurrenceFrequencyLabel(frequency: string) {
  return ({ WEEKLY: 'Semanal', BIWEEKLY: 'Quinzenal', MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual' } as Record<string, string>)[frequency] || frequency;
}

function certificateStatusLabel(status?: string) {
  return ({ VALID: 'Válido', EXPIRED: 'Vencido', INVALID: 'Inválido', PENDING: 'Pendente', REVOKED: 'Desvinculado' } as Record<string, string>)[status || ''] || 'Não informado';
}

function isCertificateExpired(certificate?: CertificateSummary | null) {
  if (!certificate?.validUntil) return false;
  const validUntil = new Date(certificate.validUntil).getTime();
  return Number.isFinite(validUntil) && validUntil < Date.now();
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
}

function formatAccountingDate(value?: string | null) {
  if (!value || value === '0000-00-00') return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  return value;
}

function formatAccountingDateTime(value?: string | null) {
  if (!value || value === '0000-00-00') return '-';
  const brDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::\d{2})?)?/);
  if (brDate) return brDate[4] ? `${brDate[1]}/${brDate[2]}/${brDate[3]} às ${brDate[4]}:${brDate[5]}` : `${brDate[1]}/${brDate[2]}/${brDate[3]}`;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
  return value;
}

function parseDateFilterInput(value: string) {
  if (!value) return { iso: '', isComplete: false, isValid: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { iso: '', isComplete: true, isValid: false };

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const isValid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;

  return { iso: isValid ? value : '', isComplete: true, isValid };
}

function getDateFilterError(startValue: string, endValue: string) {
  const start = parseDateFilterInput(startValue);
  const end = parseDateFilterInput(endValue);
  if (!start.isValid || (start.isComplete && !start.iso)) return { field: 'start' as const, message: '' };
  if (!end.isValid || (end.isComplete && !end.iso)) return { field: 'end' as const, message: '' };
  if (start.iso && end.iso && end.iso < start.iso) return { field: 'end' as const, message: '' };
  return null;
}

function formatCurrency(value: string | number) {
  const amount = decimalToNumber(value, 2) ?? 0;
  if (!Number.isFinite(amount)) return String(value || '-');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

function normalizeDecimalParts(value?: string | number | null, precision = 2) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim().replace(/\s/g, '').replace(/[^\d,.]/g, '');
  if (!text) return '';

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let separatorIndex = Math.max(lastComma, lastDot);
  if (separatorIndex >= 0 && lastComma < 0 && lastDot >= 0) {
    const fractionCandidate = onlyDigits(text.slice(lastDot + 1));
    if (fractionCandidate.length > precision) separatorIndex = -1;
  }

  const integerDigits = onlyDigits(separatorIndex >= 0 ? text.slice(0, separatorIndex) : text);
  const fractionDigits = separatorIndex >= 0 ? onlyDigits(text.slice(separatorIndex + 1)).slice(0, precision) : '';
  return `${integerDigits || (fractionDigits ? '0' : '')}${separatorIndex >= 0 ? `,${fractionDigits}` : ''}`;
}

function decimalToApiString(value?: string | number | null, precision = 2) {
  const normalized = normalizeDecimalParts(value, precision);
  if (!normalized) return '';
  const [integerPart, fractionPart = ''] = normalized.split(',');
  return fractionPart ? `${integerPart || '0'}.${fractionPart}` : integerPart || '0';
}

function decimalToNumber(value?: string | number | null, precision = 2) {
  const apiValue = decimalToApiString(value, precision);
  if (!apiValue) return null;
  const amount = Number(apiValue);
  return Number.isFinite(amount) ? amount : null;
}

function formatDecimalForInput(value?: string | number | null, precision = 2, useGrouping = false) {
  const amount = decimalToNumber(value, precision);
  if (amount === null) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping,
  }).format(amount);
}

function formatMoneyForInput(value?: string | number | null) {
  return formatDecimalForInput(value, 2, true);
}

function formatMoneyCentsInput(value: string) {
  const digits = onlyDigits(value).replace(/^0+(?=\d)/, '').slice(0, 14);
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amount);
}

function formatDateForInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

type FieldErrors = Partial<Record<string, string>>;

function formatDecimalInput(value: string, precision = 2) {
  return normalizeDecimalParts(value, precision);
}

function isPositiveDecimal(value: string, precision = 2) {
  const amount = decimalToNumber(value, precision);
  return amount !== null && amount > 0;
}

function isValidDecimal(value: string, precision = 2) {
  if (!value.trim()) return true;
  const normalized = decimalToApiString(value, precision);
  return Boolean(normalized) && new RegExp(`^\\d+(\\.\\d{1,${precision}})?$`).test(normalized);
}

function isValidEmail(value: string) {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calcDigit = (base: string, factor: number) => {
    const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * (factor - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9]) && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calcDigit = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calcDigit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

function scrollToField(field: string) {
  setTimeout(() => {
    const target = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
  }, 0);
}

function sectionFromPath(pathname: string, companyId: string): ModuleSection {
  const base = `/empresas/${companyId}`;
  const suffix = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : '/';
  if (suffix === '/nfse/emissao') return 'nfse-list';
  if (suffix === '/nfse/tomadores') return 'nfse-takers';
  if (suffix === '/nfse/notas') return 'nfse-list';
  if (suffix === '/nfse/recorrente') return 'nfse-recurring';
  if (suffix === '/nfse/parametrizacao') return 'nfse-params';
  if (suffix === '/contabilidade/documentos') return 'accounting-documents';
  if (suffix === '/contabilidade/impostos') return 'accounting-taxes';
  if (suffix === '/contabilidade/solicitacoes') return 'accounting-requests';
  if (suffix === '/contabilidade/processos') return 'accounting-processes';
  if (suffix === '/controle') return 'control-overview';
  if (suffix === '/controle/contabil') return 'control-accounting';
  if (suffix === '/controle/fiscal') return 'control-tax';
  if (suffix === '/controle/departamento-pessoal') return 'control-payroll';
  if (suffix === '/configuracoes') return 'settings';
  return 'home';
}

function pathForSection(companyId: string, section: ModuleSection) {
  const base = `/empresas/${companyId}`;
  if (section === 'nfse-takers') return `${base}/nfse/tomadores`;
  if (section === 'nfse-list') return `${base}/nfse/notas`;
  if (section === 'nfse-recurring') return `${base}/nfse/recorrente`;
  if (section === 'nfse-params') return `${base}/nfse/parametrizacao`;
  if (section === 'accounting-documents') return `${base}/contabilidade/documentos`;
  if (section === 'accounting-taxes') return `${base}/contabilidade/impostos`;
  if (section === 'accounting-requests') return `${base}/contabilidade/solicitacoes`;
  if (section === 'accounting-processes') return `${base}/contabilidade/processos`;
  if (section === 'control-overview') return `${base}/controle`;
  if (section === 'control-accounting') return `${base}/controle/contabil`;
  if (section === 'control-tax') return `${base}/controle/fiscal`;
  if (section === 'control-payroll') return `${base}/controle/departamento-pessoal`;
  if (section === 'settings') return `${base}/configuracoes`;
  return base;
}

function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.75 10.75 12 4l8.25 6.75" /><path d="M5.75 9.5v9.25h4.6v-5.4h3.3v5.4h4.6V9.5" /></svg>;
}

function NoteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.75h7l3 3v13.5H7z" /><path d="M14 3.75v3h3" /><path d="M9.5 10h5" /><path d="M9.5 13h5" /><path d="M9.5 16h3" /></svg>;
}

function AccountingIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z" /><path d="M8 8h8" /><path d="M8 12h2" /><path d="M12 12h4" /><path d="M8 16h2" /><path d="M12 16h4" /></svg>;
}

function ControlIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5" /><path d="M4 19h16" /><path d="M7 15l3-3 3 2 5-6" /><path d="M15.5 8H18v2.5" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.85 1.85 0 0 0 .37 2.04l.07.07a2.22 2.22 0 1 1-3.14 3.14l-.07-.07a1.85 1.85 0 0 0-2.04-.37 1.85 1.85 0 0 0-1.12 1.7V21.7a2.22 2.22 0 1 1-4.44 0v-.1a1.85 1.85 0 0 0-1.12-1.7 1.85 1.85 0 0 0-2.04.37l-.07.07a2.22 2.22 0 1 1-3.14-3.14l.07-.07A1.85 1.85 0 0 0 4.1 15a1.85 1.85 0 0 0-1.7-1.12H2.3a2.22 2.22 0 1 1 0-4.44h.1a1.85 1.85 0 0 0 1.7-1.12 1.85 1.85 0 0 0-.37-2.04l-.07-.07A2.22 2.22 0 1 1 6.8 3.07l.07.07a1.85 1.85 0 0 0 2.04.37 1.85 1.85 0 0 0 1.12-1.7V1.7a2.22 2.22 0 1 1 4.44 0v.1a1.85 1.85 0 0 0 1.12 1.7 1.85 1.85 0 0 0 2.04-.37l.07-.07a2.22 2.22 0 1 1 3.14 3.14l-.07.07a1.85 1.85 0 0 0-.37 2.04 1.85 1.85 0 0 0 1.7 1.12h.1a2.22 2.22 0 1 1 0 4.44h-.1A1.85 1.85 0 0 0 19.4 15Z" /></svg>;
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{collapsed ? <><path d="m8 6 6 6-6 6" /><path d="m13 6 6 6-6 6" /></> : <><path d="m16 6-6 6 6 6" /><path d="m11 6-6 6 6 6" /></>}</svg>;
}

function MenuChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 7 6 6 6-6" /><path d="m6 12 6 6 6-6" /></svg>;
}

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5z" /><path d="m13.5 6 4.5 4.5" /></svg>;
}

function ArchiveIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M6 7v12h12V7" /><path d="M9 11h6" /></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M7 7l1 13h8l1-13" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>;
}

function RestoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.35-5.65" /><path d="M4 5.5v5h5" /></svg>;
}

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.35-4.85L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.35 4.85L20 16" /><path d="M20 20v-4h-4" /></svg>;
}

function CancelInvoiceIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /><path d="M8 8l8 8" /><path d="M16 8l-8 8" /></svg>;
}
function PdfFileIcon() {
  return <svg className="nfse-file-symbol nfse-file-symbol--pdf" viewBox="0 0 28 32" aria-hidden="true"><path d="M5 2h12l6 6v22H5z" /><path d="M17 2v7h6" /><path d="M8 22c4-9 7-10 12-2" /><path d="M10 20c3 1 6 1 10-1" /></svg>;
}

function XmlFileIcon() {
  return <svg className="nfse-file-symbol nfse-file-symbol--xml" viewBox="0 0 28 32" aria-hidden="true"><path d="M5 2h12l6 6v22H5z" /><path d="M17 2v7h6" /><path d="m12 16-3 3 3 3" /><path d="m16 16 3 3-3 3" /><path d="m15 14-2 10" /></svg>;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function municipalityUf(city: IbgeMunicipality) {
  return city.microrregiao?.mesorregiao?.UF?.sigla || '';
}

function municipalityLabel(city: IbgeMunicipality) {
  return `${city.nome}/${municipalityUf(city)} - ${city.id}`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:.*;base64,/, ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 KB';
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  return `${Math.ceil(sizeBytes / 1024).toLocaleString('pt-BR')} KB`;
}
function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function writeUint16(buffer: number[], value: number) {
  buffer.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(buffer: number[], value: number) {
  buffer.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createZip(entries: ZipEntry[]) {
  const output: number[] = [];
  const centralDirectory: number[] = [];

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const contentBytes = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    const checksum = crc32(contentBytes);
    const localHeaderOffset = output.length;

    writeUint32(output, 0x04034b50);
    writeUint16(output, 20);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint32(output, checksum);
    writeUint32(output, contentBytes.length);
    writeUint32(output, contentBytes.length);
    writeUint16(output, nameBytes.length);
    writeUint16(output, 0);
    output.push(...nameBytes);
    for (const byte of contentBytes) output.push(byte);

    writeUint32(centralDirectory, 0x02014b50);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, checksum);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint16(centralDirectory, nameBytes.length);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, 0);
    writeUint32(centralDirectory, localHeaderOffset);
    centralDirectory.push(...nameBytes);
  });

  const centralDirectoryOffset = output.length;
  output.push(...centralDirectory);
  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, entries.length);
  writeUint16(output, entries.length);
  writeUint32(output, centralDirectory.length);
  writeUint32(output, centralDirectoryOffset);
  writeUint16(output, 0);

  return new Blob([new Uint8Array(output)], { type: 'application/zip' });
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Message({ text, tone = 'success' }: { text: string; tone?: MessageTone }) {
  if (!text) return null;
  return <p className="nfse-settings-clean__message" data-tone={tone}>{text}</p>;
}

  function nextSortState(current: SortState, key: string): SortState {
    if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    return { key, direction: 'asc' };
  }

  function renderSortButton(label: string, key: string, state: SortState, onSort: (key: string) => void) {
    const isActive = state.key === key;
    return (
      <button className={`nfse-sort-button ${isActive ? 'is-active' : ''}`} type="button" onClick={() => onSort(key)} aria-label={`Ordenar por ${label}`}>
        <span>{label}</span>
        <span className={`nfse-sort-button__icon ${isActive ? `is-${state.direction}` : 'is-neutral'}`} aria-hidden="true" />
      </button>
    );
  }

  function sortServices(items: NfseServiceItem[], state: SortState) {
    const direction = state.direction === 'desc' ? -1 : 1;
    return [...items].sort((left, right) => {
      const value = (service: NfseServiceItem) => {
        if (state.key === 'default') return service.isDefault ? '0' : '1';
        if (state.key === 'nationalTaxCode') return service.nationalTaxCode || '';
        if (state.key === 'issRate') return Number(service.issRate ?? -1);
        return service.name || '';
      };
      const leftValue = value(left);
      const rightValue = value(right);
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction;
      return String(leftValue).localeCompare(String(rightValue), 'pt-BR', { numeric: true, sensitivity: 'base' }) * direction;
    });
  }
function SettingsSection({ companyId, company, requestApi, services, reloadServices, canEdit, canDelete }: { companyId: string; company: Company; requestApi: ApiRequester; services: NfseServiceItem[]; reloadServices: () => Promise<unknown>; canEdit: boolean; canDelete: boolean }) {
  const [settings, setSettings] = useState<NfseSettings | null>(null);
  const [certificate, setCertificate] = useState<CertificateSummary | null>(null);
  const [homologationChecklist, setHomologationChecklist] = useState<HomologationChecklist | null>(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('success');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState('');
  const [settingsErrors, setSettingsErrors] = useState<FieldErrors>({});
  const [municipalitySearch, setMunicipalitySearch] = useState('');
  const [municipalities, setMunicipalities] = useState<IbgeMunicipality[]>([]);
  const [municipalitySuggestions, setMunicipalitySuggestions] = useState<IbgeMunicipality[]>([]);
  const [serviceForm, setServiceForm] = useState({ name: '', nationalTaxCode: '', municipalServiceCode: '', cnae: '', nbsCode: '', ibsCbsTaxClassCode: '', ibsCbsOperationCode: '', issRate: '' });
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [inactiveServices, setInactiveServices] = useState<NfseServiceItem[]>([]);
  const [serviceSort, setServiceSort] = useState<SortState>({ key: 'default', direction: 'asc' });
  const [inactiveServiceSort, setInactiveServiceSort] = useState<SortState>({ key: 'name', direction: 'asc' });
  const [showInactiveServices, setShowInactiveServices] = useState(false);
  const [isLoadingInactiveServices, setIsLoadingInactiveServices] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setIsLoading(true);
      setMessage('');
      try {
        const [settingsData, certificateData, checklistData] = await Promise.all([
          requestApi<NfseSettings>(`/companies/${companyId}/nfse/settings`),
          requestApi<{ certificate: CertificateSummary | null }>(`/companies/${companyId}/nfse/settings/certificate`),
          requestApi<HomologationChecklist>(`/companies/${companyId}/nfse/settings/homologation-checklist`),
          reloadServices(),
        ]);
        if (!mounted) return;
        setSettings(settingsData);
        void hydrateMunicipalitySearch(settingsData.municipalIbgeCode || '');
        setCertificate(certificateData.certificate || null);
        setHomologationChecklist(checklistData);
      } catch (error) {
        if (!mounted) return;
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as configurações.');
        setMessageTone('error');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [companyId]);

  async function loadMunicipalities() {
    if (municipalities.length) return municipalities;
    const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
    const data = (await response.json()) as IbgeMunicipality[];
    setMunicipalities(data);
    return data;
  }

  async function searchMunicipalities(term: string) {
    setMunicipalitySearch(term);
    if (term.trim().length < 3) {
      setMunicipalitySuggestions([]);
      return;
    }
    const key = normalize(term);
    try {
      const data = await loadMunicipalities();
      const startsWith = data.filter((city) => normalize(city.nome).startsWith(key));
      const contains = data.filter((city) => !normalize(city.nome).startsWith(key) && normalize(city.nome).includes(key));
      setMunicipalitySuggestions([...startsWith, ...contains].slice(0, 12));
    } catch {
      setMunicipalitySuggestions([]);
    }
  }

  async function hydrateMunicipalitySearch(ibgeCode: string) {
    const code = onlyDigits(ibgeCode || '');
    if (code.length !== 7) {
      setMunicipalitySearch('');
      return;
    }
    try {
      const data = await loadMunicipalities();
      const city = data.find((item) => String(item.id) === code);
      setMunicipalitySearch(city ? `${city.nome}/${municipalityUf(city)}` : code);
    } catch {
      setMunicipalitySearch(code);
    }
  }

  async function loadInactiveServices() {
    setIsLoadingInactiveServices(true);
    try {
      const data = await requestApi<NfseServiceItem[]>(`/companies/${companyId}/nfse/services?status=inactive`);
      setInactiveServices(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os serviços inativos.');
      setMessageTone('error');
    } finally {
      setIsLoadingInactiveServices(false);
    }
  }

  async function refreshHomologationChecklist(showSuccess = false) {
    try {
      const data = await requestApi<HomologationChecklist>(`/companies/${companyId}/nfse/settings/homologation-checklist`);
      setHomologationChecklist(data);
      if (showSuccess) {
        setMessage('Ambiente selecionado atualizado.');
        setMessageTone('success');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o ambiente selecionado.');
      setMessageTone('error');
    }
  }

  async function toggleInactiveServices() {
    const next = !showInactiveServices;
    setShowInactiveServices(next);
    if (next) await loadInactiveServices();
  }

  function updateSetting<K extends keyof NfseSettings>(key: K, value: NfseSettings[K]) {
    setSettings((current) => ({ ...(current || {}), [key]: value }));
    setSettingsErrors((current) => ({ ...current, [key]: undefined }));
  }

  function reportSettingsError(field: string, text: string) {
    setMessage(text);
    setMessageTone('error');
    setSettingsErrors({ [field]: text });
    scrollToField(field);
  }

  async function saveSettings() {
    if (!canDelete) return;
    if (!settings) return;
    const ibge = onlyDigits(settings.municipalIbgeCode || '');
    if (ibge.length !== 7) {
      reportSettingsError('settings-municipality', 'Selecione o município para preencher um código IBGE válido com 7 dígitos.');
      return;
    }
    setIsSaving(true);
    setMessage('');
    setSettingsErrors({});
    try {
      const payload = {
        environment: settings.environment || 'PRODUCTION_RESTRICTED',
        apiBaseUrl: settings.apiBaseUrl || '',
        apiVersion: settings.apiVersion || '',
        municipalIbgeCode: ibge,
        municipalRegistration: settings.municipalRegistration || '',
        taxRegime: settings.taxRegime || 'SIMPLE_NATIONAL',
        specialTaxRegime: settings.specialTaxRegime || '',
        isSimpleNational: Boolean(settings.isSimpleNational) || settings.taxRegime === 'SIMPLE_NATIONAL' || settings.taxRegime === 'MEI',
        hasFiscalIncentive: Boolean(settings.hasFiscalIncentive),
        defaultIssWithheld: Boolean(settings.defaultIssWithheld),
        defaultRpsSeries: settings.defaultRpsSeries || '',
      };
      const updated = await requestApi<NfseSettings>(`/companies/${companyId}/nfse/settings`, { method: 'PATCH', body: JSON.stringify(payload) });
      setSettings(updated);
      await refreshHomologationChecklist();
      setMessage('Configurações salvas com sucesso.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar as configurações.');
      setMessageTone('error');
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadCertificate() {
    if (!canDelete) return;
    if (!certificateFile) {
      reportSettingsError('certificate-file', 'Selecione o certificado .pfx ou .p12.');
      return;
    }
    if (!certificatePassword) {
      reportSettingsError('certificate-password', 'Informe a senha do certificado.');
      return;
    }
    setIsUploading(true);
    setMessage('');
    setSettingsErrors({});
    try {
      const fileBase64 = await fileToBase64(certificateFile);
      const result = await requestApi<{ certificate: CertificateSummary | null; settings: NfseSettings }>(`/companies/${companyId}/nfse/settings/certificate`, {
        method: 'POST',
        body: JSON.stringify({ fileName: certificateFile.name, fileBase64, password: certificatePassword }),
      });
      setCertificate(result.certificate || null);
      setSettings(result.settings);
      setCertificatePassword('');
      setCertificateFile(null);
      await refreshHomologationChecklist();
      setMessage('Certificado enviado e vinculado a empresa.');
      setMessageTone('success');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Não foi possível enviar o certificado.';
      reportSettingsError(text.toLowerCase().includes('senha') && !text.toLowerCase().includes('arquivo') ? 'certificate-password' : 'certificate-file', text);
    } finally {
      setIsUploading(false);
    }
  }

  async function unlinkCertificate() {
    if (!canDelete) return;
    setIsUploading(true);
    setMessage('');
    setSettingsErrors({});
    try {
      const result = await requestApi<{ certificate: CertificateSummary | null; settings: NfseSettings | null }>(`/companies/${companyId}/nfse/settings/certificate`, { method: 'DELETE' });
      setCertificate(result.certificate || null);
      if (result.settings) setSettings(result.settings);
      setCertificateFile(null);
      setCertificatePassword('');
      await refreshHomologationChecklist();
      setMessage('Certificado desvinculado e anexo anterior removido.');
      setMessageTone('success');
    } catch (error) {
      reportSettingsError('certificate-file', error instanceof Error ? error.message : 'Não foi possível desvincular o certificado.');
    } finally {
      setIsUploading(false);
    }
  }

  function resetServiceForm() {
    setEditingServiceId(null);
    setServiceForm({ name: '', nationalTaxCode: '', municipalServiceCode: '', cnae: '', nbsCode: '', ibsCbsTaxClassCode: '', ibsCbsOperationCode: '', issRate: '' });
    setSettingsErrors((current) => ({
      ...current,
      'service-name': undefined,
      'service-national-code': undefined,
      'service-iss-rate': undefined,
    }));
  }

  function startEditService(service: NfseServiceItem) {
    if (!canDelete) return;
    setEditingServiceId(service.id);
    setServiceForm({
      name: service.name || '',
      nationalTaxCode: service.nationalTaxCode || '',
      municipalServiceCode: service.municipalServiceCode || '',
      cnae: service.cnae || '',
      nbsCode: service.nbsCode || '',
      ibsCbsTaxClassCode: service.ibsCbsTaxClassCode || '',
      ibsCbsOperationCode: service.ibsCbsOperationCode || '',
      issRate: formatDecimalForInput(service.issRate),
    });
    setSettingsErrors({});
    scrollToField('service-form');
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setMessage('');
    setSettingsErrors({});
    if (!serviceForm.name.trim()) {
      reportSettingsError('service-name', 'Informe a descrição do serviço.');
      return;
    }
    if (!serviceForm.nationalTaxCode.trim()) {
      reportSettingsError('service-national-code', 'Informe o código de tributação nacional.');
      return;
    }
    if (!isValidDecimal(serviceForm.issRate)) {
      reportSettingsError('service-iss-rate', 'Alíquota ISS inválida. Use somente números e vírgula.');
      return;
    }
    try {
      const payload = { ...serviceForm, description: '', issRate: decimalToApiString(serviceForm.issRate), ...(editingServiceId ? {} : { isDefault: services.length === 0 }) };
      await requestApi<NfseServiceItem>(
        editingServiceId ? `/companies/${companyId}/nfse/services/${editingServiceId}` : `/companies/${companyId}/nfse/services`,
        {
          method: editingServiceId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      resetServiceForm();
      await reloadServices();
      if (showInactiveServices) await loadInactiveServices();
      await refreshHomologationChecklist();
      setMessage(editingServiceId ? 'Serviço atualizado com sucesso.' : 'Serviço cadastrado com sucesso.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : editingServiceId ? 'Não foi possível atualizar o serviço.' : 'Não foi possível cadastrar o serviço.');
      setMessageTone('error');
    }
  }

  async function setDefaultService(serviceId: string) {
    if (!canEdit) return;
    try {
      await requestApi<NfseServiceItem>(`/companies/${companyId}/nfse/services/${serviceId}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) });
      await reloadServices();
      if (showInactiveServices) await loadInactiveServices();
      await refreshHomologationChecklist();
      setMessage('Serviço padrão atualizado.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o serviço padrão.');
      setMessageTone('error');
    }
  }

  async function deleteService(serviceId: string) {
    if (!canDelete) return;
    try {
      await requestApi<NfseServiceItem>(`/companies/${companyId}/nfse/services/${serviceId}`, { method: 'DELETE' });
      if (editingServiceId === serviceId) resetServiceForm();
      await reloadServices();
      if (showInactiveServices) await loadInactiveServices();
      await refreshHomologationChecklist();
      setMessage('Serviço inativado.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível inativar o serviço.');
      setMessageTone('error');
    }
  }

  async function removeService(service: NfseServiceItem) {
    if (!canDelete) return;
    const invoiceCount = service._count?.invoices || 0;
    if (invoiceCount > 0) {
      setMessage('Serviço já utilizado em nota fiscal. Para preservar o histórico, ele pode apenas ser inativado.');
      setMessageTone('error');
      return;
    }
    if (!window.confirm(`Excluir definitivamente o serviço "${service.name}"?`)) return;
    try {
      await requestApi<NfseServiceItem>(`/companies/${companyId}/nfse/services/${service.id}/permanent`, { method: 'DELETE' });
      if (editingServiceId === service.id) resetServiceForm();
      await reloadServices();
      if (showInactiveServices) await loadInactiveServices();
      await refreshHomologationChecklist();
      setMessage('Serviço excluído com sucesso.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível excluir o serviço.');
      setMessageTone('error');
    }
  }

  async function reactivateService(serviceId: string) {
    if (!canDelete) return;
    try {
      await requestApi<NfseServiceItem>(`/companies/${companyId}/nfse/services/${serviceId}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
      await Promise.all([reloadServices(), loadInactiveServices()]);
      await refreshHomologationChecklist();
      setMessage('Serviço reativado com sucesso.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível reativar o serviço.');
      setMessageTone('error');
    }
  }

  function serviceFiscalSummary(service: NfseServiceItem) {
    const parts = [
      service.municipalServiceCode ? `Municipal: ${service.municipalServiceCode}` : '',
      service.cnae ? `CNAE: ${service.cnae}` : '',
      service.nbsCode ? `NBS: ${service.nbsCode}` : '',
      service.ibsCbsTaxClassCode ? `IBS/CBS: ${service.ibsCbsTaxClassCode}` : '',
      service.ibsCbsOperationCode ? `Ind. op.: ${service.ibsCbsOperationCode}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }

  function renderServiceActions(service: NfseServiceItem, inactive = false) {
    if (!canEdit && !canDelete) return null;
    const invoiceCount = service._count?.invoices || 0;
    const cannotDelete = invoiceCount > 0;
    return (
      <div className="nfse-icon-actions">
        <button className="nfse-icon-button" type="button" onClick={() => startEditService(service)} title="Editar serviço" aria-label="Editar serviço" disabled={!canEdit}>
          <EditIcon />
        </button>
        {inactive ? (
          <button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" onClick={() => void reactivateService(service.id)} title="Reativar serviço" aria-label="Reativar serviço" disabled={!canDelete}>
            <RestoreIcon />
          </button>
        ) : (
          <button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" onClick={() => void deleteService(service.id)} title="Inativar serviço" aria-label="Inativar serviço" disabled={!canDelete}>
            <ArchiveIcon />
          </button>
        )}
        <button
          className="nfse-icon-button nfse-icon-button--danger"
          type="button"
          onClick={() => void removeService(service)}
          disabled={cannotDelete || !canDelete}
          title={cannotDelete ? `Serviço usado em ${invoiceCount} nota(s); inative para preservar histórico.` : 'Excluir serviço'}
          aria-label="Excluir serviço"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  if (isLoading) return <p className="company-module-empty">Carregando configuracoes...</p>;

  const hasMunicipality = onlyDigits(settings?.municipalIbgeCode || '').length === 7;
  const certificateExpired = certificate?.status === 'EXPIRED' || isCertificateExpired(certificate);
  const hasCertificate = certificate?.status === 'VALID' && !certificateExpired;
  const certificateSidebarLabel = certificate ? (certificateExpired ? 'Vencido' : certificateStatusLabel(certificate.status)) : 'Pendente';
  const sortedServices = useMemo(() => sortServices(services, serviceSort), [services, serviceSort]);
  const sortedInactiveServices = useMemo(() => sortServices(inactiveServices, inactiveServiceSort), [inactiveServices, inactiveServiceSort]);
  const hasServices = services.length > 0;
  const defaultService = services.find((service) => service.isDefault);
  const essentialReady = [hasMunicipality, hasCertificate, hasServices].filter(Boolean).length;
  const homologationReady = Boolean(homologationChecklist?.ready);
  const homologationSidebarLabel = homologationChecklist
    ? homologationReady
      ? 'Sem bloqueios'
      : `${homologationChecklist.blockingCount} pendencia(s)`
    : 'Verificar';

  return (
    <section className="nfse-settings-clean nfse-params-clean">
      <div className="nfse-params-top">
        <div>
          <p>Parametrização</p>
          <h2>Emissão de NFS-e</h2>
        </div>
        <div className="nfse-params-progress" aria-label="Itens essenciais configurados">
          <strong>{essentialReady}/3</strong>
          <span>essenciais</span>
        </div>
      </div>

      <div className="nfse-params-company-strip">
        <span><strong>CNPJ</strong>{formatCnpj(company.cnpj)}</span>
        <span><strong>Razão social</strong>{company.legalName}</span>
        <span><strong>Município</strong>{company.city}/{company.state}</span>
      </div>

      <Message text={message} tone={messageTone} />

      <div className="nfse-params-layout">
        <aside className="nfse-params-sidebar" aria-label="Etapas da parametrizacao">
          <a className={hasMunicipality ? 'is-done' : 'is-alert'} href="#nfse-param-fiscal"><strong>Dados fiscais</strong><small>{hasMunicipality ? 'Município definido' : 'Pendente'}</small></a>
          <a className={hasCertificate ? 'is-done' : 'is-alert'} href="#nfse-param-certificate"><strong>Certificado</strong><small>{certificateSidebarLabel}</small></a>
          <a className={hasServices ? 'is-done' : 'is-alert'} href="#nfse-param-services"><strong>Serviços</strong><small>{hasServices ? `${services.length} cadastrado(s)` : 'Pendente'}</small></a>
          <a href="#nfse-param-optional"><strong>Opcionais</strong><small>Regime e API</small></a>
          <a className={homologationReady ? 'is-done' : homologationChecklist ? 'is-alert' : ''} href="#nfse-param-optional"><strong>Ambiente selecionado</strong><small>{homologationSidebarLabel}</small></a>
        </aside>

        <div className="nfse-params-main">
          <section className="nfse-params-section" id="nfse-param-fiscal">
            <div className="nfse-params-section__heading">
              <div>
                <h3>Dados fiscais</h3>
                <span>Necessário para identificar o município da emissão.</span>
              </div>
              <em className={!hasMunicipality ? 'is-alert' : undefined}>{hasMunicipality ? 'OK' : 'Obrigatório'}</em>
            </div>
            <div className="nfse-settings-clean__fields nfse-settings-clean__fields--municipality">
              <label className={`nfse-city-combobox-field ${settingsErrors['settings-municipality'] ? 'is-invalid' : ''}`} data-field="settings-municipality">Município
                <div className="nfse-city-combobox">
                  <input value={municipalitySearch} onChange={(event) => void searchMunicipalities(event.target.value)} placeholder="Digite e selecione o município" autoComplete="off" />
                  {municipalitySuggestions.length ? (
                    <div className="nfse-city-combobox__list">
                      {municipalitySuggestions.map((city) => (
                        <button
                          className="nfse-city-combobox__option"
                          key={city.id}
                          type="button"
                          onClick={() => {
                            updateSetting('municipalIbgeCode', String(city.id));
                            setMunicipalitySearch(`${city.nome}/${municipalityUf(city)}`);
                            setMunicipalitySuggestions([]);
                          }}
                        >
                          {municipalityLabel(city)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {settingsErrors['settings-municipality'] ? <span className="field-error">● {settingsErrors['settings-municipality']}</span> : null}
              </label>
              <label className={settingsErrors['settings-municipality'] ? 'is-invalid' : ''}>Código IBGE
                <input value={settings?.municipalIbgeCode || ''} onChange={(event) => updateSetting('municipalIbgeCode', onlyDigits(event.target.value).slice(0, 7))} placeholder="Ex.: 3148103" />
              </label>
              <label>Inscrição Municipal
                <input value={settings?.municipalRegistration || ''} onChange={(event) => updateSetting('municipalRegistration', event.target.value)} placeholder="Informe a inscricao municipal" />
              </label>
            </div>
          </section>

          <section className="nfse-params-section" id="nfse-param-certificate">
            <div className="nfse-params-section__heading">
              <div>
                <h3>Certificado digital</h3>
                <span>A1 da empresa selecionada.</span>
              </div>
              <em className={!hasCertificate ? 'is-alert' : undefined}>{hasCertificate ? 'OK' : certificate ? certificateSidebarLabel : 'Obrigatório'}</em>
            </div>
            {certificate ? (
              <div className="nfse-certificate-status">
                <div className="nfse-certificate-status__grid">
                  <span><strong>Status</strong>{certificateSidebarLabel}</span>
                  <span><strong>Titular</strong>{certificate.subjectName || 'Não informado'}</span>
                  <span><strong>Vencimento</strong>{formatDate(certificate.validUntil)}</span>
                </div>
                {certificateExpired ? (
                  <p className="nfse-certificate-status__warning">
                    Certificado vencido. Desvincule e envie um novo certificado A1 para continuar emitindo NFS-e.
                  </p>
                ) : null}
              </div>
            ) : <p className="nfse-certificate-status__empty">Nenhum certificado vinculado ainda.</p>}
            <div className="nfse-settings-clean__fields nfse-settings-clean__fields--certificate">
              <label className={settingsErrors['certificate-file'] ? 'is-invalid' : ''} data-field="certificate-file">Certificado A1 (.pfx ou .p12)
                <input type="file" accept=".pfx,.p12" disabled={!canEdit} onChange={(event) => { setCertificateFile(event.target.files?.[0] || null); setSettingsErrors((current) => ({ ...current, 'certificate-file': undefined })); }} />
                {settingsErrors['certificate-file'] ? <span className="field-error">● {settingsErrors['certificate-file']}</span> : null}
              </label>
              <label className={settingsErrors['certificate-password'] ? 'is-invalid' : ''} data-field="certificate-password">Senha
                <input type="password" value={certificatePassword} disabled={!canEdit} onChange={(event) => { setCertificatePassword(event.target.value); setSettingsErrors((current) => ({ ...current, 'certificate-password': undefined })); }} autoComplete="new-password" placeholder="Senha do A1" />
                {settingsErrors['certificate-password'] ? <span className="field-error">● {settingsErrors['certificate-password']}</span> : null}
              </label>
              <button className="companies-button companies-button--ghost" type="button" onClick={() => void uploadCertificate()} disabled={isUploading || !canEdit}>
                {isUploading ? 'Enviando...' : certificate ? 'Substituir' : 'Adicionar'}
              </button>
              {certificate ? (
                <button className="companies-button companies-button--ghost" type="button" onClick={() => void unlinkCertificate()} disabled={isUploading || !canDelete}>
                  Desvincular
                </button>
              ) : null}
            </div>
          </section>

          <section className="nfse-params-section" id="nfse-param-services">
            <div className="nfse-params-section__heading">
              <div>
                <h3>Perfis de serviço</h3>
                <span>{defaultService ? `Padrão: ${defaultService.name}` : 'Defina ao menos um serviço para agilizar a emissão.'}</span>
              </div>
              <div className="nfse-params-heading-actions">
                <button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => void toggleInactiveServices()}>
                  {showInactiveServices ? 'Ocultar inativos' : 'Ver inativos'}
                </button>
                <em className={!hasServices ? 'is-alert' : undefined}>{hasServices ? 'OK' : 'Recomendado'}</em>
              </div>
            </div>
            <div className="nfse-services-table-wrap">
              <table className="nfse-services-table">
                <thead>
                  <tr><th>{renderSortButton('Padrão', 'default', serviceSort, (key) => setServiceSort((current) => nextSortState(current, key)))}</th><th>{renderSortButton('Serviço', 'name', serviceSort, (key) => setServiceSort((current) => nextSortState(current, key)))}</th><th>{renderSortButton('Código nacional', 'nationalTaxCode', serviceSort, (key) => setServiceSort((current) => nextSortState(current, key)))}</th><th>{renderSortButton('ISS', 'issRate', serviceSort, (key) => setServiceSort((current) => nextSortState(current, key)))}</th><th className="nfse-services-actions-cell">Ações</th></tr>
                </thead>
                <tbody>
                  {sortedServices.length ? sortedServices.map((service) => (
                    <tr key={service.id}>
                      <td>
                        <label className="nfse-service-default-choice" title="Marcar este serviço como padrão">
                          <input type="radio" name="defaultService" checked={Boolean(service.isDefault)} onChange={() => void setDefaultService(service.id)} />
                          <span>{service.isDefault ? 'Padrão' : 'Definir'}</span>
                        </label>
                      </td>
                      <td><strong>{service.name || '-'}</strong><small>{serviceFiscalSummary(service)}</small></td>
                      <td>{service.nationalTaxCode || '-'}</td>
                      <td>{service.issRate === null || service.issRate === undefined ? '-' : formatDecimalForInput(service.issRate)}</td>
                      <td className="nfse-services-actions-cell">{renderServiceActions(service)}</td>
                    </tr>
                  )) : <tr><td colSpan={5} className="nfse-services-empty">Nenhum serviço cadastrado ainda.</td></tr>}
                </tbody>
              </table>
            </div>
            {showInactiveServices ? (
              <div className="nfse-inactive-services">
                <div className="nfse-inactive-services__heading">
                  <span>Serviços inativos</span>
                  <button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => void loadInactiveServices()} disabled={isLoadingInactiveServices}>
                    {isLoadingInactiveServices ? 'Atualizando...' : 'Atualizar'}
                  </button>
                </div>
                <div className="nfse-services-table-wrap">
                  <table className="nfse-services-table">
                    <thead>
                      <tr><th>{renderSortButton('Serviço', 'name', inactiveServiceSort, (key) => setInactiveServiceSort((current) => nextSortState(current, key)))}</th><th>{renderSortButton('Código nacional', 'nationalTaxCode', inactiveServiceSort, (key) => setInactiveServiceSort((current) => nextSortState(current, key)))}</th><th>{renderSortButton('ISS', 'issRate', inactiveServiceSort, (key) => setInactiveServiceSort((current) => nextSortState(current, key)))}</th><th className="nfse-services-actions-cell">Ações</th></tr>
                    </thead>
                    <tbody>
                      {sortedInactiveServices.length ? sortedInactiveServices.map((service) => (
                        <tr key={service.id} className="is-inactive">
                          <td><strong>{service.name || '-'}</strong><small>{serviceFiscalSummary(service)}</small></td>
                          <td>{service.nationalTaxCode || '-'}</td>
                          <td>{service.issRate === null || service.issRate === undefined ? '-' : formatDecimalForInput(service.issRate)}</td>
                          <td className="nfse-services-actions-cell">{renderServiceActions(service, true)}</td>
                        </tr>
                      )) : <tr><td colSpan={4} className="nfse-services-empty">{isLoadingInactiveServices ? 'Carregando serviços inativos...' : 'Nenhum serviço inativo encontrado.'}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {canEdit ? <details className="nfse-params-details" open={!services.length || Boolean(editingServiceId)} data-field="service-form">
              <summary>{editingServiceId ? 'Editar perfil de serviço' : 'Adicionar perfil de serviço'}</summary>
              <form className="nfse-service-form" onSubmit={saveService}>
                <label className={`nfse-service-field--wide ${settingsErrors['service-name'] ? 'is-invalid' : ''}`} data-field="service-name">Descrição do serviço
                  <input value={serviceForm.name} onChange={(event) => { setServiceForm((current) => ({ ...current, name: event.target.value })); setSettingsErrors((current) => ({ ...current, 'service-name': undefined })); }} placeholder="Ex.: Honorarios contabeis" />
                  {settingsErrors['service-name'] ? <span className="field-error">● {settingsErrors['service-name']}</span> : null}
                </label>
                <label className={settingsErrors['service-national-code'] ? 'is-invalid' : ''} data-field="service-national-code">Código nacional
                  <input value={serviceForm.nationalTaxCode} onChange={(event) => { setServiceForm((current) => ({ ...current, nationalTaxCode: event.target.value })); setSettingsErrors((current) => ({ ...current, 'service-national-code': undefined })); }} placeholder="Ex.: 1701" />
                  {settingsErrors['service-national-code'] ? <span className="field-error">● {settingsErrors['service-national-code']}</span> : null}
                </label>
                <label>Código municipal
                  <input value={serviceForm.municipalServiceCode} onChange={(event) => setServiceForm((current) => ({ ...current, municipalServiceCode: event.target.value }))} placeholder="Opcional" />
                </label>
                <label>CNAE
                  <input value={serviceForm.cnae} onChange={(event) => setServiceForm((current) => ({ ...current, cnae: onlyDigits(event.target.value).slice(0, 7) }))} placeholder="Opcional" inputMode="numeric" />
                </label>
                <label>NBS
                  <input value={serviceForm.nbsCode} onChange={(event) => setServiceForm((current) => ({ ...current, nbsCode: event.target.value }))} placeholder="cNBS opcional" />
                </label>
                <label>Classificação IBS/CBS
                  <input value={serviceForm.ibsCbsTaxClassCode} onChange={(event) => setServiceForm((current) => ({ ...current, ibsCbsTaxClassCode: event.target.value }))} placeholder="cClassTrib opcional" />
                </label>
                <label>Indicador operação IBS/CBS
                  <input value={serviceForm.ibsCbsOperationCode} onChange={(event) => setServiceForm((current) => ({ ...current, ibsCbsOperationCode: onlyDigits(event.target.value).slice(0, 6) }))} placeholder="cIndOp opcional" inputMode="numeric" />
                </label>
                <label className={settingsErrors['service-iss-rate'] ? 'is-invalid' : ''} data-field="service-iss-rate">Alíquota ISS
                  <input value={serviceForm.issRate} onChange={(event) => { setServiceForm((current) => ({ ...current, issRate: formatDecimalInput(event.target.value) })); setSettingsErrors((current) => ({ ...current, 'service-iss-rate': undefined })); }} onBlur={() => setServiceForm((current) => ({ ...current, issRate: formatDecimalForInput(current.issRate) }))} placeholder="Ex.: 2,00" inputMode="decimal" />
                  {settingsErrors['service-iss-rate'] ? <span className="field-error">● {settingsErrors['service-iss-rate']}</span> : null}
                </label>
                <button className="companies-button companies-button--primary" type="submit">{editingServiceId ? 'Salvar edicao' : 'Adicionar'}</button>
                {editingServiceId ? (
                  <button className="companies-button companies-button--ghost" type="button" onClick={resetServiceForm}>Cancelar edicao</button>
                ) : null}
              </form>
            </details> : null}
          </section>

          <section className="nfse-params-section" id="nfse-param-optional">
            <details className="nfse-params-details">
              <summary>Regime e regras fiscais opcionais</summary>
              <div className="nfse-settings-clean__fields">
                <label>Regime tributario
                  <select
                    value={settings?.taxRegime || 'SIMPLE_NATIONAL'}
                    onChange={(event) => {
                      const taxRegime = event.target.value;
                      setSettings((current) => ({ ...(current || {}), taxRegime, isSimpleNational: taxRegime === 'SIMPLE_NATIONAL' || taxRegime === 'MEI' }));
                    }}
                  >
                    <option value="SIMPLE_NATIONAL">Simples Nacional</option>
                    <option value="MEI">MEI</option>
                    <option value="NORMAL">Lucro Presumido / Normal</option>
                    <option value="SPECIAL">Regime especial</option>
                    <option value="NONE">Não sei informar</option>
                  </select>
                </label>
                <label>Regime especial
                  <select value={settings?.specialTaxRegime || ''} onChange={(event) => updateSetting('specialTaxRegime', event.target.value)}>
                    <option value="">Nenhum / não aplicável</option>
                    <option value="1">Microempresa municipal</option>
                    <option value="2">Estimativa</option>
                    <option value="3">Sociedade de profissionais</option>
                    <option value="4">Cooperativa</option>
                    <option value="5">MEI</option>
                    <option value="6">ME/EPP</option>
                  </select>
                </label>
              </div>
              <div className="nfse-settings-clean__checks">
                <label><input type="checkbox" checked={Boolean(settings?.hasFiscalIncentive)} onChange={(event) => updateSetting('hasFiscalIncentive', event.target.checked)} /> <span><strong>Incentivo fiscal</strong><small>Use somente quando houver beneficio fiscal municipal aplicavel.</small></span></label>
                <label><input type="checkbox" checked={Boolean(settings?.defaultIssWithheld)} onChange={(event) => updateSetting('defaultIssWithheld', event.target.checked)} /> <span><strong>Reter ISS</strong><small>Padrão sugerido para notas em que o tomador deve reter o ISS.</small></span></label>
              </div>
            </details>

            <details className="nfse-params-details">
              <summary>Padrões de emissão</summary>
              <div className="nfse-settings-clean__fields">
                <label>Série/RPS padrão
                  <input value={settings?.defaultRpsSeries || ''} onChange={(event) => updateSetting('defaultRpsSeries', event.target.value)} placeholder="Opcional" />
                </label>
              </div>
            </details>

            <details className="nfse-params-details">
              <summary>API e suporte tecnico</summary>
              <div className="nfse-settings-clean__fields">
                <label>Ambiente
                  <select value={settings?.environment || 'PRODUCTION_RESTRICTED'} onChange={(event) => updateSetting('environment', event.target.value)}>
                    <option value="PRODUCTION_RESTRICTED">Homologacao / producao restrita</option>
                    <option value="PRODUCTION">Producao</option>
                  </select>
                </label>
                <label>URL base da API
                  <input value={settings?.apiBaseUrl || ''} onChange={(event) => updateSetting('apiBaseUrl', event.target.value)} placeholder="URL padrão do ambiente" />
                </label>
                <label>Versao da API
                  <input value={settings?.apiVersion || ''} onChange={(event) => updateSetting('apiVersion', event.target.value)} placeholder="Opcional" />
                </label>
              </div>
            </details>
          </section>

        </div>
      </div>

      <div className="nfse-settings-footer">
        <span>Obrigatório para a API: município IBGE, certificado válido e dados do serviço na DPS. O restante é padrão operacional do sistema.</span>
        {canEdit ? <button className="companies-button companies-button--primary" type="button" onClick={() => void saveSettings()} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar configuracoes'}
        </button> : null}
      </div>
    </section>
  );
}

export default function CompanyModulePage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ companyId: string }>();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState(params.companyId);
  const [activeSection, setActiveSection] = useState<ModuleSection>(() => sectionFromPath(pathname, params.companyId));
  const [isNfseOpen, setIsNfseOpen] = useState(false);
  const [isAccountingOpen, setIsAccountingOpen] = useState(false);
  const [isControlOpen, setIsControlOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('nfse_company_menu_collapsed') === 'true' : false));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
  const [nfseModal, setNfseModal] = useState<'issue' | 'taker' | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<NfseServiceItem[]>([]);
  const [companySettings, setCompanySettings] = useState<NfseSettings | null>(null);
  const [invoices, setInvoices] = useState<NfseInvoice[]>([]);
  const [recurrences, setRecurrences] = useState<NfseRecurrence[]>([]);
  const [recurrenceForm, setRecurrenceForm] = useState<RecurrenceForm>(emptyRecurrenceForm);
  const [isRecurrenceSaving, setIsRecurrenceSaving] = useState(false);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(20);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [invoiceSort, setInvoiceSort] = useState<SortState>({ key: 'createdAt', direction: 'desc' });
  const [takerSort, setTakerSort] = useState<SortState>({ key: 'name', direction: 'asc' });
  const [invoiceStartDate, setInvoiceStartDate] = useState('');
  const [invoiceEndDate, setInvoiceEndDate] = useState('');
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const [invoiceMessageTone, setInvoiceMessageTone] = useState<MessageTone>('success');
  const [invoiceTemplates, setInvoiceTemplates] = useState<NfseInvoice[]>([]);
  const [invoiceTemplateId, setInvoiceTemplateId] = useState('');
  const [isInvoiceTemplateLoading, setIsInvoiceTemplateLoading] = useState(false);
  const [isRefreshingInvoices, setIsRefreshingInvoices] = useState(false);
  const [isExportingInvoices, setIsExportingInvoices] = useState(false);
  const [isExportingTakers, setIsExportingTakers] = useState(false);
  const [accountingData, setAccountingData] = useState<AccountingData>({ documents: [], taxes: [], requests: [], processes: [] });
  const [isAccountingLoading, setIsAccountingLoading] = useState(false);
  const [accountingMessage, setAccountingMessage] = useState('');
  const [accountingMessageTone, setAccountingMessageTone] = useState<MessageTone>('success');
  const [accountingSorts, setAccountingSorts] = useState<Record<string, SortState>>({
    'accounting-documents': { key: 'dueDate', direction: 'asc' },
    'accounting-taxes': { key: 'dueDate', direction: 'asc' },
    'accounting-requests': { key: 'openedAt', direction: 'desc' },
    'accounting-processes': { key: 'updatedAt', direction: 'desc' },
  });
  const [accountingDepartments, setAccountingDepartments] = useState<AccountingDepartment[]>([]);
  const [accountingSearch, setAccountingSearch] = useState('');
  const [accountingDepartmentFilter, setAccountingDepartmentFilter] = useState('');
  const [accountingStartDate, setAccountingStartDate] = useState('');
  const [accountingEndDate, setAccountingEndDate] = useState('');
  const [accountingPage, setAccountingPage] = useState(1);
  const [accountingPageSize, setAccountingPageSize] = useState(20);
  const [accountingTotal, setAccountingTotal] = useState(0);
  const [accountingTotalPages, setAccountingTotalPages] = useState(1);
  const [controlOverview, setControlOverview] = useState<ControlOverviewResponse | null>(null);
  const [isControlLoading, setIsControlLoading] = useState(false);
  const [showAccountingRequestModal, setShowAccountingRequestModal] = useState(false);
  const [accountingRequestForm, setAccountingRequestForm] = useState<AccountingRequestForm>(emptyAccountingRequestForm);
  const [isAccountingRequestSaving, setIsAccountingRequestSaving] = useState(false);
  const [accountingDetail, setAccountingDetail] = useState<AccountingDetailResponse | null>(null);
  const [isAccountingDetailLoading, setIsAccountingDetailLoading] = useState(false);
  const [accountingReplyForm, setAccountingReplyForm] = useState<AccountingReplyForm>(emptyAccountingReplyForm);
  const [accountingEvaluationForm, setAccountingEvaluationForm] = useState<AccountingEvaluationForm>(emptyAccountingEvaluationForm);
  const [isAccountingReplySaving, setIsAccountingReplySaving] = useState(false);
  const [isAccountingEvaluationSaving, setIsAccountingEvaluationSaving] = useState(false);
  const [cancelInvoiceTarget, setCancelInvoiceTarget] = useState<NfseInvoice | null>(null);
  const [cancelInvoiceForm, setCancelInvoiceForm] = useState<CancelInvoiceForm>(emptyCancelInvoiceForm);
  const [isCancelInvoiceSaving, setIsCancelInvoiceSaving] = useState(false);
  const [takerMessage, setTakerMessage] = useState('');
  const [takerMessageTone, setTakerMessageTone] = useState<MessageTone>('success');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [takerForm, setTakerForm] = useState<TakerForm>(emptyTakerForm);
  const [editingTakerId, setEditingTakerId] = useState<string | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoiceForm);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [isModalSaving, setIsModalSaving] = useState(false);
  const [modalFieldErrors, setModalFieldErrors] = useState<FieldErrors>({});
  const [isTakerLookupLoading, setIsTakerLookupLoading] = useState(false);
  const [isCepLookupLoading, setIsCepLookupLoading] = useState(false);
  const [issueMunicipalitySearch, setIssueMunicipalitySearch] = useState('');
  const [issueMunicipalities, setIssueMunicipalities] = useState<IbgeMunicipality[]>([]);
  const [issueMunicipalitySuggestions, setIssueMunicipalitySuggestions] = useState<IbgeMunicipality[]>([]);

  const activeCompany = useMemo(() => companies.find((company) => company.id === activeCompanyId) || null, [companies, activeCompanyId]);
  const selectedInvoices = useMemo(() => invoices.filter((invoice) => selectedInvoiceIds.includes(invoice.id)), [invoices, selectedInvoiceIds]);
  const deletableSelectedInvoices = useMemo(() => selectedInvoices.filter(canDeleteLocalInvoice), [selectedInvoices]);
  const allInvoicesSelected = invoices.length > 0 && invoices.every((invoice) => selectedInvoiceIds.includes(invoice.id));
  const invoiceDateFilterError = getDateFilterError(invoiceStartDate, invoiceEndDate);
  const canViewInvoices = hasPermission(activeCompany, 'nfse.invoices.view');
  const canCreateInvoices = hasPermission(activeCompany, 'nfse.invoices.create');
  const canEditInvoices = hasPermission(activeCompany, 'nfse.invoices.edit');
  const canDeleteInvoices = hasPermission(activeCompany, 'nfse.invoices.delete');
  const canTransmitInvoices = hasPermission(activeCompany, 'nfse.invoices.transmit');
  const canSyncInvoices = hasPermission(activeCompany, 'nfse.invoices.sync');
  const canViewTakers = hasPermission(activeCompany, 'nfse.takers.view');
  const canCreateTakers = hasPermission(activeCompany, 'nfse.takers.create');
  const canEditTakers = hasPermission(activeCompany, 'nfse.takers.edit');
  const canDeleteTakers = hasPermission(activeCompany, 'nfse.takers.delete');
  const canViewSettings = hasPermission(activeCompany, 'nfse.settings.view');
  const canEditSettings = hasPermission(activeCompany, 'nfse.settings.edit');
  const canDeleteSettings = hasPermission(activeCompany, 'nfse.settings.delete');
  const canViewNfseModule = hasAnyPermission(activeCompany, ['nfse.invoices.view', 'nfse.takers.view', 'nfse.settings.view']);
  const canViewAccountingModule = hasAnyPermission(activeCompany, ['accounting.documents.view', 'accounting.taxes.view', 'accounting.requests.view', 'accounting.processes.view']);
  const canCreateAccountingRequests = hasPermission(activeCompany, 'accounting.requests.edit');
  const canViewControlModule = Boolean(activeCompany);

  useEffect(() => {
    const stored = localStorage.getItem('nfse_company_menu_collapsed');
    if (stored === 'true') setIsCollapsed(true);
  }, []);

  async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem('nfse_access_token');
    if (!token) {
      router.replace('/login');
      throw new Error('Sessão expirada.');
    }

    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message || 'Não foi possível concluir a solicitação.');
    return data as T;
  }

  async function loadCustomers(search = '') {
    if (!activeCompanyId) return;
    const paramsQuery = new URLSearchParams();
    if (search.trim()) paramsQuery.set('search', search.trim());
    paramsQuery.set('sortBy', takerSort.key);
    paramsQuery.set('sortDirection', takerSort.direction);
    const query = paramsQuery.toString() ? `?${paramsQuery.toString()}` : '';
    setCustomers(await requestApi<Customer[]>(`/companies/${activeCompanyId}/nfse/customers${query}`));
  }

  async function loadServices() {
    if (!activeCompanyId) return [];
    const data = await requestApi<NfseServiceItem[]>(`/companies/${activeCompanyId}/nfse/services`);
    setServices(data);
    return data;
  }

  async function loadCompanySettings() {
    if (!activeCompanyId) return null;
    const settings = await requestApi<NfseSettings>(`/companies/${activeCompanyId}/nfse/settings`);
    setCompanySettings(settings);
    return settings;
  }

  function buildInvoiceFilterQuery(nextPage?: number, nextPageSize?: number) {
    const paramsQuery = new URLSearchParams();
    if (nextPage !== undefined) paramsQuery.set('page', String(nextPage));
    if (nextPageSize !== undefined) paramsQuery.set('pageSize', String(nextPageSize));
    if (invoiceSearch.trim()) paramsQuery.set('search', invoiceSearch.trim());
    if (invoiceStatus) paramsQuery.set('status', invoiceStatus);
    const startDate = parseDateFilterInput(invoiceStartDate).iso;
    const endDate = parseDateFilterInput(invoiceEndDate).iso;
    if (startDate) paramsQuery.set('startDate', startDate);
    if (endDate) paramsQuery.set('endDate', endDate);
    paramsQuery.set('sortBy', invoiceSort.key);
    paramsQuery.set('sortDirection', invoiceSort.direction);
    return paramsQuery;
  }

  async function loadInvoices(nextPage = invoicePage, nextPageSize = invoicePageSize) {
    if (!activeCompanyId) return;
    const dateError = getDateFilterError(invoiceStartDate, invoiceEndDate);
    if (dateError) return;
    const paramsQuery = buildInvoiceFilterQuery(nextPage, nextPageSize);
    const data = await requestApi<InvoiceListResponse>(`/companies/${activeCompanyId}/nfse/invoices?${paramsQuery.toString()}`);
    setInvoices(data.items);
    setInvoicePage(data.page);
    setInvoicePageSize(data.pageSize);
    setInvoiceTotalPages(data.totalPages);
    setInvoiceTotal(data.total);
    setSelectedInvoiceIds([]);
  }

  async function loadRecurrences() {
    if (!activeCompanyId) return;
    const data = await requestApi<NfseRecurrence[]>(`/companies/${activeCompanyId}/nfse/recurrences`);
    setRecurrences(data);
  }

  async function saveRecurrence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompanyId) return;
    if (!recurrenceForm.customerId || !recurrenceForm.amount || !recurrenceForm.serviceDescription.trim()) {
      setInvoiceMessage('Preencha tomador, valor e descrição para salvar a recorrência.');
      setInvoiceMessageTone('error');
      return;
    }
    setIsRecurrenceSaving(true);
    setInvoiceMessage('');
    try {
      await requestApi(`/companies/${activeCompanyId}/nfse/recurrences`, {
        method: 'POST',
        body: JSON.stringify({
          ...recurrenceForm,
          interval: Number(onlyDigits(recurrenceForm.interval) || '1'),
        }),
      });
      setRecurrenceForm(emptyRecurrenceForm);
      setInvoiceMessage('Recorrência cadastrada com sucesso.');
      setInvoiceMessageTone('success');
      await loadRecurrences();
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível salvar a recorrência.');
      setInvoiceMessageTone('error');
    } finally {
      setIsRecurrenceSaving(false);
    }
  }

  async function pauseRecurrence(recurrenceId: string) {
    if (!activeCompanyId || !window.confirm('Pausar esta recorrência de NFS-e?')) return;
    try {
      await requestApi(`/companies/${activeCompanyId}/nfse/recurrences/${recurrenceId}`, { method: 'DELETE' });
      setInvoiceMessage('Recorrência pausada.');
      setInvoiceMessageTone('success');
      await loadRecurrences();
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível pausar a recorrência.');
      setInvoiceMessageTone('error');
    }
  }

  async function loadControlOverview() {
    if (!activeCompanyId) return;
    setIsControlLoading(true);
    try {
      const data = await requestApi<ControlOverviewResponse>(`/companies/${activeCompanyId}/control/overview`);
      setControlOverview(data);
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível consultar o Controle.');
      setAccountingMessageTone('error');
    } finally {
      setIsControlLoading(false);
    }
  }

  function accountingEndpoint(section: ModuleSection) {
    return ({
      'accounting-documents': { key: 'documents', path: 'documents' },
      'accounting-taxes': { key: 'taxes', path: 'taxes' },
      'accounting-requests': { key: 'requests', path: 'requests' },
      'accounting-processes': { key: 'processes', path: 'processes' },
    } as Partial<Record<ModuleSection, { key: keyof AccountingData; path: string }>>)[section];
  }

  async function loadAccountingData(section = activeSection, refresh = false) {
    if (!activeCompanyId) return;
    const target = accountingEndpoint(section);
    if (!target) return;
    const sort = accountingSorts[section] || { key: 'dueDate', direction: 'asc' as SortDirection };
    const query = new URLSearchParams();
    query.set('sortBy', sort.key);
    query.set('sortDirection', sort.direction);
    if (refresh) query.set('refresh', '1');
    if (section === 'accounting-taxes') {
      query.set('page', String(accountingPage));
      query.set('pageSize', String(accountingPageSize));
      if (accountingSearch.trim()) query.set('search', accountingSearch.trim());
      if (accountingDepartmentFilter) query.set('department', accountingDepartmentFilter);
      if (accountingStartDate) query.set('startDate', accountingStartDate);
      if (accountingEndDate) query.set('endDate', accountingEndDate);
    }
    setIsAccountingLoading(true);
    setAccountingMessage('');
    try {
      const data = await requestApi<AccountingListResponse<AccountingData[keyof AccountingData][number]>>(`/companies/${activeCompanyId}/accounting/${target.path}?${query.toString()}`);
      setAccountingData((current) => ({ ...current, [target.key]: data.items }));
      if (section === 'accounting-taxes') {
        setAccountingPage(data.page || 1);
        setAccountingPageSize(data.pageSize || accountingPageSize);
        setAccountingTotal(data.total || 0);
        setAccountingTotalPages(data.totalPages || 1);
      }
      setAccountingMessage(data.items.length ? (refresh ? 'Dados sincronizados com a Acessórias.' : 'Dados carregados do cache local da Acessórias.') : 'Nenhum registro encontrado para os filtros informados.');
      setAccountingMessageTone('success');
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível consultar a Acessórias.');
      setAccountingMessageTone('error');
      setAccountingData((current) => ({ ...current, [target.key]: [] }));
    } finally {
      setIsAccountingLoading(false);
    }
  }

  async function refreshInvoicesManually(silent = false, scope: 'all' | 'processing' = 'all') {
    if (!activeCompanyId) return;
    setIsRefreshingInvoices(true);
    if (!silent) setInvoiceMessage('');
    try {
      const syncableInvoices = canSyncInvoices
        ? invoices.filter((invoice) => invoice.accessKey && (scope === 'all' || invoice.status === 'PROCESSING'))
        : [];
      if (canSyncInvoices && syncableInvoices.length) {
        await Promise.allSettled(syncableInvoices.map((invoice) => requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices/${invoice.id}/sync`)));
      }
      await loadInvoices(invoicePage, invoicePageSize);
      if (!silent) {
        setInvoiceMessage(syncableInvoices.length ? `${syncableInvoices.length} nota(s) consultada(s) na plataforma nacional.` : 'Notas fiscais atualizadas.');
        setInvoiceMessageTone('success');
      }
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível atualizar as notas fiscais.');
      setInvoiceMessageTone('error');
    } finally {
      setIsRefreshingInvoices(false);
    }
  }

  function downloadReport(report: ReportResponse, fallbackFileName: string) {
    const binary = atob(report.contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    downloadBlob(new Blob([bytes], { type: report.mimeType || 'text/csv;charset=utf-8' }), report.fileName || fallbackFileName);
  }

  async function exportFilteredInvoicesReport() {
    if (!activeCompanyId || getDateFilterError(invoiceStartDate, invoiceEndDate)) return;
    setIsExportingInvoices(true);
    setInvoiceMessage('');
    try {
      const query = buildInvoiceFilterQuery();
      const report = await requestApi<ReportResponse>(`/companies/${activeCompanyId}/nfse/invoices/report?${query.toString()}`);
      downloadReport(report, 'relatorio-nfse.csv');
      setInvoiceMessage('Relatório das notas filtradas gerado.');
      setInvoiceMessageTone('success');
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível gerar o relatório.');
      setInvoiceMessageTone('error');
    } finally {
      setIsExportingInvoices(false);
    }
  }

  async function exportTakersReport() {
    if (!activeCompanyId) return;
    setIsExportingTakers(true);
    setTakerMessage('');
    try {
      const query = new URLSearchParams();
      query.set('sortBy', takerSort.key);
      query.set('sortDirection', takerSort.direction);
      const report = await requestApi<ReportResponse>(`/companies/${activeCompanyId}/nfse/customers/report?${query.toString()}`);
      downloadReport(report, 'relatorio-tomadores.csv');
      setTakerMessage('Relatório de tomadores gerado.');
      setTakerMessageTone('success');
    } catch (err) {
      setTakerMessage(err instanceof Error ? err.message : 'Não foi possível gerar o relatório de tomadores.');
      setTakerMessageTone('error');
    } finally {
      setIsExportingTakers(false);
    }
  }

  function changeInvoiceSort(key: string) {
    setInvoiceSort((current) => nextSortState(current, key));
    setInvoicePage(1);
  }

  function changeTakerSort(key: string) {
    setTakerSort((current) => nextSortState(current, key));
  }

  function changeAccountingSort(section: ModuleSection, key: string) {
    setAccountingPage(1);
    setAccountingSorts((current) => ({
      ...current,
      [section]: nextSortState(current[section] || { key, direction: 'asc' }, key),
    }));
  }

  function updateAccountingFilter(setter: (value: string) => void, value: string) {
    setAccountingPage(1);
    setter(value);
  }

  async function downloadAccountingFile(item: { localFileId?: string; localFileName?: string; fileName?: string; downloadUrl?: string }) {
    if (!activeCompanyId) return;
    if (!item.localFileId) {
      if (item.downloadUrl) {
        window.open(item.downloadUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      setAccountingMessage('Arquivo ainda não sincronizado localmente.');
      setAccountingMessageTone('error');
      return;
    }
    try {
      const file = await requestApi<AccountingFileResponse>(`/companies/${activeCompanyId}/accounting/files/${item.localFileId}`);
      downloadBlob(new Blob([base64ToBytes(file.contentBase64)], { type: file.mimeType || 'application/octet-stream' }), file.fileName || item.localFileName || item.fileName || 'arquivo.pdf');
      setAccountingMessage('Arquivo baixado com sucesso.');
      setAccountingMessageTone('success');
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível baixar o arquivo.');
      setAccountingMessageTone('error');
    }
  }

  async function openAccountingDetail(area: AccountingArea, item: { id: string; cacheId?: string }) {
    if (!activeCompanyId) return;
    setIsAccountingDetailLoading(true);
    setAccountingMessage('');
    try {
      const recordId = item.cacheId || item.id;
      const data = await requestApi<AccountingDetailResponse>(`/companies/${activeCompanyId}/accounting/records/${area}/${encodeURIComponent(recordId)}`);
      setAccountingDetail(data);
      setAccountingReplyForm({ ...emptyAccountingReplyForm, reopen: Boolean(data.canReopen) });
      setAccountingEvaluationForm(data.rating ? { score: String(data.rating.score || 5), comment: data.rating.comment || '' } : emptyAccountingEvaluationForm);
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível abrir os detalhes da Acessórias.');
      setAccountingMessageTone('error');
    } finally {
      setIsAccountingDetailLoading(false);
    }
  }

  function renderAccountingDetailFiles(files: AccountingDetailFile[]) {
    if (!files.length) return <p className="accounting-muted">Nenhum arquivo vinculado até o momento.</p>;
    return (
      <div className="accounting-detail-files">
        {files.map((file) => (
          <span key={file.id}>
            <strong>{file.fileName}</strong>
            <small>{file.direction === 'OUTBOUND' ? 'Enviado pelo cliente' : 'Recebido da Acessórias'}{file.sizeBytes ? ` • ${formatFileSize(file.sizeBytes)}` : ''}</small>
            <button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => void downloadAccountingFile({ localFileId: file.id, localFileName: file.fileName })}>Baixar</button>
          </span>
        ))}
      </div>
    );
  }
  function renderAccountingDownload(item: { localFileId?: string; localFileName?: string; fileName?: string; downloadUrl?: string }) {
    if (!item.localFileId && !item.downloadUrl) return <span className="accounting-muted">Sem arquivo</span>;
    const label = item.localFileName || item.fileName || 'Baixar';
    return <button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => void downloadAccountingFile(item)} title={label}>Baixar</button>;
  }

  function accountingHistoryOrigin(origin?: string) {
    if (origin === 'client' || origin === 'office') return origin;
    return 'system';
  }

  function accountingHistoryOriginLabel(origin?: string) {
    const labels: Record<string, string> = {
      client: 'Cliente',
      office: 'Contabilidade',
      system: 'Sistema',
    };
    return labels[accountingHistoryOrigin(origin)] || 'Sistema';
  }

  function renderAccountingHistoryAttachments(files?: AccountingDetailFile[]) {
    if (!files?.length) return null;
    return (
      <div className="accounting-detail-history__attachments">
        {files.map((file, index) => (
          <button
            key={file.id || file.sourceUrl || `${file.fileName}-${index}`}
            className="companies-button companies-button--ghost companies-button--mini"
            type="button"
            onClick={() => void downloadAccountingFile({ localFileId: file.id || undefined, localFileName: file.fileName, fileName: file.fileName, downloadUrl: file.sourceUrl })}
            title={file.fileName}
          >
            {file.fileName || 'Baixar anexo'}
          </button>
        ))}
      </div>
    );
  }

  async function loadAccountingDepartments() {
    if (!activeCompanyId || accountingDepartments.length) return accountingDepartments;
    const data = await requestApi<AccountingDepartmentResponse>(`/companies/${activeCompanyId}/accounting/departments`);
    setAccountingDepartments(data.items);
    return data.items;
  }

  async function openAccountingRequestModal() {
    setAccountingRequestForm({ ...emptyAccountingRequestForm, attachments: [] });
    setShowAccountingRequestModal(true);
    setAccountingMessage('');
    try {
      await loadAccountingDepartments();
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível carregar os departamentos da Acessórias.');
      setAccountingMessageTone('error');
    }
  }

  function updateAccountingRequest(field: Exclude<keyof AccountingRequestForm, 'attachments'>, value: string) {
    setAccountingRequestForm((current) => ({ ...current, [field]: value }));
  }

  async function readAccountingAttachments(files: File[], current: AccountingRequestAttachment[]) {
    if (current.length + files.length > 10) throw new Error('Envie no máximo 10 anexos por solicitação.');
    let totalSize = current.reduce((total, attachment) => total + attachment.sizeBytes, 0);
    return Promise.all(files.map(async (file) => {
      if (file.size > 30 * 1024 * 1024) throw new Error(`Anexo ${file.name} excede 30MB.`);
      totalSize += file.size;
      if (totalSize > 30 * 1024 * 1024) throw new Error('Anexos excedem 30MB no total.');
      return { fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, contentBase64: await fileToBase64(file) };
    }));
  }

  async function handleAccountingAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    try {
      const attachments = await readAccountingAttachments(files, accountingRequestForm.attachments);
      setAccountingRequestForm((current) => ({ ...current, attachments: [...current.attachments, ...attachments] }));
      setAccountingMessage('');
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível anexar o arquivo.');
      setAccountingMessageTone('error');
    }
  }

  async function handleAccountingReplyAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    try {
      const attachments = await readAccountingAttachments(files, accountingReplyForm.attachments);
      setAccountingReplyForm((current) => ({ ...current, attachments: [...current.attachments, ...attachments] }));
      setAccountingMessage('');
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível anexar o arquivo.');
      setAccountingMessageTone('error');
    }
  }

  function removeAccountingReplyAttachment(index: number) {
    setAccountingReplyForm((current) => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function removeAccountingAttachment(index: number) {
    setAccountingRequestForm((current) => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function saveAccountingRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompanyId) return;
    if (!accountingRequestForm.subject.trim() || !accountingRequestForm.departmentId || !accountingRequestForm.description.trim()) {
      setAccountingMessage('Preencha assunto, departamento e descrição para abrir a solicitação.');
      setAccountingMessageTone('error');
      return;
    }
    setIsAccountingRequestSaving(true);
    setAccountingMessage('');
    try {
      await requestApi(`/companies/${activeCompanyId}/accounting/requests`, {
        method: 'POST',
        body: JSON.stringify(accountingRequestForm),
      });
      setShowAccountingRequestModal(false);
      setAccountingRequestForm({ ...emptyAccountingRequestForm, attachments: [] });
      setAccountingMessage('Solicitação enviada para a Acessórias.');
      setAccountingMessageTone('success');
      await loadAccountingData('accounting-requests', true);
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível abrir a solicitação.');
      setAccountingMessageTone('error');
    } finally {
      setIsAccountingRequestSaving(false);
    }
  }

  async function saveAccountingReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompanyId || !accountingDetail) return;
    if (!accountingReplyForm.message.trim() && !accountingReplyForm.attachments.length) {
      setAccountingMessage('Informe uma mensagem ou anexe um arquivo para responder a solicitação.');
      setAccountingMessageTone('error');
      return;
    }
    setIsAccountingReplySaving(true);
    setAccountingMessage('');
    try {
      await requestApi(`/companies/${activeCompanyId}/accounting/requests/${encodeURIComponent(accountingDetail.cacheId || accountingDetail.id)}/comments`, {
        method: 'POST',
        body: JSON.stringify({ ...accountingReplyForm, statusSol: 'R' }),
      });
      const detailRef = { id: accountingDetail.id, cacheId: accountingDetail.cacheId };
      const successMessage = accountingReplyForm.reopen ? 'Solicitação reaberta com sucesso.' : 'Mensagem enviada com sucesso.';
      setAccountingReplyForm({ ...emptyAccountingReplyForm, reopen: false });
      await openAccountingDetail('requests', detailRef);
      await loadAccountingData('accounting-requests', true);
      setAccountingMessage(successMessage);
      setAccountingMessageTone('success');
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível enviar a resposta.');
      setAccountingMessageTone('error');
    } finally {
      setIsAccountingReplySaving(false);
    }
  }

  async function saveAccountingEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompanyId || !accountingDetail) return;
    setIsAccountingEvaluationSaving(true);
    setAccountingMessage('');
    try {
      await requestApi(`/companies/${activeCompanyId}/accounting/requests/${encodeURIComponent(accountingDetail.cacheId || accountingDetail.id)}/evaluation`, {
        method: 'POST',
        body: JSON.stringify(accountingEvaluationForm),
      });
      const detailRef = { id: accountingDetail.id, cacheId: accountingDetail.cacheId };
      await openAccountingDetail('requests', detailRef);
      setAccountingMessage('Avaliação registrada com sucesso.');
      setAccountingMessageTone('success');
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível registrar a avaliação.');
      setAccountingMessageTone('error');
    } finally {
      setIsAccountingEvaluationSaving(false);
    }
  }

  async function resolveAccountingRequest() {
    if (!activeCompanyId || !accountingDetail || !window.confirm('Marcar esta solicitação como resolvida?')) return;
    setIsAccountingReplySaving(true);
    setAccountingMessage('');
    try {
      await requestApi(`/companies/${activeCompanyId}/accounting/requests/${encodeURIComponent(accountingDetail.cacheId || accountingDetail.id)}/comments`, {
        method: 'POST',
        body: JSON.stringify({ message: 'Solicitação resolvida pelo cliente.', statusSol: 'F', reopen: false, attachments: [] }),
      });
      const detailRef = { id: accountingDetail.id, cacheId: accountingDetail.cacheId };
      await openAccountingDetail('requests', detailRef);
      await loadAccountingData('accounting-requests', true);
      setAccountingMessage('Solicitação marcada como resolvida.');
      setAccountingMessageTone('success');
    } catch (err) {
      setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível finalizar a solicitação.');
      setAccountingMessageTone('error');
    } finally {
      setIsAccountingReplySaving(false);
    }
  }

  async function loadInvoiceTemplates() {
    if (!activeCompanyId) return [];
    setIsInvoiceTemplateLoading(true);
    try {
      const data = await requestApi<InvoiceListResponse>(`/companies/${activeCompanyId}/nfse/invoices?page=1&pageSize=100`);
      setInvoiceTemplates(data.items);
      return data.items;
    } catch {
      setInvoiceTemplates([]);
      return [];
    } finally {
      setIsInvoiceTemplateLoading(false);
    }
  }

  useEffect(() => {
    const nextSection = sectionFromPath(pathname, params.companyId);
    setActiveCompanyId(params.companyId);
    setActiveSection(nextSection);
    if (nextSection.startsWith('nfse')) {
      setIsNfseOpen(true);
      setIsAccountingOpen(false);
      setIsControlOpen(false);
    } else if (nextSection.startsWith('accounting')) {
      setIsAccountingOpen(true);
      setIsNfseOpen(false);
      setIsControlOpen(false);
    } else if (nextSection.startsWith('control')) {
      setIsControlOpen(true);
      setIsNfseOpen(false);
      setIsAccountingOpen(false);
    } else {
      setIsNfseOpen(false);
      setIsAccountingOpen(false);
      setIsControlOpen(false);
    }
  }, [pathname, params.companyId]);

  useEffect(() => {
    const token = localStorage.getItem('nfse_access_token');
    const storedUser = localStorage.getItem('nfse_user');
    if (!token) {
      router.replace('/login');
      return;
    }
    if (storedUser) setUser(JSON.parse(storedUser) as StoredUser);

    async function loadCompanies() {
      setIsLoading(true);
      setError('');
      try {
        const data = await requestApi<Company[]>('/companies');
        setCompanies(data);
        const canAccessSelected = data.some((company) => company.id === params.companyId);
        if (!canAccessSelected && data[0]?.id) {
          setActiveCompanyId(data[0].id);
          router.replace(pathForSection(data[0].id, 'home'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar as empresas.');
      } finally {
        setIsLoading(false);
      }
    }

    void loadCompanies();
  }, [params.companyId, router]);

  useEffect(() => {
    async function loadSectionData() {
      try {
        if (!canOpenSection(activeCompany, activeSection)) return;
        if ((activeSection === 'nfse-takers' || activeSection === 'nfse-list' || activeSection === 'nfse-recurring') && hasAnyPermission(activeCompany, ['nfse.takers.view', 'nfse.invoices.create', 'nfse.invoices.edit'])) await loadCustomers();
        if ((activeSection === 'nfse-list' || activeSection === 'nfse-recurring' || activeSection === 'settings' || activeSection === 'nfse-params') && hasAnyPermission(activeCompany, ['nfse.settings.view', 'nfse.invoices.create', 'nfse.invoices.edit', 'nfse.invoices.view'])) await loadServices();
        if ((activeSection === 'nfse-list' || activeSection === 'nfse-recurring') && canViewInvoices) await loadCompanySettings();
        if (activeSection === 'nfse-list' && canViewInvoices) await loadInvoices(1, invoicePageSize);
        if (activeSection === 'nfse-recurring' && canViewInvoices) await loadRecurrences();
        if (activeSection === 'accounting-taxes') await loadAccountingDepartments().catch(() => []);
        if (activeSection.startsWith('accounting')) await loadAccountingData(activeSection);
        if (activeSection.startsWith('control')) await loadControlOverview();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados do módulo.');
      }
    }
    if (!isLoading && activeCompanyId) void loadSectionData();
  }, [activeSection, activeCompanyId, activeCompany, isLoading]);

  useEffect(() => {
    if (isLoading || !activeCompany) return;
    if (canOpenSection(activeCompany, activeSection)) return;
    const fallback = firstAllowedSection(activeCompany);
    setActiveSection(fallback);
    router.replace(pathForSection(activeCompany.id, fallback));
  }, [isLoading, activeCompany, activeSection, router]);

  useEffect(() => {
    if (isLoading || !activeCompanyId || activeSection !== 'nfse-list') return;
    if (getDateFilterError(invoiceStartDate, invoiceEndDate)) return;
    const timer = window.setTimeout(() => {
      void loadInvoices(1, invoicePageSize).catch((err) => {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar as notas fiscais.');
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [invoiceSearch, invoiceStatus, invoiceStartDate, invoiceEndDate, invoicePageSize, invoiceSort, activeSection, activeCompanyId, isLoading]);

  useEffect(() => {
    if (isLoading || activeSection !== 'nfse-list' || !invoices.some((invoice) => invoice.status === 'PROCESSING')) return;
    const timer = window.setInterval(() => {
      void refreshInvoicesManually(true, 'processing').catch((err) => {
        setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível atualizar as notas em processamento.');
        setInvoiceMessageTone('error');
      });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [isLoading, activeSection, invoices, invoicePage, invoicePageSize, canSyncInvoices]);


  useEffect(() => {
    if (isLoading || !activeCompanyId || activeSection !== 'nfse-takers' || !canViewTakers) return;
    const timer = window.setTimeout(() => {
      void loadCustomers().catch((err) => {
        setTakerMessage(err instanceof Error ? err.message : 'Não foi possível carregar os tomadores.');
        setTakerMessageTone('error');
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [takerSort, activeSection, activeCompanyId, isLoading, canViewTakers]);

  useEffect(() => {
    if (isLoading || !activeCompanyId || !activeSection.startsWith('accounting')) return;
    const timer = window.setTimeout(() => {
      void loadAccountingData(activeSection).catch((err) => {
        setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível carregar a Contabilidade.');
        setAccountingMessageTone('error');
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [accountingSorts, accountingSearch, accountingDepartmentFilter, accountingStartDate, accountingEndDate, accountingPage, accountingPageSize, activeSection, activeCompanyId, isLoading]);

  useEffect(() => {
    if (isLoading || !activeCompanyId || activeSection !== 'accounting-requests' || isAccountingLoading) return;
    const timer = window.setInterval(() => {
      void loadAccountingData('accounting-requests', true).catch((err) => {
        setAccountingMessage(err instanceof Error ? err.message : 'Não foi possível atualizar as solicitações.');
        setAccountingMessageTone('error');
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [isLoading, activeCompanyId, activeSection, isAccountingLoading, accountingSorts]);
  function handleCompanyChange(companyId: string) {
    setActiveCompanyId(companyId);
    setCompanySettings(null);
    setAccountingData({ documents: [], taxes: [], requests: [], processes: [] });
    setAccountingMessage('');
    router.push(pathForSection(companyId, activeSection));
  }

  function handleLogout() {
    localStorage.removeItem('nfse_access_token');
    localStorage.removeItem('nfse_user');
    router.replace('/login');
  }

  function goToSection(section: ModuleSection) {
    if (!canOpenSection(activeCompany, section)) return;
    setActiveSection(section);
    if (section.startsWith('nfse')) {
      setIsNfseOpen(true);
      setIsAccountingOpen(false);
    } else if (section.startsWith('accounting')) {
      setIsAccountingOpen(true);
      setIsNfseOpen(false);
    } else {
      setIsNfseOpen(false);
      setIsAccountingOpen(false);
    }
    router.push(pathForSection(activeCompanyId, section));
  }

  function toggleSidebarCollapsed() {
    setIsCollapsed((current) => {
      const next = !current;
      localStorage.setItem('nfse_company_menu_collapsed', String(next));
      return next;
    });
  }

  function handleNfseMenuClick() {
    if (!canViewNfseModule) return;
    if (isNfseOpen) {
      setIsNfseOpen(false);
      return;
    }
    setIsNfseOpen(true);
    setIsAccountingOpen(false);
    setIsControlOpen(false);
    if (isCollapsed) {
      if (!activeSection.startsWith('nfse')) goToSection(canViewInvoices ? 'nfse-list' : canViewTakers ? 'nfse-takers' : 'nfse-params');
    }
  }

  function handleAccountingMenuClick() {
    if (!canViewAccountingModule) return;
    if (isAccountingOpen) {
      setIsAccountingOpen(false);
      return;
    }
    setIsAccountingOpen(true);
    setIsNfseOpen(false);
    setIsControlOpen(false);
    if (isCollapsed) {
      const nextAccounting = (['accounting-documents', 'accounting-taxes', 'accounting-requests', 'accounting-processes'] as ModuleSection[]).find((section) => canOpenSection(activeCompany, section));
      if (!activeSection.startsWith('accounting') && nextAccounting) goToSection(nextAccounting);
    }
  }

  function handleControlMenuClick() {
    if (!canViewControlModule) return;
    if (isControlOpen) {
      setIsControlOpen(false);
      return;
    }
    setIsControlOpen(true);
    setIsNfseOpen(false);
    setIsAccountingOpen(false);
    if (isCollapsed && !activeSection.startsWith('control')) goToSection('control-overview');
  }

  function municipalitySearchLabel(ibgeCode: string) {
    return activeCompany?.city && activeCompany?.state
      ? `${activeCompany.city}/${activeCompany.state}${ibgeCode ? ` - ${ibgeCode}` : ''}`
      : '';
  }

  function invoiceTemplateLabel(invoice: NfseInvoice) {
    const number = invoice.number || invoice.id.slice(0, 8);
    const customerName = invoice.customer?.name || 'Tomador não informado';
    return `${number} - ${customerName} - ${formatDate(invoice.issuedAt || invoice.createdAt)} - ${invoiceStatusLabel(invoice.status)}`;
  }

  function applyInvoiceToForm(invoice: NfseInvoice, settings?: NfseSettings | null) {
    const ibgeCode = onlyDigits(invoice.municipalIbgeCode || settings?.municipalIbgeCode || '');
    setInvoiceForm({
      customerId: invoice.customer?.id || '',
      competenceDate: formatDateForInput(invoice.competenceDate),
      serviceId: invoice.service?.id || '',
      municipalIbgeCode: ibgeCode,
      serviceDescription: invoice.serviceDescription || '',
      nationalTaxCode: invoice.nationalTaxCode || '',
      municipalServiceCode: invoice.municipalServiceCode || '',
      operationNature: '',
      amount: formatMoneyForInput(invoice.amount),
      issRate: formatDecimalForInput(invoice.issRate),
      issWithheld: Boolean(invoice.issWithheld),
      additionalInformation: invoice.additionalInformation || '',
    });
    setIssueMunicipalitySearch(municipalitySearchLabel(ibgeCode));
    setIssueMunicipalitySuggestions([]);
    setModalFieldErrors({});
  }

  function applyInvoiceTemplate(templateId: string) {
    setInvoiceTemplateId(templateId);
    setModalSuccess('');
    if (!templateId) return;
    const template = invoiceTemplates.find((invoice) => invoice.id === templateId);
    if (!template) {
      setModalError('NFS-e selecionada não foi encontrada para preencher os dados.');
      return;
    }
    applyInvoiceToForm(template, companySettings);
    setModalError('');
    setModalSuccess('Dados preenchidos com base na NFS-e selecionada.');
  }

  async function openIssueModal(invoice?: NfseInvoice) {
    if (invoice && !canEditInvoices) return;
    if (!invoice && !canCreateInvoices) return;
    let settings = companySettings;
    let currentServices = services;
    try {
      const [loadedSettings, loadedServices] = await Promise.all([loadCompanySettings(), services.length ? Promise.resolve(services) : loadServices()]);
      settings = loadedSettings;
      currentServices = loadedServices;
    } catch {
      settings = companySettings;
      currentServices = services;
    }
    const defaultIbge = onlyDigits(invoice?.municipalIbgeCode || settings?.municipalIbgeCode || '');
    const defaultMunicipality = municipalitySearchLabel(defaultIbge);
    const defaultService = currentServices.find((service) => service.isDefault) || currentServices[0] || null;
    setEditingInvoiceId(invoice?.id || null);
    setInvoiceTemplateId('');
    if (invoice) {
      setInvoiceTemplates([]);
      applyInvoiceToForm(invoice, settings);
    } else {
      setInvoiceForm({
        ...emptyInvoiceForm,
        customerId: '',
        competenceDate: '',
        serviceId: defaultService?.id || '',
        municipalIbgeCode: defaultIbge,
        serviceDescription: defaultService?.name || '',
        nationalTaxCode: defaultService?.nationalTaxCode || '',
        municipalServiceCode: defaultService?.municipalServiceCode || '',
        operationNature: '',
        amount: '',
        issRate: formatDecimalForInput(defaultService?.issRate),
        issWithheld: Boolean(settings?.defaultIssWithheld ?? defaultService?.isIssWithheld ?? false),
        additionalInformation: '',
      });
      void loadInvoiceTemplates();
    }
    if (!invoice) setIssueMunicipalitySearch(defaultMunicipality);
    setIssueMunicipalitySuggestions([]);
    setModalFieldErrors({});
    setModalError('');
    setModalSuccess('');
    setNfseModal('issue');
  }

  function closeNfseModal() {
    setNfseModal(null);
    setEditingInvoiceId(null);
    setInvoiceTemplateId('');
  }

  function openTakerModal(customer?: Customer) {
    if (customer && !canEditTakers) return;
    if (!customer && !canCreateTakers) return;
    setEditingTakerId(customer?.id || null);
    setTakerForm(customer ? {
      name: customer.name || '',
      document: customer.document || '',
      email: customer.email || '',
      phone: customer.phone || '',
      municipalRegistration: customer.municipalRegistration || '',
      stateRegistration: customer.stateRegistration || '',
      zipCode: customer.zipCode || '',
      address: customer.address || '',
      number: customer.number || '',
      neighborhood: customer.neighborhood || '',
      city: customer.city || '',
      state: customer.state || '',
      country: customer.country || 'Brasil',
    } : emptyTakerForm);
    setModalFieldErrors({});
    setModalError('');
    setModalSuccess('');
    setTakerMessage('');
    setNfseModal('taker');
  }

  function updateTaker<K extends keyof TakerForm>(key: K, value: TakerForm[K]) {
    setTakerForm((current) => ({ ...current, [key]: value }));
    setModalFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updateInvoice<K extends keyof InvoiceForm>(key: K, value: InvoiceForm[K]) {
    setInvoiceForm((current) => ({ ...current, [key]: value }));
    setModalFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updateRecurrence<K extends keyof RecurrenceForm>(key: K, value: RecurrenceForm[K]) {
    setRecurrenceForm((current) => ({ ...current, [key]: value }));
  }

  function selectDateInput(event: { currentTarget: HTMLInputElement }) {
    event.currentTarget.select();
  }

  function updateInvoiceDateFilter(field: 'start' | 'end', value: string) {
    if (field === 'start') setInvoiceStartDate(value);
    else setInvoiceEndDate(value);
  }

  function clearInvoiceDateFilter(field: 'start' | 'end') {
    updateInvoiceDateFilter(field, '');
  }

  function handleDateFilterKeyDown(field: 'start' | 'end', event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === 'Backspace' || event.key === 'Delete') && event.currentTarget.value) {
      event.preventDefault();
      clearInvoiceDateFilter(field);
    }
  }

  function canEditInvoice(invoice: NfseInvoice) {
    return canDeleteLocalInvoice(invoice);
  }

  function canTransmitInvoice(invoice: NfseInvoice) {
    return canDeleteLocalInvoice(invoice);
  }

  function canDeleteLocalInvoice(invoice: NfseInvoice) {
    return (invoice.status === 'DRAFT' || invoice.status === 'REJECTED') && !invoice.accessKey && !invoice.issuedAt;
  }

  function canCancelInvoice(invoice: NfseInvoice) {
    return invoice.status === 'AUTHORIZED' && Boolean(invoice.accessKey);
  }

  function reportModalErrors(errors: FieldErrors) {
    const firstField = Object.keys(errors)[0];
    setModalFieldErrors(errors);
    setModalError(firstField ? errors[firstField] || '' : '');
    if (firstField) scrollToField(firstField);
  }

  function validateTakerForm() {
    const errors: FieldErrors = {};
    const document = takerForm.document.trim();
    const digits = onlyDigits(document);
    const isForeignDocument = /[a-z]/i.test(document) || takerForm.country.trim().toLowerCase() !== 'brasil';

    if (!document) errors.document = 'Informe o CPF, CNPJ ou documento estrangeiro do tomador.';
    else if (!isForeignDocument && ![11, 14].includes(digits.length)) errors.document = 'Documento invalido. Informe CPF com 11 digitos ou CNPJ com 14 digitos.';
    else if (!isForeignDocument && digits.length === 11 && !isValidCpf(digits)) errors.document = 'CPF invalido. Confira os digitos informados.';
    else if (!isForeignDocument && digits.length === 14 && !isValidCnpj(digits)) errors.document = 'CNPJ invalido. Confira os digitos informados.';
    if (!takerForm.name.trim()) errors.name = 'Informe a razao social ou nome do tomador.';
    if (!isValidEmail(takerForm.email)) errors.email = 'Informe um e-mail valido.';
    if (takerForm.zipCode && onlyDigits(takerForm.zipCode).length !== 8) errors.zipCode = 'CEP invalido. Informe 8 digitos.';
    if (takerForm.state && takerForm.state.trim().length !== 2) errors.state = 'UF invalida. Informe 2 letras.';

    return errors;
  }

  function validateInvoiceForm() {
    const errors: FieldErrors = {};
    if (!invoiceForm.customerId) errors.customerId = 'Selecione o tomador da NFS-e.';
    if (!onlyDigits(invoiceForm.municipalIbgeCode) || onlyDigits(invoiceForm.municipalIbgeCode).length !== 7) errors.municipalIbgeCode = 'Selecione o município para preencher o código IBGE com 7 dígitos.';
    if (!isPositiveDecimal(invoiceForm.amount)) errors.amount = 'Informe o valor do serviço em formato monetário válido.';
    if (!isValidDecimal(invoiceForm.issRate)) errors.issRate = 'Alíquota ISS inválida. Use somente números e vírgula.';
    if (!invoiceForm.serviceDescription.trim()) errors.serviceDescription = 'Informe a discriminação do serviço.';
    return errors;
  }

  function validateInvoiceDraftForm() {
    const errors: FieldErrors = {};
    const ibge = onlyDigits(invoiceForm.municipalIbgeCode);
    if (ibge && ibge.length !== 7) errors.municipalIbgeCode = 'Código IBGE deve ter 7 dígitos.';
    if (invoiceForm.amount && !isValidDecimal(invoiceForm.amount)) errors.amount = 'Informe o valor do serviço em formato monetário válido.';
    if (invoiceForm.issRate && !isValidDecimal(invoiceForm.issRate)) errors.issRate = 'Alíquota ISS inválida. Use somente números e vírgula.';
    return errors;
  }

  async function loadIssueMunicipalities() {
    if (issueMunicipalities.length) return issueMunicipalities;
    const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
    const data = (await response.json()) as IbgeMunicipality[];
    setIssueMunicipalities(data);
    return data;
  }

  async function searchIssueMunicipalities(term: string) {
    setIssueMunicipalitySearch(term);
    updateInvoice('municipalIbgeCode', '');
    if (term.trim().length < 3) {
      setIssueMunicipalitySuggestions([]);
      return;
    }
    const key = normalize(term);
    try {
      const data = await loadIssueMunicipalities();
      const startsWith = data.filter((city) => normalize(city.nome).startsWith(key));
      const contains = data.filter((city) => !normalize(city.nome).startsWith(key) && normalize(city.nome).includes(key));
      setIssueMunicipalitySuggestions([...startsWith, ...contains].slice(0, 12));
    } catch {
      setIssueMunicipalitySuggestions([]);
    }
  }

  async function lookupTakerCnpj() {
    const cnpj = onlyDigits(takerForm.document);
    if (cnpj.length !== 14 || isTakerLookupLoading) return;
    setIsTakerLookupLoading(true);
    setModalFieldErrors((current) => ({ ...current, document: undefined }));
    try {
      const data = await requestApi<Partial<TakerForm> & { document?: string }>(`/companies/${activeCompanyId}/nfse/customers/lookup/cnpj?cnpj=${cnpj}`);
      setTakerForm((current) => ({
        ...current,
        document: data.document || cnpj,
        name: data.name || current.name,
        email: data.email || current.email,
        phone: data.phone || current.phone,
        municipalRegistration: data.municipalRegistration || current.municipalRegistration,
        stateRegistration: data.stateRegistration || current.stateRegistration,
        zipCode: data.zipCode || current.zipCode,
        address: data.address || current.address,
        number: data.number || current.number,
        neighborhood: data.neighborhood || current.neighborhood,
        city: data.city || current.city,
        state: data.state || current.state,
        country: data.country || current.country,
      }));
      setModalSuccess('Dados do CNPJ preenchidos automaticamente. Confira antes de salvar.');
    } catch (err) {
      setModalSuccess('');
      setModalFieldErrors((current) => ({ ...current, document: err instanceof Error ? err.message : 'Não foi possível consultar o CNPJ.' }));
    } finally {
      setIsTakerLookupLoading(false);
    }
  }

  async function lookupTakerCep() {
    const cep = onlyDigits(takerForm.zipCode);
    if (cep.length !== 8 || isCepLookupLoading) return;
    setIsCepLookupLoading(true);
    setModalFieldErrors((current) => ({ ...current, zipCode: undefined }));
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!response.ok || data.erro) {
        setModalFieldErrors((current) => ({ ...current, zipCode: 'CEP não encontrado.' }));
        return;
      }
      setTakerForm((current) => ({
        ...current,
        zipCode: cep,
        address: data.logradouro || current.address,
        neighborhood: data.bairro || current.neighborhood,
        city: data.localidade || current.city,
        state: data.uf || current.state,
        country: 'Brasil',
      }));
      setModalSuccess('Endereço preenchido automaticamente pelo CEP. Confira antes de salvar.');
    } catch {
      setModalFieldErrors((current) => ({ ...current, zipCode: 'Não foi possível buscar o CEP agora.' }));
    } finally {
      setIsCepLookupLoading(false);
    }
  }

  function handleServiceChange(serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    setInvoiceForm((current) => ({
      ...current,
      serviceId,
      serviceDescription: service?.name || current.serviceDescription,
      nationalTaxCode: service?.nationalTaxCode || current.nationalTaxCode,
      municipalServiceCode: service?.municipalServiceCode || current.municipalServiceCode,
      issRate: service?.issRate === null || service?.issRate === undefined ? current.issRate : formatDecimalForInput(service.issRate),
    }));
  }

  function handleRecurrenceServiceChange(serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    setRecurrenceForm((current) => ({
      ...current,
      serviceId,
      serviceDescription: service?.name || current.serviceDescription,
      nationalTaxCode: service?.nationalTaxCode || current.nationalTaxCode,
      municipalServiceCode: service?.municipalServiceCode || current.municipalServiceCode,
      issRate: service?.issRate === null || service?.issRate === undefined ? current.issRate : formatDecimalForInput(service.issRate),
      issWithheld: Boolean(companySettings?.defaultIssWithheld ?? service?.isIssWithheld ?? current.issWithheld),
    }));
  }

  async function saveTaker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateTakerForm();
    if (Object.keys(errors).length) {
      reportModalErrors(errors);
      return;
    }
    setIsModalSaving(true);
    setModalError('');
    setModalSuccess('');
    setModalFieldErrors({});
    try {
      const rawDocument = takerForm.document.trim();
      const isForeignDocument = /[a-z]/i.test(rawDocument) || takerForm.country.trim().toLowerCase() !== 'brasil';
      const document = isForeignDocument ? rawDocument.toUpperCase() : onlyDigits(rawDocument);
      await requestApi<Customer>(
        editingTakerId ? `/companies/${activeCompanyId}/nfse/customers/${editingTakerId}` : `/companies/${activeCompanyId}/nfse/customers`,
        {
          method: editingTakerId ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...takerForm,
            document,
            foreignDocument: isForeignDocument ? document : '',
            isForeign: isForeignDocument,
            phone: onlyDigits(takerForm.phone) || takerForm.phone,
            zipCode: onlyDigits(takerForm.zipCode),
          }),
        },
      );
      setModalSuccess(editingTakerId ? 'Tomador atualizado com sucesso.' : 'Tomador cadastrado com sucesso.');
      setTakerMessage(editingTakerId ? 'Tomador atualizado com sucesso.' : 'Tomador cadastrado com sucesso.');
      setTakerMessageTone('success');
      setEditingTakerId(null);
      setTakerForm(emptyTakerForm);
      await loadCustomers();
      setNfseModal(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Não foi possível salvar o tomador.');
      scrollToField('modal-footer');
    } finally {
      setIsModalSaving(false);
    }
  }

  function customerInvoiceCount(customer: Customer) {
    return customer._count?.invoices || 0;
  }

  async function toggleTakerActive(customer: Customer, isActive: boolean) {
    try {
      await requestApi<Customer>(`/companies/${activeCompanyId}/nfse/customers/${customer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive,
        }),
      });
      await loadCustomers();
      setTakerMessage(isActive ? 'Tomador reativado com sucesso.' : 'Tomador inativado com sucesso.');
      setTakerMessageTone('success');
    } catch (err) {
      setTakerMessage(err instanceof Error ? err.message : isActive ? 'Não foi possível reativar o tomador.' : 'Não foi possível inativar o tomador.');
      setTakerMessageTone('error');
    }
  }

  async function removeTaker(customer: Customer) {
    if (customerInvoiceCount(customer) > 0) {
      setTakerMessage('Tomador já utilizado em nota fiscal. Para preservar o histórico, ele pode apenas ser inativado.');
      setTakerMessageTone('error');
      return;
    }
    if (!window.confirm(`Excluir definitivamente o tomador "${customer.name}"?`)) return;
    try {
      await requestApi<Customer>(`/companies/${activeCompanyId}/nfse/customers/${customer.id}`, { method: 'DELETE' });
      await loadCustomers();
      setTakerMessage('Tomador excluido com sucesso.');
      setTakerMessageTone('success');
    } catch (err) {
      setTakerMessage(err instanceof Error ? err.message : 'Não foi possível excluir o tomador.');
      setTakerMessageTone('error');
    }
  }

  function invoiceApiPayload() {
    const { operationNature: _ignoredOperationNature, ...payload } = invoiceForm;
    return { ...payload, amount: decimalToApiString(invoiceForm.amount), issRate: decimalToApiString(invoiceForm.issRate) };
  }

  async function persistInvoiceLocally() {
    const saved = await requestApi<NfseInvoice>(editingInvoiceId ? `/companies/${activeCompanyId}/nfse/invoices/${editingInvoiceId}` : `/companies/${activeCompanyId}/nfse/invoices`, {
      method: editingInvoiceId ? 'PATCH' : 'POST',
      body: JSON.stringify(invoiceApiPayload()),
    });
    if (!editingInvoiceId) setEditingInvoiceId(saved.id);
    return saved;
  }

  async function saveInvoiceLocal() {
    const errors = validateInvoiceDraftForm();
    if (Object.keys(errors).length) {
      reportModalErrors(errors);
      return;
    }
    setIsModalSaving(true);
    setModalError('');
    setModalSuccess('');
    setModalFieldErrors({});
    try {
      await persistInvoiceLocally();
      setModalSuccess('Rascunho salvo. Você pode continuar preenchendo agora ou reabrir pelo botão editar depois.');
      setInvoiceMessage('Rascunho da NFS-e salvo localmente.');
      setInvoiceMessageTone('success');
      await loadInvoices(1, invoicePageSize);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Não foi possível salvar a NFS-e.');
      scrollToField('modal-footer');
    } finally {
      setIsModalSaving(false);
    }
  }

  async function saveAndTransmitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateInvoiceForm();
    if (Object.keys(errors).length) {
      reportModalErrors(errors);
      return;
    }
    setIsModalSaving(true);
    setModalError('');
    setModalSuccess('');
    setModalFieldErrors({});
    let saved: NfseInvoice | null = null;
    try {
      saved = await persistInvoiceLocally();
      await requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices/${saved.id}/transmit`, { method: 'POST' });
      setInvoiceMessage(editingInvoiceId ? 'NFS-e atualizada e enviada para transmissão.' : 'NFS-e enviada para transmissão.');
      setInvoiceMessageTone('success');
      setModalSuccess('NFS-e enviada para transmissão.');
      closeNfseModal();
      await loadInvoices(1, invoicePageSize);
      router.push(pathForSection(activeCompanyId, 'nfse-list'));
    } catch (err) {
      if (saved?.id) {
        setEditingInvoiceId(saved.id);
        await loadInvoices(1, invoicePageSize);
      }
      const baseMessage = err instanceof Error ? err.message : 'Não foi possível transmitir a NFS-e.';
      setModalError(saved?.id ? `${baseMessage} A NFS-e ficou salva localmente; ao tentar novamente ela será atualizada, não duplicada.` : baseMessage);
      scrollToField('modal-footer');
    } finally {
      setIsModalSaving(false);
    }
  }

  async function transmitExistingInvoice(invoiceId: string) {
    try {
      await requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices/${invoiceId}/transmit`, { method: 'POST' });
      setInvoiceMessage('NFS-e enviada para transmissão.');
      setInvoiceMessageTone('success');
      await loadInvoices(invoicePage, invoicePageSize);
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível transmitir a NFS-e.');
      setInvoiceMessageTone('error');
    }
  }

  async function deleteLastInvoice(invoice: NfseInvoice) {
    if (!canDeleteLocalInvoice(invoice)) {
      setInvoiceMessage('Apenas NFS-e local em rascunho ou rejeitada, sem chave de acesso, pode ser excluída.');
      setInvoiceMessageTone('error');
      return;
    }
    if (!window.confirm(`Excluir definitivamente a NFS-e ${invoice.number || invoice.id.slice(0, 8)}?`)) return;
    try {
      const result = await requestApi<DeleteInvoiceResponse>(`/companies/${activeCompanyId}/nfse/invoices/${invoice.id}`, { method: 'DELETE' });
      setInvoiceMessage(`NFS-e excluída. Próxima numeração local: ${result.nextNumber}.`);
      setInvoiceMessageTone('success');
      await loadInvoices(1, invoicePageSize);
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível excluir a NFS-e.');
      setInvoiceMessageTone('error');
    }
  }

  function openCancelInvoiceModal(invoice: NfseInvoice) {
    setCancelInvoiceTarget(invoice);
    setCancelInvoiceForm(emptyCancelInvoiceForm);
    setInvoiceMessage('');
  }

  async function cancelAuthorizedInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompanyId || !cancelInvoiceTarget) return;
    const reasonText = cancelInvoiceForm.reasonText.trim();
    if (reasonText.length < 15 || reasonText.length > 255) {
      setInvoiceMessage('Justificativa do cancelamento deve ter entre 15 e 255 caracteres.');
      setInvoiceMessageTone('error');
      return;
    }
    setIsCancelInvoiceSaving(true);
    setInvoiceMessage('');
    try {
      await requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices/${cancelInvoiceTarget.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reasonCode: cancelInvoiceForm.reasonCode, reasonText }),
      });
      setCancelInvoiceTarget(null);
      setCancelInvoiceForm(emptyCancelInvoiceForm);
      setInvoiceMessage('NFS-e cancelada na plataforma nacional.');
      setInvoiceMessageTone('success');
      await loadInvoices(invoicePage, invoicePageSize);
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível cancelar a NFS-e.');
      setInvoiceMessageTone('error');
    } finally {
      setIsCancelInvoiceSaving(false);
    }
  }
  async function deleteSelectedLocalInvoices() {
    const ids = deletableSelectedInvoices.map((invoice) => invoice.id);
    if (!ids.length) {
      setInvoiceMessage('Selecione ao menos uma NFS-e local sem chave de acesso para excluir.');
      setInvoiceMessageTone('error');
      return;
    }
    const skipped = selectedInvoices.length - ids.length;
    const warning = skipped > 0 ? ` ${skipped} nota(s) selecionada(s) não serão excluídas por já terem chave, emissão ou status não local.` : '';
    if (!window.confirm(`Excluir definitivamente ${ids.length} NFS-e local(is) selecionada(s)?${warning}`)) return;
    try {
      const result = await requestApi<DeleteInvoiceResponse>(`/companies/${activeCompanyId}/nfse/invoices`, {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      });
      const deletedCount = result.deletedIds?.length || ids.length;
      setInvoiceMessage(`${deletedCount} NFS-e local(is) excluída(s). Próxima numeração local: ${result.nextNumber}.`);
      setInvoiceMessageTone('success');
      await loadInvoices(1, invoicePageSize);
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível excluir as NFS-e selecionadas.');
      setInvoiceMessageTone('error');
    }
  }

  async function fetchStoredFile(invoiceId: string, kind: 'xml' | 'pdf'): Promise<DownloadableStoredFile> {
    const file = await requestApi<StoredFile>(`/companies/${activeCompanyId}/nfse/invoices/${invoiceId}/${kind}`);
    if (!file.contentBase64) throw new Error(`${file.kind} ainda não possui conteúdo disponível para download.`);
    return file as DownloadableStoredFile;
  }

  async function showStoredFile(invoiceId: string, kind: 'xml' | 'pdf') {
    try {
      const file = await fetchStoredFile(invoiceId, kind);
      const mimeType = file.mimeType || (kind === 'pdf' ? 'application/pdf' : 'application/xml');
      downloadBlob(new Blob([base64ToBytes(file.contentBase64)], { type: mimeType }), file.fileName);
      setInvoiceMessage(`${file.kind} baixado: ${file.fileName}.`);
      setInvoiceMessageTone('success');
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Arquivo ainda não disponível.');
      setInvoiceMessageTone('error');
    }
  }

  function toggleInvoiceSelection(invoiceId: string) {
    setSelectedInvoiceIds((current) => current.includes(invoiceId) ? current.filter((id) => id !== invoiceId) : [...current, invoiceId]);
  }

  function toggleAllInvoices() {
    setSelectedInvoiceIds((current) => allInvoicesSelected ? current.filter((id) => !invoices.some((invoice) => invoice.id === id)) : Array.from(new Set([...current, ...invoices.map((invoice) => invoice.id)])));
  }

  async function downloadSelected(kind: 'pdf' | 'xml') {
    if (!selectedInvoices.length) return;
    try {
      const entries = await Promise.all(selectedInvoices.map(async (invoice) => {
        const file = await fetchStoredFile(invoice.id, kind);
        return { name: file.fileName, content: base64ToBytes(file.contentBase64 || '') };
      }));
      downloadBlob(createZip(entries), kind === 'pdf' ? 'nfse-pdfs-selecionadas.zip' : 'nfse-xmls-selecionados.zip');
      setInvoiceMessage(`${kind === 'pdf' ? 'PDFs' : 'XMLs'} baixado(s) com sucesso.`);
      setInvoiceMessageTone('success');
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : `Não foi possível baixar os ${kind === 'pdf' ? 'PDFs' : 'XMLs'} selecionados.`);
      setInvoiceMessageTone('error');
    }
  }

  function renderDownloadLink(url?: string, label = 'Baixar') {
    if (!url) return <span className="accounting-muted">Sem arquivo</span>;
    return <a className="companies-button companies-button--ghost companies-button--mini" href={url} target="_blank" rel="noreferrer">{label}</a>;
  }

  function renderAccountingDocuments(items: AccountingDocumentItem[]) {
    return (
      <table className="nfse-table accounting-table">
        <thead><tr><th>{renderSortButton('Prazo', 'dueDate', accountingSorts['accounting-documents'], (key) => changeAccountingSort('accounting-documents', key))}</th><th>{renderSortButton('Data de envio', 'sentAt', accountingSorts['accounting-documents'], (key) => changeAccountingSort('accounting-documents', key))}</th><th>{renderSortButton('Descrição', 'description', accountingSorts['accounting-documents'], (key) => changeAccountingSort('accounting-documents', key))}</th><th>{renderSortButton('Departamento', 'department', accountingSorts['accounting-documents'], (key) => changeAccountingSort('accounting-documents', key))}</th><th>{renderSortButton('Status', 'status', accountingSorts['accounting-documents'], (key) => changeAccountingSort('accounting-documents', key))}</th><th>Arquivo</th></tr></thead>
        <tbody>
          {items.length ? items.map((item) => (
            <tr key={`${item.id}-${item.description}`}>
              <td>{formatAccountingDate(item.dueDate)}</td>
              <td>{formatAccountingDate(item.sentAt)}</td>
              <td><strong>{item.description || '-'}</strong>{item.responsible ? <small>Responsável: {item.responsible}</small> : null}</td>
              <td>{item.department || '-'}</td>
              <td><span className="nfse-chip">{item.status || '-'}</span></td>
              <td>{renderAccountingDownload(item)}</td>
            </tr>
          )) : <tr><td colSpan={6} className="nfse-empty-row">Nenhum documento encontrado na Acessórias.</td></tr>}
        </tbody>
      </table>
    );
  }

  function renderAccountingTaxes(items: AccountingTaxItem[]) {
    return (
      <table className="nfse-table accounting-table">
        <thead><tr><th>{renderSortButton('Prazo', 'dueDate', accountingSorts['accounting-taxes'], (key) => changeAccountingSort('accounting-taxes', key))}</th><th>{renderSortButton('Data de envio', 'sentAt', accountingSorts['accounting-taxes'], (key) => changeAccountingSort('accounting-taxes', key))}</th><th>{renderSortButton('Documento/guia', 'description', accountingSorts['accounting-taxes'], (key) => changeAccountingSort('accounting-taxes', key))}</th><th>{renderSortButton('Departamento', 'department', accountingSorts['accounting-taxes'], (key) => changeAccountingSort('accounting-taxes', key))}</th><th>{renderSortButton('Status', 'status', accountingSorts['accounting-taxes'], (key) => changeAccountingSort('accounting-taxes', key))}</th><th>Arquivo</th></tr></thead>
        <tbody>
          {items.length ? items.map((item) => (
            <tr key={`${item.id}-${item.description}`}>
              <td>{formatAccountingDate(item.dueDate)}</td>
              <td>{formatAccountingDate(item.sentAt)}</td>
              <td><strong>{item.description || '-'}</strong>{item.competence ? <small>Competência: {formatAccountingDate(item.competence)}</small> : null}</td>
              <td>{item.department || '-'}</td>
              <td><span className="nfse-chip">{item.status || '-'}</span></td>
              <td>{renderAccountingDownload(item)}</td>
            </tr>
          )) : <tr><td colSpan={6} className="nfse-empty-row">Nenhum imposto ou guia encontrado na Acessórias.</td></tr>}
        </tbody>
      </table>
    );
  }

  function renderAccountingRequests(items: AccountingRequestItem[]) {
    return (
      <table className="nfse-table accounting-table">
        <thead><tr><th>{renderSortButton('Abertura', 'openedAt', accountingSorts['accounting-requests'], (key) => changeAccountingSort('accounting-requests', key))}</th><th>{renderSortButton('Prazo', 'dueDate', accountingSorts['accounting-requests'], (key) => changeAccountingSort('accounting-requests', key))}</th><th>{renderSortButton('Solicitação', 'description', accountingSorts['accounting-requests'], (key) => changeAccountingSort('accounting-requests', key))}</th><th>{renderSortButton('Departamento', 'department', accountingSorts['accounting-requests'], (key) => changeAccountingSort('accounting-requests', key))}</th><th>{renderSortButton('Status', 'status', accountingSorts['accounting-requests'], (key) => changeAccountingSort('accounting-requests', key))}</th><th>Responsáveis</th><th>Arquivos</th><th>Ações</th></tr></thead>
        <tbody>
          {items.length ? items.map((item) => (
            <tr key={item.id}>
              <td>{formatAccountingDate(item.openedAt)}</td>
              <td>{formatAccountingDate(item.dueDate)}</td>
              <td><strong>{item.subject || '-'}</strong>{item.priority ? <small>Prioridade: {item.priority}</small> : null}</td>
              <td>{item.department || '-'}</td>
              <td><span className="nfse-chip">{item.status || '-'}</span></td>
              <td>{[...(item.officeResponsibles || []), ...(item.companyResponsibles || [])].filter(Boolean).join(', ') || '-'}</td>
              <td>{renderAccountingDownload(item)}</td>
              <td><button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => void openAccountingDetail('requests', item)} disabled={isAccountingDetailLoading}>Detalhes</button></td>
            </tr>
          )) : <tr><td colSpan={8} className="nfse-empty-row">Nenhuma solicitação encontrada na Acessórias.</td></tr>}
        </tbody>
      </table>
    );
  }
  function renderAccountingProcesses(items: AccountingProcessItem[]) {
    return (
      <table className="nfse-table accounting-table">
        <thead><tr><th>{renderSortButton('Início', 'openedAt', accountingSorts['accounting-processes'], (key) => changeAccountingSort('accounting-processes', key))}</th><th>{renderSortButton('Conclusão', 'updatedAt', accountingSorts['accounting-processes'], (key) => changeAccountingSort('accounting-processes', key))}</th><th>{renderSortButton('Processo', 'description', accountingSorts['accounting-processes'], (key) => changeAccountingSort('accounting-processes', key))}</th><th>{renderSortButton('Departamento', 'department', accountingSorts['accounting-processes'], (key) => changeAccountingSort('accounting-processes', key))}</th><th>{renderSortButton('Status', 'status', accountingSorts['accounting-processes'], (key) => changeAccountingSort('accounting-processes', key))}</th><th>Progresso</th><th>Ações</th></tr></thead>
        <tbody>
          {items.length ? items.map((item) => (
            <tr key={item.id}>
              <td>{formatAccountingDate(item.startedAt)}</td>
              <td>{formatAccountingDate(item.completedAt)}</td>
              <td><strong>{item.name || '-'}</strong>{item.manager ? <small>Gestor: {item.manager}</small> : null}</td>
              <td>{item.department || '-'}</td>
              <td><span className="nfse-chip">{item.status || '-'}</span></td>
              <td>{item.percentage || '-'}</td>
              <td><button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => void openAccountingDetail('processes', item)} disabled={isAccountingDetailLoading}>Detalhes</button></td>
            </tr>
          )) : <tr><td colSpan={7} className="nfse-empty-row">Nenhum processo encontrado na Acessórias.</td></tr>}
        </tbody>
      </table>
    );
  }
  function renderAccountingContent() {
    if (activeSection === 'accounting-documents') return renderAccountingDocuments(accountingData.documents);
    if (activeSection === 'accounting-taxes') return renderAccountingTaxes(accountingData.taxes);
    if (activeSection === 'accounting-requests') return renderAccountingRequests(accountingData.requests);
    if (activeSection === 'accounting-processes') return renderAccountingProcesses(accountingData.processes);
    return null;
  }

  function controlDepartmentForSection(section: ModuleSection) {
    if (section === 'control-accounting') return 'accounting';
    if (section === 'control-tax') return 'tax';
    if (section === 'control-payroll') return 'payroll';
    return '';
  }

  function renderControlContent() {
    const departments = controlOverview?.departments || [];
    const selectedDepartment = controlDepartmentForSection(activeSection);
    const items = selectedDepartment ? departments.filter((department) => department.department === selectedDepartment) : departments;
    if (isControlLoading) return <p className="company-module-empty">Consultando e-Kontroll...</p>;
    if (!controlOverview?.configured) return <p className="company-module-empty">Integração e-Kontroll preparada no backend. Configure as chaves e métodos oficiais para carregar indicadores reais.</p>;
    return (
      <div className="control-grid">
        {items.map((department) => (
          <article className="control-panel" key={department.department}>
            <div className="control-panel__header">
              <div><h2>{department.title}</h2><p>{department.description}</p></div>
              <span>{department.cards.length} indicadores</span>
            </div>
            <div className="control-indicators">
              {department.cards.map((indicator) => <span key={indicator.id}><strong>{indicator.name}</strong><small>{indicator.description}</small><em>{indicator.value || 'Aguardando dados'}</em></span>)}
            </div>
            <div className="control-chart-placeholder">
              <strong>Gráficos gerenciais</strong>
              <p>Quando os métodos e-Kontroll estiverem mapeados, este espaço exibirá séries comparativas por competência.</p>
            </div>
          </article>
        ))}
      </div>
    );
  }

  const modal = nfseModal ? (
    <div className="nfse-modal-backdrop" role="presentation">
      <section className="nfse-modal" role="dialog" aria-modal="true">
        <button className="companies-close modal-close" type="button" onClick={closeNfseModal}>x</button>
        {nfseModal === 'issue' ? (
          <>
            <div className="nfse-modal__heading">
              <h2>{editingInvoiceId ? 'Editar NFS-e' : 'Emitir NFS-e'}</h2>
              <p>{editingInvoiceId ? 'Ajuste a nota local antes de transmitir novamente.' : 'Dados iniciais da DPS/RPS para transmissão à API nacional de NFS-e.'}</p>
            </div>
            <form className="nfse-form nfse-form--issue" onSubmit={saveAndTransmitInvoice} noValidate autoComplete="off">
              {!editingInvoiceId ? (
                <div className="nfse-issue-template-row">
                  <label>NFS-e já emitida
                    <select value={invoiceTemplateId} onChange={(event) => applyInvoiceTemplate(event.target.value)} disabled={isInvoiceTemplateLoading || invoiceTemplates.length === 0}>
                      <option value="">{isInvoiceTemplateLoading ? 'Carregando notas...' : 'Selecione uma NFS-e para usar como base...'}</option>
                      {invoiceTemplates.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoiceTemplateLabel(invoice)}</option>)}
                    </select>
                  </label>
                </div>
              ) : null}
              <label className={modalFieldErrors.customerId ? 'is-invalid' : ''} data-field="customerId">Tomador
                <select value={invoiceForm.customerId} onChange={(event) => updateInvoice('customerId', event.target.value)} required>
                  <option value="">Selecione o tomador...</option>
                  {customers.filter((customer) => customer.isActive !== false).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
                {modalFieldErrors.customerId ? <span className="field-error">● {modalFieldErrors.customerId}</span> : null}
              </label>
              <label>Serviço
                <select value={invoiceForm.serviceId} onChange={(event) => handleServiceChange(event.target.value)}>
                  <option value="">Selecione o serviço...</option>
                  {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
              </label>
              <label>Data de competência
                <input type="date" value={invoiceForm.competenceDate} onChange={(event) => updateInvoice('competenceDate', event.target.value)} />
              </label>
              <label className={`nfse-city-combobox-field ${modalFieldErrors.municipalIbgeCode ? 'is-invalid' : ''}`} data-field="municipalIbgeCode">Município de incidência
                <div className="nfse-city-combobox">
                  <input value={issueMunicipalitySearch} onChange={(event) => void searchIssueMunicipalities(event.target.value)} placeholder="Digite o município" autoComplete="off" />
                  {issueMunicipalitySuggestions.length ? (
                    <div className="nfse-city-combobox__list">
                      {issueMunicipalitySuggestions.map((city) => (
                        <button
                          key={city.id}
                          className="nfse-city-combobox__option"
                          type="button"
                          onClick={() => {
                            updateInvoice('municipalIbgeCode', String(city.id));
                            setIssueMunicipalitySearch(municipalityLabel(city));
                            setIssueMunicipalitySuggestions([]);
                          }}
                        >
                          {municipalityLabel(city)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {modalFieldErrors.municipalIbgeCode ? <span className="field-error">● {modalFieldErrors.municipalIbgeCode}</span> : null}
              </label>
              <label className="nfse-issue-code-field">Código de tributação nacional
                <input value={invoiceForm.nationalTaxCode} onChange={(event) => updateInvoice('nationalTaxCode', event.target.value)} placeholder="Ex.: 01.01.01" />
              </label>
              <label className="nfse-issue-code-field">Código do serviço municipal
                <input value={invoiceForm.municipalServiceCode} onChange={(event) => updateInvoice('municipalServiceCode', event.target.value)} placeholder="Opcional" />
              </label>
              <label className={modalFieldErrors.amount ? 'is-invalid' : ''} data-field="amount">Valor do serviço
                <input value={invoiceForm.amount} onChange={(event) => updateInvoice('amount', formatMoneyCentsInput(event.target.value))} onBlur={() => updateInvoice('amount', formatMoneyForInput(invoiceForm.amount))} placeholder="0,00" required inputMode="decimal" />
                {modalFieldErrors.amount ? <span className="field-error">● {modalFieldErrors.amount}</span> : null}
              </label>
              <label className={modalFieldErrors.issRate ? 'is-invalid' : ''} data-field="issRate">Alíquota ISS
                <input value={invoiceForm.issRate} onChange={(event) => updateInvoice('issRate', formatDecimalInput(event.target.value, 4))} onBlur={() => updateInvoice('issRate', formatDecimalForInput(invoiceForm.issRate))} placeholder="0,00%" inputMode="decimal" />
                {modalFieldErrors.issRate ? <span className="field-error">● {modalFieldErrors.issRate}</span> : null}
              </label>
              <label className="nfse-field-compact">Retenção ISS
                <select value={invoiceForm.issWithheld ? 'true' : 'false'} onChange={(event) => updateInvoice('issWithheld', event.target.value === 'true')}>
                  <option value="false">Não</option>
                  <option value="true">Sim</option>
                </select>
              </label>
              <label className={`is-half ${modalFieldErrors.serviceDescription ? 'is-invalid' : ''}`} data-field="serviceDescription">Discriminação do serviço
                <textarea value={invoiceForm.serviceDescription} onChange={(event) => updateInvoice('serviceDescription', event.target.value)} placeholder="Descreva o serviço prestado..." required />
                {modalFieldErrors.serviceDescription ? <span className="field-error">● {modalFieldErrors.serviceDescription}</span> : null}
              </label>
              <label className="is-half">Informações complementares
                <textarea value={invoiceForm.additionalInformation} onChange={(event) => updateInvoice('additionalInformation', event.target.value)} placeholder="Observações para a nota fiscal..." />
              </label>
              <div className="companies-form-footer" data-field="modal-footer">
                {modalError ? <p className="nfse-form-message" data-tone="error">{modalError}</p> : null}
                {modalSuccess ? <p className="nfse-form-message" data-tone="success">{modalSuccess}</p> : null}
                <button className="companies-button companies-button--ghost" type="button" onClick={closeNfseModal}>Cancelar</button>
                {(editingInvoiceId ? canEditInvoices : canCreateInvoices) ? <button className="companies-button companies-button--ghost" type="button" onClick={() => void saveInvoiceLocal()} disabled={isModalSaving}>{isModalSaving ? 'Salvando...' : 'Salvar rascunho'}</button> : null}
                {canTransmitInvoices ? <button className="companies-button companies-button--primary" type="submit" disabled={isModalSaving}>{isModalSaving ? 'Transmitindo...' : editingInvoiceId ? 'Salvar e transmitir' : 'Transmitir NFS-e'}</button> : null}
              </div>
            </form>
          </>
        ) : null}
        {nfseModal === 'taker' ? (
          <>
            <div className="nfse-modal__heading">
              <h2>{editingTakerId ? 'Editar tomador' : 'Cadastrar tomador'}</h2>
              <p>{editingTakerId ? 'Atualize o cadastro que será usado nas próximas emissões.' : 'Cadastro base para emissão das notas fiscais de serviço.'}</p>
            </div>
            <form className="nfse-form" onSubmit={saveTaker} noValidate>
              <label className={modalFieldErrors.document ? 'is-invalid' : ''} data-field="document">CPF/CNPJ/Documento
                <input
                  value={formatDocument(takerForm.document)}
                  onBlur={() => void lookupTakerCnpj()}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateTaker('document', /[a-z]/i.test(value) ? value.toUpperCase() : onlyDigits(value));
                  }}
                  placeholder="CPF, CNPJ ou documento estrangeiro"
                  required
                />
                {isTakerLookupLoading ? <small>Buscando CNPJ...</small> : null}
                {modalFieldErrors.document ? <span className="field-error">● {modalFieldErrors.document}</span> : null}
              </label>
              <label className={modalFieldErrors.name ? 'is-invalid' : ''} data-field="name">Razão social / Nome
                <input value={takerForm.name} onChange={(event) => updateTaker('name', event.target.value)} placeholder="Nome do tomador" required />
                {modalFieldErrors.name ? <span className="field-error">● {modalFieldErrors.name}</span> : null}
              </label>
              <label className={modalFieldErrors.email ? 'is-invalid' : ''} data-field="email">E-mail
                <input type="email" value={takerForm.email} onChange={(event) => updateTaker('email', event.target.value)} placeholder="email@tomador.com.br" />
                {modalFieldErrors.email ? <span className="field-error">● {modalFieldErrors.email}</span> : null}
              </label>
              <label>Inscrição Municipal
                <input value={takerForm.municipalRegistration} onChange={(event) => updateTaker('municipalRegistration', event.target.value)} placeholder="Opcional" />
              </label>
              <label>Telefone
                <input value={formatPhone(takerForm.phone)} onChange={(event) => updateTaker('phone', onlyDigits(event.target.value))} placeholder="(00) 00000-0000" inputMode="tel" />
              </label>
              <label className="is-half">Endereço
                <input value={takerForm.address} onChange={(event) => updateTaker('address', event.target.value)} placeholder="Logradouro" />
              </label>
              <label>Número
                <input value={takerForm.number} onChange={(event) => updateTaker('number', event.target.value)} />
              </label>
              <label className={modalFieldErrors.zipCode ? 'is-invalid' : ''} data-field="zipCode">CEP
                <input value={formatCep(takerForm.zipCode)} onBlur={() => void lookupTakerCep()} onChange={(event) => updateTaker('zipCode', onlyDigits(event.target.value))} placeholder="00000-000" inputMode="numeric" />
                {isCepLookupLoading ? <small>Buscando CEP...</small> : null}
                {modalFieldErrors.zipCode ? <span className="field-error">● {modalFieldErrors.zipCode}</span> : null}
              </label>
              <label>Bairro
                <input value={takerForm.neighborhood} onChange={(event) => updateTaker('neighborhood', event.target.value)} />
              </label>
              <label>Cidade
                <input value={takerForm.city} onChange={(event) => updateTaker('city', event.target.value)} />
              </label>
              <label className={modalFieldErrors.state ? 'is-invalid' : ''} data-field="state">UF
                <input value={takerForm.state} onChange={(event) => updateTaker('state', event.target.value.toUpperCase())} maxLength={2} />
                {modalFieldErrors.state ? <span className="field-error">● {modalFieldErrors.state}</span> : null}
              </label>
              <div className="companies-form-footer" data-field="modal-footer">
                {modalError ? <p className="nfse-form-message" data-tone="error">{modalError}</p> : null}
                {modalSuccess ? <p className="nfse-form-message" data-tone="success">{modalSuccess}</p> : null}
                <button className="companies-button companies-button--ghost" type="button" onClick={closeNfseModal}>Cancelar</button>
                <button className="companies-button companies-button--primary" type="submit" disabled={isModalSaving}>{isModalSaving ? 'Salvando...' : editingTakerId ? 'Salvar alterações' : 'Salvar tomador'}</button>
              </div>
            </form>
          </>
        ) : null}
      </section>
    </div>
  ) : null;

  const accountingRequestModal = showAccountingRequestModal ? (
    <div className="nfse-modal-backdrop" role="presentation">
      <section className="nfse-modal nfse-modal--accounting" role="dialog" aria-modal="true">
        <button className="companies-close modal-close" type="button" onClick={() => setShowAccountingRequestModal(false)}>x</button>
        <div className="nfse-modal__heading">
          <h2>Nova solicitação</h2>
          <p>Abra uma solicitação para a equipe responsável pela Acessórias.</p>
        </div>
        <form className="nfse-form accounting-request-form" onSubmit={saveAccountingRequest} noValidate autoComplete="off">
          <label className="is-half">Assunto
            <input value={accountingRequestForm.subject} onChange={(event) => updateAccountingRequest('subject', event.target.value)} placeholder="Ex.: Envio de documentos" required />
          </label>
          <label className="is-half">Departamento
            <select value={accountingRequestForm.departmentId} onChange={(event) => updateAccountingRequest('departmentId', event.target.value)} required>
              <option value="">Selecione...</option>
              {accountingDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>
          <label className="is-half">Prioridade
            <select value={accountingRequestForm.priority} onChange={(event) => updateAccountingRequest('priority', event.target.value)}>
              <option value="1">Alta</option>
              <option value="2">Normal</option>
              <option value="3">Baixa</option>
            </select>
          </label>
          <label className="is-half">Prazo
            <input type="date" value={accountingRequestForm.dueDate} onChange={(event) => updateAccountingRequest('dueDate', event.target.value)} />
          </label>
          <label className="is-wide">Descrição
            <textarea value={accountingRequestForm.description} onChange={(event) => updateAccountingRequest('description', event.target.value)} placeholder="Descreva a solicitação para o analista..." required />
          </label>
          <label className="is-wide accounting-request-attachments">Anexos
            <input type="file" multiple onChange={(event) => void handleAccountingAttachmentChange(event)} />
            <small>Até 5 arquivos, 10MB por arquivo e 20MB no total.</small>
          </label>
          {accountingRequestForm.attachments.length ? (
            <div className="accounting-attachment-list">
              {accountingRequestForm.attachments.map((attachment, index) => (
                <span key={`${attachment.fileName}-${index}`}>
                  <strong>{attachment.fileName}</strong>
                  <small>{formatFileSize(attachment.sizeBytes)}</small>
                  <button type="button" onClick={() => removeAccountingAttachment(index)} aria-label={`Remover ${attachment.fileName}`}>x</button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="companies-form-footer">
            <button className="companies-button companies-button--ghost" type="button" onClick={() => setShowAccountingRequestModal(false)}>Cancelar</button>
            <button className="companies-button companies-button--primary" type="submit" disabled={isAccountingRequestSaving}>{isAccountingRequestSaving ? 'Enviando...' : 'Enviar solicitação'}</button>
          </div>
        </form>
      </section>
    </div>
  ) : null;
  const cancelInvoiceModal = cancelInvoiceTarget ? (
    <div className="nfse-modal-backdrop" role="presentation">
      <section className="nfse-modal nfse-modal--cancel" role="dialog" aria-modal="true">
        <button className="companies-close modal-close" type="button" onClick={() => setCancelInvoiceTarget(null)}>x</button>
        <div className="nfse-modal__heading">
          <h2>Cancelar NFS-e</h2>
          <p>O cancelamento será enviado para a API nacional como evento 101101.</p>
        </div>
        <form className="nfse-form" onSubmit={cancelAuthorizedInvoice} noValidate autoComplete="off">
          <label className="is-half">Motivo
            <select value={cancelInvoiceForm.reasonCode} onChange={(event) => setCancelInvoiceForm((current) => ({ ...current, reasonCode: event.target.value }))}>
              <option value="1">Erro na emissão</option>
              <option value="2">Serviço não prestado</option>
              <option value="9">Outros</option>
            </select>
          </label>
          <label className="is-wide">Justificativa
            <textarea value={cancelInvoiceForm.reasonText} onChange={(event) => setCancelInvoiceForm((current) => ({ ...current, reasonText: event.target.value }))} minLength={15} maxLength={255} placeholder="Informe a justificativa exigida pela API nacional..." required />
            <small>{cancelInvoiceForm.reasonText.trim().length}/255 caracteres</small>
          </label>
          <div className="companies-form-footer">
            <button className="companies-button companies-button--ghost" type="button" onClick={() => setCancelInvoiceTarget(null)}>Cancelar</button>
            <button className="companies-button companies-button--soft-danger" type="submit" disabled={isCancelInvoiceSaving}>{isCancelInvoiceSaving ? 'Cancelando...' : 'Confirmar cancelamento'}</button>
          </div>
        </form>
      </section>
    </div>
  ) : null;
  const accountingDetailModal = accountingDetail ? (
    <div className="nfse-modal-backdrop" role="presentation">
      <section className="nfse-modal nfse-modal--accounting-detail" role="dialog" aria-modal="true">
        <button className="companies-close modal-close" type="button" onClick={() => setAccountingDetail(null)}>x</button>
        <div className="nfse-modal__heading">
          <p>Acessórias</p>
          <h2>{accountingDetail.title}</h2>
          <span>{accountingDetail.area === 'processes' ? 'Processo' : 'Solicitação'} {accountingDetail.status ? `• ${accountingDetail.status}` : ''}</span>
        </div>
        <div className="accounting-detail-summary">
          <span><strong>Departamento</strong>{accountingDetail.department || '-'}</span>
          <span><strong>Abertura</strong>{formatAccountingDate(accountingDetail.openedAt)}</span>
          <span><strong>Atualização</strong>{formatAccountingDate(accountingDetail.updatedAt || accountingDetail.syncedAt)}</span>
          <span><strong>Status</strong><em>{accountingDetail.status || '-'}</em></span>
        </div>
        {accountingDetail.statusHint ? <div className="accounting-detail-status">{accountingDetail.statusHint}</div> : null}
        {accountingDetail.steps.length ? (
          <section className="accounting-detail-section">
            <h3>Etapas</h3>
            <div className="accounting-detail-steps">
              {accountingDetail.steps.map((step) => (
                <span key={step.id}>
                  <strong>{step.title}</strong>
                  {step.percentage ? <b>{step.percentage}</b> : null}
                  <small>{[step.status, step.responsible, formatAccountingDate(step.date)].filter(Boolean).join(' • ')}</small>
                </span>
              ))}
            </div>
          </section>
        ) : null}
        <section className="accounting-detail-section">
          <h3>Histórico do atendimento</h3>
          {accountingDetail.history.length ? (
            <div className="accounting-detail-history">
              {accountingDetail.history.map((event) => (
                <article key={event.id} className={`is-${accountingHistoryOrigin(event.origin)}`}>
                  <div className="accounting-detail-history__meta">
                    <span>{formatAccountingDateTime(event.date)}</span>
                    <em>{accountingHistoryOriginLabel(event.origin)}</em>
                  </div>
                  <strong>{event.title}</strong>
                  {event.text ? <p>{event.text}</p> : null}
                  <small>{[event.author, event.status].filter(Boolean).join(' • ')}</small>
                  {renderAccountingHistoryAttachments(event.attachments)}
                </article>
              ))}
            </div>
          ) : <p className="accounting-muted">Histórico detalhado ainda não retornou pela API da Acessórias.</p>}
        </section>
        <section className="accounting-detail-section">
          <h3>Arquivos</h3>
          {renderAccountingDetailFiles(accountingDetail.files)}
        </section>
        {accountingDetail.area === 'requests' && (accountingDetail.canReply || accountingDetail.canReopen) ? (
          <section className="accounting-detail-section accounting-detail-action">
            <h3>{accountingDetail.canReopen ? 'Reabrir solicitação' : 'Responder solicitação'}</h3>
            <form className="nfse-form accounting-reply-form" onSubmit={saveAccountingReply} noValidate>
              <label className="is-wide">Mensagem
                <textarea value={accountingReplyForm.message} onChange={(event) => setAccountingReplyForm((current) => ({ ...current, message: event.target.value }))} placeholder={accountingDetail.canReopen ? 'Explique o motivo da reabertura...' : 'Envie uma resposta ou complemente a solicitação...'} />
              </label>
              <label className="accounting-reply-file">Anexos
                <input type="file" multiple onChange={handleAccountingReplyAttachmentChange} />
                <small>Até 10 arquivos, 30MB no total.</small>
              </label>
              {accountingReplyForm.attachments.length ? (
                <div className="accounting-attachment-list is-wide">
                  {accountingReplyForm.attachments.map((file, index) => (
                    <span key={`${file.fileName}-${index}`}>
                      <strong>{file.fileName}</strong>
                      <small>{formatFileSize(file.sizeBytes)}</small>
                      <button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => removeAccountingReplyAttachment(index)}>Remover</button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="companies-form-footer is-wide">
                {accountingDetail.canReply && !accountingDetail.canReopen ? <button className="companies-button companies-button--ghost" type="button" onClick={() => void resolveAccountingRequest()} disabled={isAccountingReplySaving}>Marcar como resolvida</button> : null}
                <button className="companies-button companies-button--primary" type="submit" disabled={isAccountingReplySaving}>
                  {isAccountingReplySaving ? 'Enviando...' : accountingDetail.canReopen ? 'Reabrir solicitação' : 'Enviar mensagem'}
                </button>
              </div>
            </form>
          </section>
        ) : null}
        {accountingDetail.area === 'requests' && accountingDetail.canEvaluate ? (
          <section className="accounting-detail-section accounting-detail-action">
            <h3>Avaliação do atendimento</h3>
            {accountingDetail.rating ? (
              <p className="accounting-rating-current">Avaliação atual: {accountingDetail.rating.score}/5{accountingDetail.rating.comment ? ` - ${accountingDetail.rating.comment}` : ''}</p>
            ) : null}
            <form className="nfse-form accounting-rating-form" onSubmit={saveAccountingEvaluation} noValidate>
              <label>Nota
                <select value={accountingEvaluationForm.score} onChange={(event) => setAccountingEvaluationForm((current) => ({ ...current, score: event.target.value }))}>
                  <option value="5">5 - Excelente</option>
                  <option value="4">4 - Bom</option>
                  <option value="3">3 - Regular</option>
                  <option value="2">2 - Ruim</option>
                  <option value="1">1 - Muito ruim</option>
                </select>
              </label>
              <label className="is-wide">Comentário
                <textarea value={accountingEvaluationForm.comment} onChange={(event) => setAccountingEvaluationForm((current) => ({ ...current, comment: event.target.value }))} placeholder="Opcional" />
              </label>
              <div className="companies-form-footer is-wide">
                <button className="companies-button companies-button--primary" type="submit" disabled={isAccountingEvaluationSaving}>{isAccountingEvaluationSaving ? 'Salvando...' : 'Salvar avaliação'}</button>
              </div>
            </form>
          </section>
        ) : null}
        <div className="companies-form-footer">
          <button className="companies-button companies-button--ghost" type="button" onClick={() => setAccountingDetail(null)}>Fechar</button>
        </div>
      </section>
    </div>
  ) : null;
  const isNfseSection = activeSection.startsWith('nfse');
  const isAccountingSection = activeSection.startsWith('accounting');
  const isControlSection = activeSection.startsWith('control');
  const showCompactNfseSubmenu = isCollapsed && isNfseOpen && isNfseSection;
  const showCompactAccountingSubmenu = isCollapsed && isAccountingOpen && isAccountingSection;
  const showCompactControlSubmenu = isCollapsed && isControlOpen && isControlSection;
  const showCompactSubmenu = showCompactNfseSubmenu || showCompactAccountingSubmenu || showCompactControlSubmenu;
  const accountingSectionTitle = ({
    'accounting-documents': 'Documentos',
    'accounting-taxes': 'Impostos',
    'accounting-requests': 'Solicitações',
    'accounting-processes': 'Processos',
  } as Record<ModuleSection, string>)[activeSection] || 'Contabilidade';
  const controlSectionTitle = ({
    'control-overview': 'Visão geral',
    'control-accounting': 'Contábil',
    'control-tax': 'Fiscal',
    'control-payroll': 'Departamento pessoal',
  } as Record<ModuleSection, string>)[activeSection] || 'Controle';

  return (
    <main className="company-module-page">
      <div className={`company-module-shell ${isCollapsed ? 'is-collapsed' : ''}`}>
        <aside className="company-sidebar" aria-label="Menu da empresa">
          <div className="company-sidebar__brand">
            <img className="company-sidebar__logo" src="/zip-logo.png" alt="Zip" onError={(event) => { event.currentTarget.src = '/zip-logo.svg'; }} />
            <button className="company-sidebar__toggle" type="button" onClick={toggleSidebarCollapsed} aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}>
              <SidebarToggleIcon collapsed={isCollapsed} />
            </button>
          </div>
          <nav className="company-sidebar__nav">
            <div className="company-sidebar__section">
              <button className={`company-sidebar__item ${activeSection === 'home' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('home')} data-tooltip="Home" title="Home">
                <span className="company-sidebar__icon"><HomeIcon /></span><span className="company-sidebar__label">Home</span>
              </button>
            </div>
            <div className={`company-sidebar__group ${isNfseOpen ? 'is-open' : ''}`}>
              <button className={`company-sidebar__item company-sidebar__group-toggle ${isNfseSection ? 'is-active' : ''} ${!canViewNfseModule ? 'is-disabled' : ''}`} type="button" onClick={handleNfseMenuClick} data-tooltip="NFS-e" title={canViewNfseModule ? 'NFS-e' : 'NFS-e sem permissão'} disabled={!canViewNfseModule}>
                <span className="company-sidebar__group-title"><span className="company-sidebar__icon"><NoteIcon /></span><span className="company-sidebar__label">NFS-e</span></span>
                <span className="company-sidebar__group-arrow"><MenuChevronIcon /></span>
              </button>
              {isNfseOpen ? (
                <div className="company-sidebar__submenu">
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-list' ? 'is-active' : ''} ${!canViewInvoices ? 'is-disabled' : ''}`} type="button" onClick={() => goToSection('nfse-list')} disabled={!canViewInvoices}>Notas Fiscais</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-recurring' ? 'is-active' : ''} ${!canViewInvoices ? 'is-disabled' : ''}`} type="button" onClick={() => goToSection('nfse-recurring')} disabled={!canViewInvoices}>NFS-e Recorrente</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-takers' ? 'is-active' : ''} ${!canViewTakers ? 'is-disabled' : ''}`} type="button" onClick={() => goToSection('nfse-takers')} disabled={!canViewTakers}>Cadastro de Tomadores</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-params' ? 'is-active' : ''} ${!canViewSettings ? 'is-disabled' : ''}`} type="button" onClick={() => goToSection('nfse-params')} disabled={!canViewSettings}>Parametrização</button>
                </div>
              ) : null}
            </div>
            <div className={`company-sidebar__group ${isAccountingOpen ? 'is-open' : ''}`}>
              <button className={`company-sidebar__item company-sidebar__group-toggle ${isAccountingSection ? 'is-active' : ''} ${!canViewAccountingModule ? 'is-disabled' : ''}`} type="button" onClick={handleAccountingMenuClick} data-tooltip="Contabilidade" title={canViewAccountingModule ? 'Contabilidade' : 'Contabilidade sem permissão'} disabled={!canViewAccountingModule}>
                <span className="company-sidebar__group-title"><span className="company-sidebar__icon"><AccountingIcon /></span><span className="company-sidebar__label">Contabilidade</span></span>
                <span className="company-sidebar__group-arrow"><MenuChevronIcon /></span>
              </button>
              {isAccountingOpen ? (
                <div className="company-sidebar__submenu">
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'accounting-documents' ? 'is-active' : ''} ${!hasPermission(activeCompany, 'accounting.documents.view') ? 'is-disabled' : ''}`} type="button" onClick={() => goToSection('accounting-documents')} disabled={!hasPermission(activeCompany, 'accounting.documents.view')}>Documentos</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'accounting-taxes' ? 'is-active' : ''} ${!hasPermission(activeCompany, 'accounting.taxes.view') ? 'is-disabled' : ''}`} type="button" onClick={() => goToSection('accounting-taxes')} disabled={!hasPermission(activeCompany, 'accounting.taxes.view')}>Impostos</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'accounting-requests' ? 'is-active' : ''} ${!hasPermission(activeCompany, 'accounting.requests.view') ? 'is-disabled' : ''}`} type="button" onClick={() => goToSection('accounting-requests')} disabled={!hasPermission(activeCompany, 'accounting.requests.view')}>Solicitações</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'accounting-processes' ? 'is-active' : ''} ${!hasPermission(activeCompany, 'accounting.processes.view') ? 'is-disabled' : ''}`} type="button" onClick={() => goToSection('accounting-processes')} disabled={!hasPermission(activeCompany, 'accounting.processes.view')}>Processos</button>
                </div>
              ) : null}
            </div>
            <div className={`company-sidebar__group ${isControlOpen ? 'is-open' : ''}`}>
              <button className={`company-sidebar__item company-sidebar__group-toggle ${isControlSection ? 'is-active' : ''}`} type="button" onClick={handleControlMenuClick} data-tooltip="Controle" title="Controle">
                <span className="company-sidebar__group-title"><span className="company-sidebar__icon"><ControlIcon /></span><span className="company-sidebar__label">Controle</span></span>
                <span className="company-sidebar__group-arrow"><MenuChevronIcon /></span>
              </button>
              {isControlOpen ? (
                <div className="company-sidebar__submenu">
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'control-overview' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('control-overview')}>Visão geral</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'control-accounting' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('control-accounting')}>Contábil</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'control-tax' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('control-tax')}>Fiscal</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'control-payroll' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('control-payroll')}>Departamento pessoal</button>
                </div>
              ) : null}
            </div>
          </nav>
          <div className="company-sidebar__footer">
            <button className={`company-sidebar__item company-sidebar__item--settings ${activeSection === 'settings' || activeSection === 'nfse-params' ? 'is-active' : ''} ${!canViewSettings ? 'is-disabled' : ''}`} type="button" onClick={() => goToSection('settings')} data-tooltip="Configurações" title={canViewSettings ? 'Configurações de emissão de notas fiscais' : 'Configurações sem permissão'} disabled={!canViewSettings}>
              <span className="company-sidebar__icon"><SettingsIcon /></span><span className="company-sidebar__label">Configurações</span>
            </button>
          </div>
        </aside>

        <section className={`company-module-main ${showCompactSubmenu ? 'has-compact-submenu' : ''}`}>
          <header className="company-module-topbar">
            <div className="company-switcher">
              <label htmlFor="company-switcher">Empresa em acesso</label>
              <select id="company-switcher" value={activeCompanyId} onChange={(event) => handleCompanyChange(event.target.value)} disabled={isLoading || companies.length === 0}>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}
              </select>
            </div>
            <div className="company-module-user">
              <span>{user?.name || 'Usuário'}</span>
              <button type="button" onClick={() => router.push('/dashboard')}>Empresas</button>
              <button type="button" onClick={handleLogout}>Sair</button>
            </div>
          </header>
          {showCompactNfseSubmenu ? (
            <nav className="company-module-compact-submenu" aria-label="Submenus de NFS-e">
              <button className={activeSection === 'nfse-list' ? 'is-active' : ''} type="button" onClick={() => goToSection('nfse-list')} disabled={!canViewInvoices}>Notas Fiscais</button>
              <button className={activeSection === 'nfse-recurring' ? 'is-active' : ''} type="button" onClick={() => goToSection('nfse-recurring')} disabled={!canViewInvoices}>NFS-e Recorrente</button>
              <button className={activeSection === 'nfse-takers' ? 'is-active' : ''} type="button" onClick={() => goToSection('nfse-takers')} disabled={!canViewTakers}>Cadastro de Tomadores</button>
              <button className={activeSection === 'nfse-params' ? 'is-active' : ''} type="button" onClick={() => goToSection('nfse-params')} disabled={!canViewSettings}>Parametrização</button>
            </nav>
          ) : null}
          {showCompactAccountingSubmenu ? (
            <nav className="company-module-compact-submenu" aria-label="Submenus de Contabilidade">
              <button className={activeSection === 'accounting-documents' ? 'is-active' : ''} type="button" onClick={() => goToSection('accounting-documents')} disabled={!hasPermission(activeCompany, 'accounting.documents.view')}>Documentos</button>
              <button className={activeSection === 'accounting-taxes' ? 'is-active' : ''} type="button" onClick={() => goToSection('accounting-taxes')} disabled={!hasPermission(activeCompany, 'accounting.taxes.view')}>Impostos</button>
              <button className={activeSection === 'accounting-requests' ? 'is-active' : ''} type="button" onClick={() => goToSection('accounting-requests')} disabled={!hasPermission(activeCompany, 'accounting.requests.view')}>Solicitações</button>
              <button className={activeSection === 'accounting-processes' ? 'is-active' : ''} type="button" onClick={() => goToSection('accounting-processes')} disabled={!hasPermission(activeCompany, 'accounting.processes.view')}>Processos</button>
            </nav>
          ) : null}
          {showCompactControlSubmenu ? (
            <nav className="company-module-compact-submenu" aria-label="Submenus de Controle">
              <button className={activeSection === 'control-overview' ? 'is-active' : ''} type="button" onClick={() => goToSection('control-overview')}>Visão geral</button>
              <button className={activeSection === 'control-accounting' ? 'is-active' : ''} type="button" onClick={() => goToSection('control-accounting')}>Contábil</button>
              <button className={activeSection === 'control-tax' ? 'is-active' : ''} type="button" onClick={() => goToSection('control-tax')}>Fiscal</button>
              <button className={activeSection === 'control-payroll' ? 'is-active' : ''} type="button" onClick={() => goToSection('control-payroll')}>Departamento pessoal</button>
            </nav>
          ) : null}

          <div className="company-module-content">
            {error ? <p className="companies-alert companies-alert--error">{error}</p> : null}
            {isLoading ? <p className="company-module-empty">Carregando ambiente da empresa...</p> : null}

            {!isLoading && activeCompany && activeSection === 'home' ? (
              <>
                <section className="company-module-hero">
                  <p>Home</p>
                  <h1>{activeCompany.legalName}</h1>
                  <span>{formatCnpj(activeCompany.cnpj)} - {activeCompany.city}/{activeCompany.state} - {activeCompany.role === 'ADMIN_VIEW' ? 'Administrador' : 'Acesso modular'}</span>
                </section>
                <section className="company-module-cards">
                  {canViewNfseModule ? <article className="company-module-card"><strong>Emissão NFS-e</strong><span>Crie DPS, selecione tomador e serviço, e acompanhe a transmissão.</span></article> : null}
                  <article className="company-module-card"><strong>Regime tributário</strong><span>{activeCompany.taxRegime || 'Não informado'}</span></article>
                  {canViewSettings ? <article className="company-module-card"><strong>Parametrização</strong><span>Certificado, município, regime e serviços padrões em um fluxo React único.</span></article> : null}
                  {canViewAccountingModule ? <article className="company-module-card"><strong>Contabilidade</strong><span>Acesse documentos, impostos, solicitações e processos liberados para o usuário.</span></article> : null}
                </section>
              </>
            ) : null}

            {!isLoading && activeCompany && activeSection === 'nfse-takers' && canViewTakers ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>NFS-e</p><h1>Cadastro de Tomadores</h1><span>Clientes que poderão ser selecionados na emissão.</span></section>
                <div className="nfse-panel">
                  <div className="nfse-panel__header">
                    <div><h2>Tomadores cadastrados</h2><p>Lista carregada pela API, no mesmo padrão React da tela inicial.</p></div>
                    <div className="nfse-panel__actions"><button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => void exportTakersReport()} disabled={isExportingTakers}>{isExportingTakers ? 'Gerando...' : 'Relatório Excel'}</button><button className="companies-button companies-button--primary" type="button" onClick={() => openTakerModal()} disabled={!canCreateTakers}>+ Novo tomador</button></div>
                  </div>
                  {takerMessage ? <p className="nfse-settings-clean__message" data-tone={takerMessageTone}>{takerMessage}</p> : null}
                  <div className="nfse-table-wrap">
                    <table className="nfse-table">
                      <thead><tr><th>{renderSortButton('Nome', 'name', takerSort, changeTakerSort)}</th><th>{renderSortButton('Documento', 'document', takerSort, changeTakerSort)}</th><th>{renderSortButton('E-mail', 'email', takerSort, changeTakerSort)}</th><th>{renderSortButton('Cidade/UF', 'city', takerSort, changeTakerSort)}</th><th>Ações</th></tr></thead>
                      <tbody>
                        {customers.length ? customers.map((customer) => (
                          <tr key={customer.id} className={customer.isActive === false ? 'is-inactive' : ''}>
                            <td><div className="nfse-invoice-number"><strong>{customer.name}</strong>{customer.isActive === false ? <small className="nfse-access-key">Inativo</small> : null}</div></td>
                            <td>{formatDocument(customer.document)}</td>
                            <td>{customer.email || '-'}</td>
                            <td>{customer.city || '-'}/{customer.state || '-'}</td>
                            <td><div className="nfse-actions">
                              <button className="nfse-icon-button" type="button" onClick={() => openTakerModal(customer)} title="Editar tomador" aria-label="Editar tomador" disabled={!canEditTakers}><EditIcon /></button>
                              {customer.isActive === false ? (
                                <button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" onClick={() => void toggleTakerActive(customer, true)} title="Reativar tomador" aria-label="Reativar tomador" disabled={!canDeleteTakers}><RestoreIcon /></button>
                              ) : customerInvoiceCount(customer) > 0 ? (
                                <button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" onClick={() => void toggleTakerActive(customer, false)} title="Inativar tomador" aria-label="Inativar tomador" disabled={!canDeleteTakers}><ArchiveIcon /></button>
                              ) : (
                                <button className="nfse-icon-button nfse-icon-button--danger" type="button" onClick={() => void removeTaker(customer)} title="Excluir tomador" aria-label="Excluir tomador" disabled={!canDeleteTakers}><TrashIcon /></button>
                              )}
                            </div></td>
                          </tr>
                        )) : <tr><td colSpan={5} className="nfse-empty-row">Nenhum tomador cadastrado ainda.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            {!isLoading && activeCompany && activeSection === 'nfse-list' && canViewInvoices ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>NFS-e</p><h1>Notas Fiscais</h1><span>Consulta paginada com ações, seleção e exportação em lote.</span></section>
                <details className="nfse-api-roadmap">
                  <summary>Recursos da API nacional para avaliarmos</summary>
                  <div className="nfse-api-roadmap__grid">
                    {NFSE_NATIONAL_API_GAPS.map((item) => <span key={item.title}><strong>{item.title}</strong>{item.tip}</span>)}
                  </div>
                </details>
                <div className="nfse-panel">
                  <div className="nfse-search-row nfse-search-row--with-period">
                    <input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Buscar por tomador, número, chave de acesso, valor ou status..." />
                    <div className="nfse-status-filter">
                      <select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)} aria-label="Status">
                        <option value="">Status</option>
                        <option value="DRAFT">Rascunho</option>
                        <option value="PROCESSING">Processando</option>
                        <option value="AUTHORIZED">Autorizada</option>
                        <option value="REJECTED">Rejeitada</option>
                        <option value="CANCELLED">Cancelada</option>
                      </select>
                      {invoiceStatus ? <button className="nfse-date-clear nfse-status-clear" type="button" onClick={() => setInvoiceStatus('')} aria-label="Limpar status">x</button> : null}
                    </div>
                    <div className={`nfse-date-filter ${invoiceDateFilterError?.field === 'start' ? 'is-invalid' : ''}`}>
                      <label htmlFor="invoice-start-date">Data inicial</label>
                      <div className="nfse-date-filter__control">
                        <input id="invoice-start-date" type="date" aria-label="Data inicial" value={invoiceStartDate} onFocus={selectDateInput} onClick={selectDateInput} onKeyDown={(event) => handleDateFilterKeyDown('start', event)} onChange={(event) => updateInvoiceDateFilter('start', event.target.value)} />
                        {invoiceStartDate ? <button className="nfse-date-clear" type="button" onClick={() => clearInvoiceDateFilter('start')} aria-label="Limpar data inicial">x</button> : null}
                      </div>
                    </div>
                    <div className={`nfse-date-filter ${invoiceDateFilterError?.field === 'end' ? 'is-invalid' : ''}`}>
                      <label htmlFor="invoice-end-date">Data final</label>
                      <div className="nfse-date-filter__control">
                        <input id="invoice-end-date" type="date" aria-label="Data final" value={invoiceEndDate} onFocus={selectDateInput} onClick={selectDateInput} onKeyDown={(event) => handleDateFilterKeyDown('end', event)} onChange={(event) => updateInvoiceDateFilter('end', event.target.value)} />
                        {invoiceEndDate ? <button className="nfse-date-clear" type="button" onClick={() => clearInvoiceDateFilter('end')} aria-label="Limpar data final">x</button> : null}
                      </div>
                    </div>
                    <button className="companies-button companies-button--primary nfse-new-invoice-button" type="button" onClick={() => void openIssueModal()} disabled={!canCreateInvoices}>+ Nova NFS-e</button>
                  </div>
                  {invoiceMessage ? <p className="nfse-settings-clean__message" data-tone={invoiceMessageTone}>{invoiceMessage}</p> : null}
                  <div className="nfse-selection-summary">
                    <span>{selectedInvoices.length ? `${selectedInvoices.length} nota(s) selecionada(s)` : `${invoiceTotal} nota(s) encontrada(s).`}</span>
                    <div className="nfse-bulk-download-actions">
                      <button className="companies-button companies-button--ghost companies-button--mini" type="button" disabled={!selectedInvoices.length} onClick={() => void downloadSelected('pdf')}>Baixar PDFs .zip</button>
                      <button className="companies-button companies-button--ghost companies-button--mini" type="button" disabled={!selectedInvoices.length} onClick={() => void downloadSelected('xml')}>Baixar XMLs .zip</button>
                      <button className="companies-button companies-button--ghost companies-button--mini" type="button" disabled={isExportingInvoices || invoiceDateFilterError !== null} onClick={() => void exportFilteredInvoicesReport()}>{isExportingInvoices ? 'Gerando...' : 'Relatório Excel'}</button>
                      <button className="companies-button companies-button--ghost companies-button--mini nfse-refresh-button" type="button" title="Atualizar notas fiscais" aria-label="Atualizar notas fiscais" disabled={isRefreshingInvoices} onClick={() => void refreshInvoicesManually()}><span className={`nfse-refresh-icon ${isRefreshingInvoices ? 'is-spinning' : ''}`} aria-hidden="true"><RefreshIcon /></span></button>
                      <button className="companies-button companies-button--soft-danger companies-button--mini" type="button" disabled={!canDeleteInvoices || !deletableSelectedInvoices.length} onClick={() => void deleteSelectedLocalInvoices()}>Excluir locais</button>
                      {selectedInvoices.length ? <button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => setSelectedInvoiceIds([])}>Limpar seleção</button> : null}
                    </div>
                  </div>
                  <div className="nfse-table-wrap">
                    <table className="nfse-table">
                      <thead><tr><th className="nfse-select-cell"><input type="checkbox" aria-label="Selecionar notas da página" checked={allInvoicesSelected} onChange={toggleAllInvoices} /></th><th>{renderSortButton('Número', 'number', invoiceSort, changeInvoiceSort)}</th><th>{renderSortButton('Tomador', 'customer', invoiceSort, changeInvoiceSort)}</th><th>{renderSortButton('Emissão', 'issuedAt', invoiceSort, changeInvoiceSort)}</th><th>{renderSortButton('Valor', 'amount', invoiceSort, changeInvoiceSort)}</th><th>{renderSortButton('Status', 'status', invoiceSort, changeInvoiceSort)}</th><th>Ações</th></tr></thead>
                      <tbody>
                        {invoices.length ? invoices.map((invoice) => (
                          <Fragment key={invoice.id}>
                            <tr className={selectedInvoiceIds.includes(invoice.id) ? 'is-selected' : ''}>
                              <td className="nfse-select-cell"><input type="checkbox" aria-label={`Selecionar nota ${invoice.number || invoice.id}`} checked={selectedInvoiceIds.includes(invoice.id)} onChange={() => toggleInvoiceSelection(invoice.id)} /></td>
                              <td><div className="nfse-invoice-number"><strong>{invoice.number || invoice.id.slice(0, 8)}</strong></div></td>
                              <td>{invoice.customer?.name || '-'}</td>
                              <td>{formatDate(invoice.issuedAt || invoice.createdAt)}</td>
                              <td>{formatCurrency(invoice.amount)}</td>
                              <td><div className="nfse-status-cell"><span className={`nfse-chip nfse-chip--${invoice.status.toLowerCase()}`}>{invoiceStatusLabel(invoice.status)}</span>{invoice.status === 'REJECTED' && invoice.errorMessage ? <small title={invoice.errorMessage}>Motivo: {invoice.errorMessage}</small> : null}</div></td>
                              <td><div className="nfse-actions">
                                <button className="nfse-icon-button nfse-file-icon-button" type="button" title="Baixar PDF" aria-label="Baixar PDF" onClick={() => void showStoredFile(invoice.id, 'pdf')}><PdfFileIcon /></button>
                                <button className="nfse-icon-button nfse-file-icon-button" type="button" title="Baixar XML" aria-label="Baixar XML" onClick={() => void showStoredFile(invoice.id, 'xml')}><XmlFileIcon /></button>
                                <button className="nfse-icon-button" type="button" title="Editar NFS-e local" aria-label="Editar NFS-e" onClick={() => void openIssueModal(invoice)} disabled={!canEditInvoices || !canEditInvoice(invoice)}><EditIcon /></button>
                                {canTransmitInvoice(invoice) ? <button className="companies-button companies-button--ghost" type="button" onClick={() => void transmitExistingInvoice(invoice.id)} disabled={!canTransmitInvoices}>Transmitir</button> : null}
                                {invoice.accessKey ? (
                                  <button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" title={invoice.status === 'AUTHORIZED' ? 'Cancelar NFS-e' : 'Cancelamento disponível apenas para NFS-e autorizada'} aria-label="Cancelar NFS-e" onClick={() => openCancelInvoiceModal(invoice)} disabled={!canDeleteInvoices || !canCancelInvoice(invoice)}><CancelInvoiceIcon /></button>
                                ) : (
                                  <button className="nfse-icon-button nfse-icon-button--danger" type="button" title="Excluir NFS-e local" aria-label="Excluir NFS-e" onClick={() => void deleteLastInvoice(invoice)} disabled={!canDeleteInvoices || !canEditInvoice(invoice)}><TrashIcon /></button>
                                )}
                              </div></td>
                            </tr>
                            {invoice.accessKey ? (
                              <tr className={`nfse-access-key-row ${selectedInvoiceIds.includes(invoice.id) ? 'is-selected' : ''}`}>
                                <td className="nfse-select-cell" aria-hidden="true" />
                                <td colSpan={6}><span>Chave: {invoice.accessKey}</span></td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )) : <tr><td colSpan={7} className="nfse-empty-row">Nenhuma nota encontrada para os filtros informados.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="nfse-pagination">
                    <label className="nfse-page-size">Notas por página
                      <select value={invoicePageSize} onChange={(event: ChangeEvent<HTMLSelectElement>) => setInvoicePageSize(Number(event.target.value))}>
                        {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <button className="companies-button companies-button--ghost" type="button" disabled={invoicePage <= 1} onClick={() => void loadInvoices(invoicePage - 1, invoicePageSize)}>Anterior</button>
                    <span>Página {invoicePage} de {invoiceTotalPages}</span>
                    <button className="companies-button companies-button--ghost" type="button" disabled={invoicePage >= invoiceTotalPages} onClick={() => void loadInvoices(invoicePage + 1, invoicePageSize)}>Próxima</button>
                  </div>
                </div>
              </section>
            ) : null}

            {!isLoading && activeCompany && activeSection === 'nfse-recurring' && canViewInvoices ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>NFS-e</p><h1>NFS-e Recorrente</h1><span>Automação para emissão periódica conforme tomador, serviço, frequência e data programada.</span></section>
                <div className="nfse-panel">
                  <div className="nfse-panel__header">
                    <div><h2>Nova recorrência</h2><p>Por padrão mensal a cada 01 mês. A nota será criada e transmitida automaticamente na data programada.</p></div>
                  </div>
                  {invoiceMessage ? <p className="nfse-settings-clean__message" data-tone={invoiceMessageTone}>{invoiceMessage}</p> : null}
                  <form className="nfse-form nfse-recurring-form" onSubmit={saveRecurrence}>
                    <label>Tomador
                      <select value={recurrenceForm.customerId} onChange={(event) => updateRecurrence('customerId', event.target.value)} required>
                        <option value="">Selecione o tomador...</option>
                        {customers.filter((customer) => customer.isActive !== false).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                      </select>
                    </label>
                    <label>Serviço
                      <select value={recurrenceForm.serviceId} onChange={(event) => handleRecurrenceServiceChange(event.target.value)}>
                        <option value="">Selecione o serviço...</option>
                        {services.filter((service) => service.isActive !== false).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                      </select>
                    </label>
                    <label>Frequência
                      <select value={recurrenceForm.frequency} onChange={(event) => updateRecurrence('frequency', event.target.value)}>
                        <option value="WEEKLY">Semanal</option>
                        <option value="BIWEEKLY">Quinzenal</option>
                        <option value="MONTHLY">Mensal</option>
                        <option value="QUARTERLY">Trimestral</option>
                        <option value="SEMIANNUAL">Semestral</option>
                        <option value="ANNUAL">Anual</option>
                      </select>
                    </label>
                    <label>A cada
                      <input value={recurrenceForm.interval} onChange={(event) => updateRecurrence('interval', onlyDigits(event.target.value).slice(0, 2) || '1')} inputMode="numeric" />
                    </label>
                    <label>Primeira emissão
                      <input type="date" value={recurrenceForm.startDate} onChange={(event) => updateRecurrence('startDate', event.target.value)} />
                    </label>
                    <label>Encerrar em
                      <input type="date" value={recurrenceForm.endDate} onChange={(event) => updateRecurrence('endDate', event.target.value)} />
                    </label>
                    <label>Valor do serviço
                      <input value={recurrenceForm.amount} onChange={(event) => updateRecurrence('amount', formatMoneyCentsInput(event.target.value))} onBlur={() => updateRecurrence('amount', formatMoneyForInput(recurrenceForm.amount))} placeholder="0,00" inputMode="decimal" />
                    </label>
                    <label>Alíquota ISS
                      <input value={recurrenceForm.issRate} onChange={(event) => updateRecurrence('issRate', formatDecimalInput(event.target.value, 4))} onBlur={() => updateRecurrence('issRate', formatDecimalForInput(recurrenceForm.issRate))} placeholder="0,00" inputMode="decimal" />
                    </label>
                    <label>Retenção ISS
                      <select value={recurrenceForm.issWithheld ? 'true' : 'false'} onChange={(event) => updateRecurrence('issWithheld', event.target.value === 'true')}>
                        <option value="false">Não</option>
                        <option value="true">Sim</option>
                      </select>
                    </label>
                    <label>Código de tributação nacional
                      <input value={recurrenceForm.nationalTaxCode} onChange={(event) => updateRecurrence('nationalTaxCode', event.target.value)} />
                    </label>
                    <label>Código do serviço municipal
                      <input value={recurrenceForm.municipalServiceCode} onChange={(event) => updateRecurrence('municipalServiceCode', event.target.value)} placeholder="Opcional" />
                    </label>
                    <label>Código IBGE
                      <input value={recurrenceForm.municipalIbgeCode} onChange={(event) => updateRecurrence('municipalIbgeCode', onlyDigits(event.target.value).slice(0, 7))} inputMode="numeric" />
                    </label>
                    <label className="is-half">Discriminação do serviço
                      <textarea value={recurrenceForm.serviceDescription} onChange={(event) => updateRecurrence('serviceDescription', event.target.value)} required />
                    </label>
                    <label className="is-half">Informações complementares
                      <textarea value={recurrenceForm.additionalInformation} onChange={(event) => updateRecurrence('additionalInformation', event.target.value)} />
                    </label>
                    <div className="companies-form-footer is-wide">
                      <button className="companies-button companies-button--primary" type="submit" disabled={isRecurrenceSaving || !canCreateInvoices}>{isRecurrenceSaving ? 'Salvando...' : 'Salvar recorrência'}</button>
                    </div>
                  </form>
                </div>
                <div className="nfse-panel">
                  <div className="nfse-panel__header"><div><h2>Recorrências cadastradas</h2><p>Listagem das automações de NFS-e da empresa.</p></div></div>
                  <div className="nfse-table-wrap">
                    <table className="nfse-table">
                      <thead><tr><th>Tomador</th><th>Serviço</th><th>Frequência</th><th>Próxima emissão</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
                      <tbody>
                        {recurrences.length ? recurrences.map((item) => (
                          <tr key={item.id} className={item.status !== 'ACTIVE' ? 'is-inactive' : ''}>
                            <td>{item.customer?.name || '-'}</td>
                            <td>{item.serviceDescription}</td>
                            <td>{recurrenceFrequencyLabel(item.frequency)} a cada {item.interval}</td>
                            <td>{formatDate(item.nextRunAt)}</td>
                            <td>{formatCurrency(item.amount)}</td>
                            <td><span className={`nfse-chip ${item.status === 'ACTIVE' ? 'nfse-chip--authorized' : 'nfse-chip--cancelled'}`}>{item.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}</span></td>
                            <td><button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" onClick={() => void pauseRecurrence(item.id)} disabled={!canDeleteInvoices || item.status !== 'ACTIVE'} title="Pausar recorrência" aria-label="Pausar recorrência"><ArchiveIcon /></button></td>
                          </tr>
                        )) : <tr><td colSpan={7} className="nfse-empty-row">Nenhuma recorrência cadastrada.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            {!isLoading && activeCompany && isControlSection ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>Controle</p><h1>{controlSectionTitle}</h1><span>Indicadores gerenciais preparados para integração e-Kontroll por departamento.</span></section>
                <div className="nfse-panel">
                  <div className="nfse-panel__header">
                    <div><h2>{controlSectionTitle}</h2><p>Apresentações contábeis com indicadores de Contábil, Fiscal e Departamento pessoal.</p></div>
                    <button className="companies-button companies-button--ghost" type="button" onClick={() => void loadControlOverview()} disabled={isControlLoading}>Atualizar</button>
                  </div>
                  {renderControlContent()}
                </div>
              </section>
            ) : null}

            {!isLoading && activeCompany && isAccountingSection && canOpenSection(activeCompany, activeSection) ? (
              <section className="nfse-section">
                <section className="company-module-hero">
                  <p>Contabilidade</p>
                  <h1>{accountingSectionTitle}</h1>
                  <span>Integração inicial com Acessórias para documentos, impostos, solicitações e processos.</span>
                </section>
                <div className="nfse-panel">
                  <div className="nfse-panel__header">
                    <div>
                      <h2>{accountingSectionTitle}</h2>
                      <p>{activeSection === 'accounting-taxes' ? 'Guias e documentos de impostos com prazo, envio, departamento e arquivo.' : 'Dados consultados no módulo Acessórias conforme permissões da empresa.'}</p>
                    </div>
                    <div className="nfse-panel__actions">{activeSection === 'accounting-requests' ? <button className="companies-button companies-button--primary" type="button" onClick={() => void openAccountingRequestModal()} disabled={!canCreateAccountingRequests}>+ Nova solicitação</button> : null}<button className="companies-button companies-button--ghost" type="button" onClick={() => void loadAccountingData(activeSection, true)} disabled={isAccountingLoading}>{isAccountingLoading ? 'Sincronizando...' : 'Sincronizar Acessórias'}</button></div>
                  </div>
                  {activeSection === 'accounting-taxes' ? (
                    <div className="nfse-search-row nfse-search-row--with-period accounting-filter-row">
                      <input value={accountingSearch} onChange={(event) => updateAccountingFilter(setAccountingSearch, event.target.value)} placeholder="Buscar por guia, status, departamento ou descrição..." />
                      <div className="nfse-status-filter">
                        <select value={accountingDepartmentFilter} onChange={(event) => updateAccountingFilter(setAccountingDepartmentFilter, event.target.value)} aria-label="Departamento">
                          <option value="">Departamento</option>
                          {accountingDepartments.map((department) => <option key={department.id || department.name} value={department.name}>{department.name}</option>)}
                        </select>
                        {accountingDepartmentFilter ? <button className="nfse-date-clear nfse-status-clear" type="button" onClick={() => updateAccountingFilter(setAccountingDepartmentFilter, '')} aria-label="Limpar departamento">x</button> : null}
                      </div>
                      <div className="nfse-date-filter">
                        <label>Data inicial</label>
                        <div className="nfse-date-filter__control">
                          <input type="date" value={accountingStartDate} onFocus={selectDateInput} onClick={selectDateInput} onChange={(event) => updateAccountingFilter(setAccountingStartDate, event.target.value)} />
                          {accountingStartDate ? <button className="nfse-date-clear" type="button" onClick={() => updateAccountingFilter(setAccountingStartDate, '')} aria-label="Limpar data inicial">x</button> : null}
                        </div>
                      </div>
                      <div className="nfse-date-filter">
                        <label>Data final</label>
                        <div className="nfse-date-filter__control">
                          <input type="date" value={accountingEndDate} onFocus={selectDateInput} onClick={selectDateInput} onChange={(event) => updateAccountingFilter(setAccountingEndDate, event.target.value)} />
                          {accountingEndDate ? <button className="nfse-date-clear" type="button" onClick={() => updateAccountingFilter(setAccountingEndDate, '')} aria-label="Limpar data final">x</button> : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {accountingMessage ? <p className="nfse-settings-clean__message" data-tone={accountingMessageTone}>{accountingMessage}</p> : null}
                  <div className="nfse-table-wrap">
                    {isAccountingLoading ? <p className="company-module-empty">Consultando Acessórias...</p> : renderAccountingContent()}
                  </div>
                  {activeSection === 'accounting-taxes' ? (
                    <div className="nfse-pagination">
                      <label className="nfse-page-size">Itens por página
                        <select value={accountingPageSize} onChange={(event) => { setAccountingPage(1); setAccountingPageSize(Number(event.target.value)); }}>
                          {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                        </select>
                      </label>
                      <button className="companies-button companies-button--ghost" type="button" disabled={accountingPage <= 1} onClick={() => setAccountingPage((page) => Math.max(1, page - 1))}>Anterior</button>
                      <span>{accountingTotal} item(ns) - Página {accountingPage} de {accountingTotalPages}</span>
                      <button className="companies-button companies-button--ghost" type="button" disabled={accountingPage >= accountingTotalPages} onClick={() => setAccountingPage((page) => page + 1)}>Próxima</button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {!isLoading && activeCompany && (activeSection === 'settings' || activeSection === 'nfse-params') && canViewSettings ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>Configurações</p><h1>Configurações da empresa</h1><span>{activeCompany.legalName} - {formatCnpj(activeCompany.cnpj)}</span></section>
                <div className="company-settings-tabs" aria-label="Abas de configuração">
                  <button className="is-active" type="button">NFS-e</button>
                </div>
                <SettingsSection companyId={activeCompanyId} company={activeCompany} requestApi={requestApi} services={services} reloadServices={loadServices} canEdit={canEditSettings} canDelete={canDeleteSettings} />
              </section>
            ) : null}
          </div>
        </section>
      </div>
      {modal}
      {accountingRequestModal}
      {accountingDetailModal}
      {cancelInvoiceModal}
    </main>
  );
}
