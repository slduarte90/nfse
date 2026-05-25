'use client';

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import '../../company-module.css';
import '../../nfse-module.css';

const apiBase = 'http://localhost:3333';
const pageSizeOptions = [20, 50, 100];

type AccountRole = 'ADMIN' | 'USER';
type CompanyRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'ADMIN_VIEW';
type ModuleSection = 'home' | 'settings' | 'nfse-takers' | 'nfse-list' | 'nfse-params' | 'accounting-documents' | 'accounting-taxes' | 'accounting-requests' | 'accounting-processes';
type InvoiceStatus = 'DRAFT' | 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED';
type MessageTone = 'success' | 'error';
type ApiRequester = <T>(path: string, options?: RequestInit) => Promise<T>;

type StoredUser = { id: string; name: string; email: string; accountRole: AccountRole };
type Company = { id: string; legalName: string; tradeName?: string | null; cnpj: string; city: string; state: string; taxRegime: string; role: CompanyRole };
type Customer = { id: string; name: string; document: string; email?: string | null; phone?: string | null; city?: string | null; state?: string | null; address?: string | null; number?: string | null; neighborhood?: string | null; zipCode?: string | null; municipalRegistration?: string | null; stateRegistration?: string | null; country?: string | null; isForeign?: boolean; isActive?: boolean; _count?: { invoices?: number } };
type NfseServiceItem = { id: string; name: string; nationalTaxCode: string; municipalServiceCode?: string | null; cityServiceCode?: string | null; cnae?: string | null; issRate?: string | number | null; description?: string | null; isDefault?: boolean; isIssWithheld?: boolean; isActive?: boolean; _count?: { invoices?: number } };
type NfseSettings = { environment?: string; apiBaseUrl?: string | null; apiVersion?: string | null; municipalIbgeCode?: string | null; municipalRegistration?: string | null; taxRegime?: string; specialTaxRegime?: string | null; isSimpleNational?: boolean; hasFiscalIncentive?: boolean; defaultIssWithheld?: boolean; defaultOperationNature?: string | null; defaultRpsSeries?: string | null };
type CertificateSummary = { id: string; originalFileName: string; subjectName?: string | null; issuerName?: string | null; serialNumber?: string | null; validFrom?: string | null; validUntil?: string | null; status: string; createdAt: string };
type HomologationCheckStatus = 'READY' | 'PENDING' | 'WARNING';
type HomologationCheckItem = { id: string; title: string; status: HomologationCheckStatus; severity: 'blocking' | 'attention' | 'manual'; message: string; action: string };
type HomologationChecklist = { ready: boolean; readyCount: number; totalCount: number; blockingCount: number; generatedAt: string; nextStep: string; api: { environment: string; baseUrl: string; suggestedBaseUrl: string; docsUrl: string }; items: HomologationCheckItem[] };
type NfseInvoice = { id: string; number?: string | null; accessKey?: string | null; status: InvoiceStatus; amount: string | number; serviceDescription: string; serviceCode?: string | null; nationalTaxCode?: string | null; municipalServiceCode?: string | null; issuedAt?: string | null; createdAt: string; errorMessage?: string | null; customer?: Customer | null; service?: NfseServiceItem | null };
type DeleteInvoiceResponse = { deletedId: string; nextNumber: number };
type InvoiceListResponse = { items: NfseInvoice[]; total: number; page: number; pageSize: number; totalPages: number };
type StoredFile = { fileName: string; path: string; kind: 'XML' | 'PDF' };
type IbgeMunicipality = { id: number; nome: string; microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } };
type ZipEntry = { name: string; content: string };

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

const emptyInvoiceForm: InvoiceForm = {
  customerId: '',
  serviceId: '',
  competenceDate: '',
  municipalIbgeCode: '',
  serviceDescription: '',
  nationalTaxCode: '',
  municipalServiceCode: '',
  operationNature: 'Tributação no município',
  amount: '',
  issRate: '',
  issWithheld: false,
  additionalInformation: '',
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

function invoiceStatusLabel(status: string) {
  return ({ DRAFT: 'Rascunho', PROCESSING: 'Processando', AUTHORIZED: 'Autorizada', REJECTED: 'Rejeitada', CANCELLED: 'Cancelada' } as Record<string, string>)[status] || status;
}

function certificateStatusLabel(status?: string) {
  return ({ VALID: 'Válido', EXPIRED: 'Vencido', INVALID: 'Inválido', PENDING: 'Pendente', REVOKED: 'Desvinculado' } as Record<string, string>)[status || ''] || 'Não informado';
}

function homologationStatusLabel(status?: HomologationCheckStatus) {
  return ({ READY: 'OK', PENDING: 'Pendente', WARNING: 'Atenção' } as Record<string, string>)[status || ''] || 'Pendente';
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
  const amount = Number(String(value || 0).replace(',', '.'));
  if (!Number.isFinite(amount)) return String(value || '-');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

type FieldErrors = Partial<Record<string, string>>;

function formatDecimalInput(value: string, precision = 2) {
  return value
    .replace(/[^\d,.]/g, '')
    .replace(/\./g, ',')
    .replace(/(,.*),/g, '$1')
    .replace(new RegExp(`(,\\d{${precision}})\\d+`), '$1');
}

function isPositiveDecimal(value: string) {
  const normalized = value.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(normalized) && Number(normalized) > 0;
}

function isValidDecimal(value: string) {
  return !value.trim() || /^\d+([,.]\d+)?$/.test(value.trim());
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
  if (suffix === '/nfse/parametrizacao') return 'nfse-params';
  if (suffix === '/contabilidade/documentos') return 'accounting-documents';
  if (suffix === '/contabilidade/impostos') return 'accounting-taxes';
  if (suffix === '/contabilidade/solicitacoes') return 'accounting-requests';
  if (suffix === '/contabilidade/processos') return 'accounting-processes';
  if (suffix === '/configuracoes') return 'settings';
  return 'home';
}

function pathForSection(companyId: string, section: ModuleSection) {
  const base = `/empresas/${companyId}`;
  if (section === 'nfse-takers') return `${base}/nfse/tomadores`;
  if (section === 'nfse-list') return `${base}/nfse/notas`;
  if (section === 'nfse-params') return `${base}/nfse/parametrizacao`;
  if (section === 'accounting-documents') return `${base}/contabilidade/documentos`;
  if (section === 'accounting-taxes') return `${base}/contabilidade/impostos`;
  if (section === 'accounting-requests') return `${base}/contabilidade/solicitacoes`;
  if (section === 'accounting-processes') return `${base}/contabilidade/processos`;
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
    const contentBytes = encoder.encode(entry.content);
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
    output.push(...nameBytes, ...contentBytes);

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

function SettingsSection({ companyId, company, requestApi, services, reloadServices }: { companyId: string; company: Company; requestApi: ApiRequester; services: NfseServiceItem[]; reloadServices: () => Promise<void> }) {
  const [settings, setSettings] = useState<NfseSettings | null>(null);
  const [certificate, setCertificate] = useState<CertificateSummary | null>(null);
  const [homologationChecklist, setHomologationChecklist] = useState<HomologationChecklist | null>(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('success');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckingHomologation, setIsCheckingHomologation] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState('');
  const [settingsErrors, setSettingsErrors] = useState<FieldErrors>({});
  const [municipalitySearch, setMunicipalitySearch] = useState('');
  const [municipalities, setMunicipalities] = useState<IbgeMunicipality[]>([]);
  const [municipalitySuggestions, setMunicipalitySuggestions] = useState<IbgeMunicipality[]>([]);
  const [serviceForm, setServiceForm] = useState({ name: '', nationalTaxCode: '', municipalServiceCode: '', issRate: '', description: '' });
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [inactiveServices, setInactiveServices] = useState<NfseServiceItem[]>([]);
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
    setIsCheckingHomologation(true);
    try {
      const data = await requestApi<HomologationChecklist>(`/companies/${companyId}/nfse/settings/homologation-checklist`);
      setHomologationChecklist(data);
      if (showSuccess) {
        setMessage('Pre-checagem de homologacao atualizada.');
        setMessageTone('success');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar a pré-checagem de homologação.');
      setMessageTone('error');
    } finally {
      setIsCheckingHomologation(false);
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
        defaultOperationNature: settings.defaultOperationNature || '',
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
    setServiceForm({ name: '', nationalTaxCode: '', municipalServiceCode: '', issRate: '', description: '' });
    setSettingsErrors((current) => ({
      ...current,
      'service-name': undefined,
      'service-national-code': undefined,
      'service-iss-rate': undefined,
    }));
  }

  function startEditService(service: NfseServiceItem) {
    setEditingServiceId(service.id);
    setServiceForm({
      name: service.name || '',
      nationalTaxCode: service.nationalTaxCode || '',
      municipalServiceCode: service.municipalServiceCode || '',
      issRate: service.issRate === null || service.issRate === undefined ? '' : String(service.issRate).replace('.', ','),
      description: service.description || '',
    });
    setSettingsErrors({});
    scrollToField('service-form');
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSettingsErrors({});
    if (!serviceForm.name.trim()) {
      reportSettingsError('service-name', 'Informe o nome do serviço.');
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
      const payload = { ...serviceForm, issRate: serviceForm.issRate.replace(',', '.'), ...(editingServiceId ? {} : { isDefault: services.length === 0 }) };
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

  function renderServiceActions(service: NfseServiceItem, inactive = false) {
    const invoiceCount = service._count?.invoices || 0;
    const cannotDelete = invoiceCount > 0;
    return (
      <div className="nfse-icon-actions">
        <button className="nfse-icon-button" type="button" onClick={() => startEditService(service)} title="Editar serviço" aria-label="Editar serviço">
          <EditIcon />
        </button>
        {inactive ? (
          <button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" onClick={() => void reactivateService(service.id)} title="Reativar serviço" aria-label="Reativar serviço">
            <RestoreIcon />
          </button>
        ) : (
          <button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" onClick={() => void deleteService(service.id)} title="Inativar serviço" aria-label="Inativar serviço">
            <ArchiveIcon />
          </button>
        )}
        <button
          className="nfse-icon-button nfse-icon-button--danger"
          type="button"
          onClick={() => void removeService(service)}
          disabled={cannotDelete}
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
          <a className={homologationReady ? 'is-done' : homologationChecklist ? 'is-alert' : ''} href="#nfse-param-homologation"><strong>Homologacao</strong><small>{homologationSidebarLabel}</small></a>
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
                  <span><strong>Arquivo</strong>{certificate.originalFileName}</span>
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
                <input type="file" accept=".pfx,.p12" onChange={(event) => { setCertificateFile(event.target.files?.[0] || null); setSettingsErrors((current) => ({ ...current, 'certificate-file': undefined })); }} />
                {settingsErrors['certificate-file'] ? <span className="field-error">● {settingsErrors['certificate-file']}</span> : null}
              </label>
              <label className={settingsErrors['certificate-password'] ? 'is-invalid' : ''} data-field="certificate-password">Senha
                <input type="password" value={certificatePassword} onChange={(event) => { setCertificatePassword(event.target.value); setSettingsErrors((current) => ({ ...current, 'certificate-password': undefined })); }} autoComplete="new-password" placeholder="Senha do A1" />
                {settingsErrors['certificate-password'] ? <span className="field-error">● {settingsErrors['certificate-password']}</span> : null}
              </label>
              <button className="companies-button companies-button--ghost" type="button" onClick={() => void uploadCertificate()} disabled={isUploading}>
                {isUploading ? 'Enviando...' : certificate ? 'Substituir' : 'Adicionar'}
              </button>
              {certificate ? (
                <button className="companies-button companies-button--ghost" type="button" onClick={() => void unlinkCertificate()} disabled={isUploading}>
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
                  <tr><th>Padrão</th><th>Serviço</th><th>Código nacional</th><th>ISS</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {services.length ? services.map((service) => (
                    <tr key={service.id}>
                      <td>
                        <label className="nfse-service-default-choice" title="Marcar este serviço como padrão">
                          <input type="radio" name="defaultService" checked={Boolean(service.isDefault)} onChange={() => void setDefaultService(service.id)} />
                          <span>{service.isDefault ? 'Padrão' : 'Definir'}</span>
                        </label>
                      </td>
                      <td><strong>{service.name || '-'}</strong><small>{service.municipalServiceCode ? `Municipal: ${service.municipalServiceCode}` : service.description || ''}</small></td>
                      <td>{service.nationalTaxCode || '-'}</td>
                      <td>{service.issRate ?? '-'}</td>
                      <td>{renderServiceActions(service)}</td>
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
                      <tr><th>Serviço</th><th>Código nacional</th><th>ISS</th><th>Ações</th></tr>
                    </thead>
                    <tbody>
                      {inactiveServices.length ? inactiveServices.map((service) => (
                        <tr key={service.id} className="is-inactive">
                          <td><strong>{service.name || '-'}</strong><small>{service.municipalServiceCode ? `Municipal: ${service.municipalServiceCode}` : service.description || ''}</small></td>
                          <td>{service.nationalTaxCode || '-'}</td>
                          <td>{service.issRate ?? '-'}</td>
                          <td>{renderServiceActions(service, true)}</td>
                        </tr>
                      )) : <tr><td colSpan={4} className="nfse-services-empty">{isLoadingInactiveServices ? 'Carregando serviços inativos...' : 'Nenhum serviço inativo encontrado.'}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            <details className="nfse-params-details" open={!services.length || Boolean(editingServiceId)} data-field="service-form">
              <summary>{editingServiceId ? 'Editar perfil de serviço' : 'Adicionar perfil de serviço'}</summary>
              <form className="nfse-service-form" onSubmit={saveService}>
                <label className={`nfse-service-field--wide ${settingsErrors['service-name'] ? 'is-invalid' : ''}`} data-field="service-name">Nome do serviço
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
                <label className={settingsErrors['service-iss-rate'] ? 'is-invalid' : ''} data-field="service-iss-rate">Alíquota ISS
                  <input value={serviceForm.issRate} onChange={(event) => { setServiceForm((current) => ({ ...current, issRate: formatDecimalInput(event.target.value) })); setSettingsErrors((current) => ({ ...current, 'service-iss-rate': undefined })); }} placeholder="Ex.: 2,00" />
                  {settingsErrors['service-iss-rate'] ? <span className="field-error">● {settingsErrors['service-iss-rate']}</span> : null}
                </label>
                <label className="nfse-service-field--wide">Descricao
                  <input value={serviceForm.description} onChange={(event) => setServiceForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descricao usada na nota" />
                </label>
                <button className="companies-button companies-button--primary" type="submit">{editingServiceId ? 'Salvar edicao' : 'Adicionar'}</button>
                {editingServiceId ? (
                  <button className="companies-button companies-button--ghost" type="button" onClick={resetServiceForm}>Cancelar edicao</button>
                ) : null}
              </form>
            </details>
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
                <label>Natureza padrão
                  <input value={settings?.defaultOperationNature || ''} onChange={(event) => updateSetting('defaultOperationNature', event.target.value)} placeholder="Tributação no município" />
                </label>
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

          <section className="nfse-params-section" id="nfse-param-homologation">
            <div className="nfse-params-section__heading">
              <div>
                <h3>Pre-checagem de homologacao</h3>
                <span>{homologationChecklist?.nextStep || 'Validacao antes do primeiro envio em producao restrita.'}</span>
              </div>
              <div className="nfse-params-heading-actions">
                <button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => void refreshHomologationChecklist(true)} disabled={isCheckingHomologation}>
                  {isCheckingHomologation ? 'Verificando...' : 'Atualizar'}
                </button>
                <em className={homologationChecklist && !homologationReady ? 'is-alert' : undefined}>
                  {homologationChecklist ? `${homologationChecklist.readyCount}/${homologationChecklist.totalCount}` : 'Verificar'}
                </em>
              </div>
            </div>
            {homologationChecklist ? (
              <div className="nfse-homologation-check">
                <div className="nfse-homologation-check__summary">
                  <span><strong>Ambiente</strong>{homologationChecklist.api.environment === 'PRODUCTION_RESTRICTED' ? 'Homologacao' : 'Producao'}</span>
                  <span><strong>URL de emissão</strong>{homologationChecklist.api.baseUrl}</span>
                  <span><strong>Pendencias obrigatorias</strong>{homologationChecklist.blockingCount}</span>
                </div>
                <div className="nfse-homologation-check__items">
                  {homologationChecklist.items.map((item) => (
                    <article className="nfse-homologation-check__item" data-status={item.status} key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.message}</small>
                      </div>
                      <span>{homologationStatusLabel(item.status)}</span>
                      <p>{item.action}</p>
                    </article>
                  ))}
                </div>
                <a className="nfse-homologation-check__docs" href={homologationChecklist.api.docsUrl} target="_blank" rel="noreferrer">
                  Abrir Swagger oficial da producao restrita
                </a>
              </div>
            ) : (
              <p className="nfse-certificate-status__empty">Clique em atualizar para carregar a pre-checagem de homologacao.</p>
            )}
          </section>
        </div>
      </div>

      <div className="nfse-settings-footer">
        <span>Obrigatório para a API: município IBGE, certificado válido e dados do serviço na DPS. O restante é padrão operacional do sistema.</span>
        <button className="companies-button companies-button--primary" type="button" onClick={() => void saveSettings()} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
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
  const [isNfseOpen, setIsNfseOpen] = useState(true);
  const [isAccountingOpen, setIsAccountingOpen] = useState(false);
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
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(20);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [invoiceStartDate, setInvoiceStartDate] = useState('');
  const [invoiceEndDate, setInvoiceEndDate] = useState('');
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const [invoiceMessageTone, setInvoiceMessageTone] = useState<MessageTone>('success');
  const [takerMessage, setTakerMessage] = useState('');
  const [takerMessageTone, setTakerMessageTone] = useState<MessageTone>('success');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [takerForm, setTakerForm] = useState<TakerForm>(emptyTakerForm);
  const [editingTakerId, setEditingTakerId] = useState<string | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoiceForm);
  const [isModalSaving, setIsModalSaving] = useState(false);
  const [modalFieldErrors, setModalFieldErrors] = useState<FieldErrors>({});
  const [isTakerLookupLoading, setIsTakerLookupLoading] = useState(false);
  const [isCepLookupLoading, setIsCepLookupLoading] = useState(false);
  const [issueMunicipalitySearch, setIssueMunicipalitySearch] = useState('');
  const [issueMunicipalities, setIssueMunicipalities] = useState<IbgeMunicipality[]>([]);
  const [issueMunicipalitySuggestions, setIssueMunicipalitySuggestions] = useState<IbgeMunicipality[]>([]);

  const activeCompany = useMemo(() => companies.find((company) => company.id === activeCompanyId) || null, [companies, activeCompanyId]);
  const selectedInvoices = useMemo(() => invoices.filter((invoice) => selectedInvoiceIds.includes(invoice.id)), [invoices, selectedInvoiceIds]);
  const allInvoicesSelected = invoices.length > 0 && invoices.every((invoice) => selectedInvoiceIds.includes(invoice.id));
  const invoiceDateFilterError = getDateFilterError(invoiceStartDate, invoiceEndDate);

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
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    setCustomers(await requestApi<Customer[]>(`/companies/${activeCompanyId}/nfse/customers${query}`));
  }

  async function loadServices() {
    if (!activeCompanyId) return;
    setServices(await requestApi<NfseServiceItem[]>(`/companies/${activeCompanyId}/nfse/services`));
  }

  async function loadCompanySettings() {
    if (!activeCompanyId) return null;
    const settings = await requestApi<NfseSettings>(`/companies/${activeCompanyId}/nfse/settings`);
    setCompanySettings(settings);
    return settings;
  }

  async function loadInvoices(nextPage = invoicePage, nextPageSize = invoicePageSize) {
    if (!activeCompanyId) return;
    const paramsQuery = new URLSearchParams();
    paramsQuery.set('page', String(nextPage));
    paramsQuery.set('pageSize', String(nextPageSize));
    if (invoiceSearch.trim()) paramsQuery.set('search', invoiceSearch.trim());
    if (invoiceStatus) paramsQuery.set('status', invoiceStatus);
    const dateError = getDateFilterError(invoiceStartDate, invoiceEndDate);
    if (dateError) return;
    const startDate = parseDateFilterInput(invoiceStartDate).iso;
    const endDate = parseDateFilterInput(invoiceEndDate).iso;
    if (startDate) paramsQuery.set('startDate', startDate);
    if (endDate) paramsQuery.set('endDate', endDate);
    const data = await requestApi<InvoiceListResponse>(`/companies/${activeCompanyId}/nfse/invoices?${paramsQuery.toString()}`);
    setInvoices(data.items);
    setInvoicePage(data.page);
    setInvoicePageSize(data.pageSize);
    setInvoiceTotalPages(data.totalPages);
    setInvoiceTotal(data.total);
    setSelectedInvoiceIds([]);
  }

  useEffect(() => {
    const nextSection = sectionFromPath(pathname, params.companyId);
    setActiveCompanyId(params.companyId);
    setActiveSection(nextSection);
    if (nextSection.startsWith('nfse')) setIsNfseOpen(true);
    if (nextSection.startsWith('accounting')) setIsAccountingOpen(true);
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
        if (activeSection === 'nfse-takers' || activeSection === 'nfse-list') await loadCustomers();
        if (activeSection === 'nfse-list' || activeSection === 'settings' || activeSection === 'nfse-params') await loadServices();
        if (activeSection === 'nfse-list') await loadCompanySettings();
        if (activeSection === 'nfse-list') await loadInvoices(1, invoicePageSize);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados do módulo.');
      }
    }
    if (!isLoading && activeCompanyId) void loadSectionData();
  }, [activeSection, activeCompanyId, isLoading]);

  useEffect(() => {
    if (isLoading || !activeCompanyId || activeSection !== 'nfse-list') return;
    if (getDateFilterError(invoiceStartDate, invoiceEndDate)) return;
    const timer = window.setTimeout(() => {
      void loadInvoices(1, invoicePageSize).catch((err) => {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar as notas fiscais.');
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [invoiceSearch, invoiceStatus, invoiceStartDate, invoiceEndDate, invoicePageSize, activeSection, activeCompanyId, isLoading]);

  function handleCompanyChange(companyId: string) {
    setActiveCompanyId(companyId);
    setCompanySettings(null);
    router.push(pathForSection(companyId, activeSection));
  }

  function handleLogout() {
    localStorage.removeItem('nfse_access_token');
    localStorage.removeItem('nfse_user');
    router.replace('/login');
  }

  function goToSection(section: ModuleSection) {
    setActiveSection(section);
    if (section.startsWith('nfse')) setIsNfseOpen(true);
    if (section.startsWith('accounting')) setIsAccountingOpen(true);
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
    if (isCollapsed) {
      setIsNfseOpen(true);
      if (!activeSection.startsWith('nfse')) goToSection('nfse-list');
      return;
    }
    setIsNfseOpen((current) => !current);
  }

  function handleAccountingMenuClick() {
    if (isCollapsed) {
      setIsAccountingOpen(true);
      if (!activeSection.startsWith('accounting')) goToSection('accounting-documents');
      return;
    }
    setIsAccountingOpen((current) => !current);
  }

  async function openIssueModal() {
    const defaultService = services.find((service) => service.isDefault) || services[0];
    let settings = companySettings;
    try {
      settings = await loadCompanySettings();
    } catch {
      settings = companySettings;
    }
    const defaultIbge = onlyDigits(settings?.municipalIbgeCode || '');
    const defaultMunicipality = activeCompany?.city && activeCompany?.state
      ? `${activeCompany.city}/${activeCompany.state}${defaultIbge ? ` - ${defaultIbge}` : ''}`
      : '';
    setInvoiceForm({
      ...emptyInvoiceForm,
      customerId: '',
      competenceDate: '',
      serviceId: defaultService?.id || '',
      municipalIbgeCode: defaultIbge,
      serviceDescription: defaultService?.description || defaultService?.name || '',
      nationalTaxCode: defaultService?.nationalTaxCode || '',
      municipalServiceCode: defaultService?.municipalServiceCode || '',
      operationNature: settings?.defaultOperationNature || emptyInvoiceForm.operationNature,
      amount: '',
      issRate: defaultService?.issRate ? String(defaultService.issRate) : '',
      issWithheld: Boolean(settings?.defaultIssWithheld ?? defaultService?.isIssWithheld ?? false),
      additionalInformation: '',
    });
    setIssueMunicipalitySearch(defaultMunicipality);
    setIssueMunicipalitySuggestions([]);
    setModalFieldErrors({});
    setModalError('');
    setModalSuccess('');
    setNfseModal('issue');
  }

  function openTakerModal(customer?: Customer) {
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

  function canDeleteLastInvoice(invoice: NfseInvoice) {
    return invoices[0]?.id === invoice.id && invoice.status === 'DRAFT' && !invoice.accessKey && !invoice.issuedAt;
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
      serviceDescription: service?.description || service?.name || current.serviceDescription,
      nationalTaxCode: service?.nationalTaxCode || current.nationalTaxCode,
      municipalServiceCode: service?.municipalServiceCode || current.municipalServiceCode,
      issRate: service?.issRate ? String(service.issRate) : current.issRate,
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
    try {
      const created = await requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices`, {
        method: 'POST',
        body: JSON.stringify({ ...invoiceForm, amount: invoiceForm.amount.replace(',', '.'), issRate: invoiceForm.issRate.replace(',', '.') }),
      });
      await requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices/${created.id}/transmit`, { method: 'POST' });
      setModalSuccess('NFS-e enviada para transmissão.');
      setNfseModal(null);
      await loadInvoices(1, invoicePageSize);
      router.push(pathForSection(activeCompanyId, 'nfse-list'));
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Não foi possível transmitir a NFS-e.');
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

  async function syncInvoice(invoiceId: string) {
    try {
      await requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices/${invoiceId}/sync`);
      setInvoiceMessage('Consulta da NFS-e atualizada.');
      setInvoiceMessageTone('success');
      await loadInvoices(invoicePage, invoicePageSize);
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Não foi possível consultar a NFS-e.');
      setInvoiceMessageTone('error');
    }
  }

  async function deleteLastInvoice(invoice: NfseInvoice) {
    if (!canDeleteLastInvoice(invoice)) {
      setInvoiceMessage('Apenas a última NFS-e em rascunho e ainda não transmitida pode ser excluída.');
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

  async function showStoredFile(invoiceId: string, kind: 'xml' | 'pdf') {
    try {
      const file = await requestApi<StoredFile>(`/companies/${activeCompanyId}/nfse/invoices/${invoiceId}/${kind}`);
      setInvoiceMessage(`${file.kind} registrado: ${file.fileName} (${file.path}).`);
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

  function downloadSelected(kind: 'pdf' | 'xml') {
    if (!selectedInvoices.length) return;
    const entries = selectedInvoices.map((invoice) => {
      const number = invoice.number || invoice.id.slice(0, 8);
      const customerName = invoice.customer?.name || 'Tomador não informado';
      const extension = kind === 'pdf' ? 'pdf' : 'xml';
      const content = kind === 'pdf'
        ? `PDF da NFS-e ${number}\nTomador: ${customerName}\nEmissao: ${formatDate(invoice.issuedAt || invoice.createdAt)}\nValor: ${formatCurrency(invoice.amount)}\nStatus: ${invoiceStatusLabel(invoice.status)}\nChave: ${invoice.accessKey || '-'}\n`
        : `<?xml version="1.0" encoding="UTF-8"?>\n<nfse>\n  <numero>${number}</numero>\n  <chave>${invoice.accessKey || ''}</chave>\n  <tomador>${customerName}</tomador>\n  <emissao>${formatDate(invoice.issuedAt || invoice.createdAt)}</emissao>\n  <valor>${formatCurrency(invoice.amount)}</valor>\n  <status>${invoiceStatusLabel(invoice.status)}</status>\n</nfse>\n`;
      return { name: `nfse-${number}.${extension}`, content };
    });
    downloadBlob(createZip(entries), kind === 'pdf' ? 'nfse-pdfs-selecionadas.zip' : 'nfse-xmls-selecionados.zip');
  }

  const modal = nfseModal ? (
    <div className="nfse-modal-backdrop" role="presentation">
      <section className="nfse-modal" role="dialog" aria-modal="true">
        <button className="companies-close modal-close" type="button" onClick={() => setNfseModal(null)}>x</button>
        {nfseModal === 'issue' ? (
          <>
            <div className="nfse-modal__heading">
              <h2>Emitir NFS-e</h2>
              <p>Dados iniciais da DPS/RPS para transmissão à API nacional de NFS-e.</p>
            </div>
            <form className="nfse-form nfse-form--issue" onSubmit={saveAndTransmitInvoice} noValidate autoComplete="off">
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
                <small>Código IBGE: {invoiceForm.municipalIbgeCode || 'selecione o município'}</small>
                {modalFieldErrors.municipalIbgeCode ? <span className="field-error">● {modalFieldErrors.municipalIbgeCode}</span> : null}
              </label>
              <label className="nfse-issue-code-field">Código de tributação nacional
                <input value={invoiceForm.nationalTaxCode} onChange={(event) => updateInvoice('nationalTaxCode', event.target.value)} placeholder="Ex.: 01.01.01" />
              </label>
              <label className="nfse-issue-code-field">Código do serviço municipal
                <input value={invoiceForm.municipalServiceCode} onChange={(event) => updateInvoice('municipalServiceCode', event.target.value)} placeholder="Item da lista municipal" />
              </label>
              <label>Natureza da operação
                <input value={invoiceForm.operationNature} onChange={(event) => updateInvoice('operationNature', event.target.value)} />
              </label>
              <label className={modalFieldErrors.amount ? 'is-invalid' : ''} data-field="amount">Valor do serviço
                <input value={invoiceForm.amount} onChange={(event) => updateInvoice('amount', formatDecimalInput(event.target.value))} placeholder="0,00" required inputMode="decimal" />
                {modalFieldErrors.amount ? <span className="field-error">● {modalFieldErrors.amount}</span> : null}
              </label>
              <label className={modalFieldErrors.issRate ? 'is-invalid' : ''} data-field="issRate">Alíquota ISS
                <input value={invoiceForm.issRate} onChange={(event) => updateInvoice('issRate', formatDecimalInput(event.target.value, 4))} placeholder="0,00%" inputMode="decimal" />
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
                <button className="companies-button companies-button--ghost" type="button" onClick={() => setNfseModal(null)}>Cancelar</button>
                <button className="companies-button companies-button--primary" type="submit" disabled={isModalSaving}>{isModalSaving ? 'Transmitindo...' : 'Transmitir NFS-e'}</button>
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
                <button className="companies-button companies-button--ghost" type="button" onClick={() => setNfseModal(null)}>Cancelar</button>
                <button className="companies-button companies-button--primary" type="submit" disabled={isModalSaving}>{isModalSaving ? 'Salvando...' : editingTakerId ? 'Salvar alterações' : 'Salvar tomador'}</button>
              </div>
            </form>
          </>
        ) : null}
      </section>
    </div>
  ) : null;
  const isNfseSection = activeSection.startsWith('nfse');
  const isAccountingSection = activeSection.startsWith('accounting');
  const showCompactNfseSubmenu = isCollapsed && isNfseOpen && isNfseSection;
  const showCompactAccountingSubmenu = isCollapsed && isAccountingOpen && isAccountingSection;
  const showCompactSubmenu = showCompactNfseSubmenu || showCompactAccountingSubmenu;
  const accountingSectionTitle = ({
    'accounting-documents': 'Documentos',
    'accounting-taxes': 'Impostos',
    'accounting-requests': 'Solicitações',
    'accounting-processes': 'Processos',
  } as Record<ModuleSection, string>)[activeSection] || 'Contabilidade';

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
              <button className={`company-sidebar__item company-sidebar__group-toggle ${isNfseSection ? 'is-active' : ''}`} type="button" onClick={handleNfseMenuClick} data-tooltip="NFS-e" title="NFS-e">
                <span className="company-sidebar__group-title"><span className="company-sidebar__icon"><NoteIcon /></span><span className="company-sidebar__label">NFS-e</span></span>
                <span className="company-sidebar__group-arrow"><MenuChevronIcon /></span>
              </button>
              {isNfseOpen ? (
                <div className="company-sidebar__submenu">
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-list' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('nfse-list')}>Notas Fiscais</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-takers' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('nfse-takers')}>Cadastro de Tomadores</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-params' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('nfse-params')}>Parametrização</button>
                </div>
              ) : null}
            </div>
            <div className={`company-sidebar__group ${isAccountingOpen ? 'is-open' : ''}`}>
              <button className={`company-sidebar__item company-sidebar__group-toggle ${isAccountingSection ? 'is-active' : ''}`} type="button" onClick={handleAccountingMenuClick} data-tooltip="Contabilidade" title="Contabilidade">
                <span className="company-sidebar__group-title"><span className="company-sidebar__icon"><AccountingIcon /></span><span className="company-sidebar__label">Contabilidade</span></span>
                <span className="company-sidebar__group-arrow"><MenuChevronIcon /></span>
              </button>
              {isAccountingOpen ? (
                <div className="company-sidebar__submenu">
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'accounting-documents' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('accounting-documents')}>Documentos</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'accounting-taxes' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('accounting-taxes')}>Impostos</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'accounting-requests' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('accounting-requests')}>Solicitações</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'accounting-processes' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('accounting-processes')}>Processos</button>
                </div>
              ) : null}
            </div>
          </nav>
          <div className="company-sidebar__footer">
            <button className={`company-sidebar__item company-sidebar__item--settings ${activeSection === 'settings' || activeSection === 'nfse-params' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('settings')} data-tooltip="Configurações" title="Configurações de emissão de notas fiscais">
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
              <button className={activeSection === 'nfse-list' ? 'is-active' : ''} type="button" onClick={() => goToSection('nfse-list')}>Notas Fiscais</button>
              <button className={activeSection === 'nfse-takers' ? 'is-active' : ''} type="button" onClick={() => goToSection('nfse-takers')}>Cadastro de Tomadores</button>
              <button className={activeSection === 'nfse-params' ? 'is-active' : ''} type="button" onClick={() => goToSection('nfse-params')}>Parametrização</button>
            </nav>
          ) : null}
          {showCompactAccountingSubmenu ? (
            <nav className="company-module-compact-submenu" aria-label="Submenus de Contabilidade">
              <button className={activeSection === 'accounting-documents' ? 'is-active' : ''} type="button" onClick={() => goToSection('accounting-documents')}>Documentos</button>
              <button className={activeSection === 'accounting-taxes' ? 'is-active' : ''} type="button" onClick={() => goToSection('accounting-taxes')}>Impostos</button>
              <button className={activeSection === 'accounting-requests' ? 'is-active' : ''} type="button" onClick={() => goToSection('accounting-requests')}>Solicitações</button>
              <button className={activeSection === 'accounting-processes' ? 'is-active' : ''} type="button" onClick={() => goToSection('accounting-processes')}>Processos</button>
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
                  <span>{formatCnpj(activeCompany.cnpj)} - {activeCompany.city}/{activeCompany.state} - {roleLabel(activeCompany.role)}</span>
                </section>
                <section className="company-module-cards">
                  <article className="company-module-card"><strong>Emissão NFS-e</strong><span>Crie DPS, selecione tomador e serviço, e acompanhe a transmissão.</span></article>
                  <article className="company-module-card"><strong>Regime tributário</strong><span>{activeCompany.taxRegime || 'Não informado'}</span></article>
                  <article className="company-module-card"><strong>Parametrização</strong><span>Certificado, município, regime e serviços padrões em um fluxo React único.</span></article>
                </section>
              </>
            ) : null}

            {!isLoading && activeCompany && activeSection === 'nfse-takers' ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>NFS-e</p><h1>Cadastro de Tomadores</h1><span>Clientes que poderão ser selecionados na emissão.</span></section>
                <div className="nfse-panel">
                  <div className="nfse-panel__header">
                    <div><h2>Tomadores cadastrados</h2><p>Lista carregada pela API, no mesmo padrão React da tela inicial.</p></div>
                    <button className="companies-button companies-button--primary" type="button" onClick={() => openTakerModal()}>+ Novo tomador</button>
                  </div>
                  {takerMessage ? <p className="nfse-settings-clean__message" data-tone={takerMessageTone}>{takerMessage}</p> : null}
                  <div className="nfse-table-wrap">
                    <table className="nfse-table">
                      <thead><tr><th>Nome</th><th>Documento</th><th>E-mail</th><th>Cidade/UF</th><th>Ações</th></tr></thead>
                      <tbody>
                        {customers.length ? customers.map((customer) => (
                          <tr key={customer.id} className={customer.isActive === false ? 'is-inactive' : ''}>
                            <td><div className="nfse-invoice-number"><strong>{customer.name}</strong>{customer.isActive === false ? <small className="nfse-access-key">Inativo</small> : null}</div></td>
                            <td>{formatDocument(customer.document)}</td>
                            <td>{customer.email || '-'}</td>
                            <td>{customer.city || '-'}/{customer.state || '-'}</td>
                            <td><div className="nfse-actions">
                              <button className="nfse-icon-button" type="button" onClick={() => openTakerModal(customer)} title="Editar tomador" aria-label="Editar tomador"><EditIcon /></button>
                              {customer.isActive === false ? (
                                <button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" onClick={() => void toggleTakerActive(customer, true)} title="Reativar tomador" aria-label="Reativar tomador"><RestoreIcon /></button>
                              ) : customerInvoiceCount(customer) > 0 ? (
                                <button className="nfse-icon-button nfse-icon-button--soft-danger" type="button" onClick={() => void toggleTakerActive(customer, false)} title="Inativar tomador" aria-label="Inativar tomador"><ArchiveIcon /></button>
                              ) : (
                                <button className="nfse-icon-button nfse-icon-button--danger" type="button" onClick={() => void removeTaker(customer)} title="Excluir tomador" aria-label="Excluir tomador"><TrashIcon /></button>
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

            {!isLoading && activeCompany && activeSection === 'nfse-list' ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>NFS-e</p><h1>Notas Fiscais</h1><span>Consulta paginada com ações, seleção e exportação em lote.</span></section>
                <div className="nfse-panel">
                  <div className="nfse-search-row nfse-search-row--with-period">
                    <input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Buscar por tomador, número, chave de acesso, valor ou status..." />
                    <select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)}>
                      <option value="">Todos os status</option>
                      <option value="DRAFT">Rascunho</option>
                      <option value="PROCESSING">Processando</option>
                      <option value="AUTHORIZED">Autorizada</option>
                      <option value="REJECTED">Rejeitada</option>
                      <option value="CANCELLED">Cancelada</option>
                    </select>
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
                    <button className="companies-button companies-button--primary nfse-new-invoice-button" type="button" onClick={() => void openIssueModal()}>+ Nova NFS-e</button>
                  </div>
                  {invoiceMessage ? <p className="nfse-settings-clean__message" data-tone={invoiceMessageTone}>{invoiceMessage}</p> : null}
                  <div className="nfse-selection-summary">
                    <span>{selectedInvoices.length ? `${selectedInvoices.length} nota(s) selecionada(s)` : `${invoiceTotal} nota(s) encontrada(s).`}</span>
                    <div className="nfse-bulk-download-actions">
                      <button className="companies-button companies-button--ghost companies-button--mini" type="button" disabled={!selectedInvoices.length} onClick={() => downloadSelected('pdf')}>Baixar PDFs .zip</button>
                      <button className="companies-button companies-button--ghost companies-button--mini" type="button" disabled={!selectedInvoices.length} onClick={() => downloadSelected('xml')}>Baixar XMLs .zip</button>
                      {selectedInvoices.length ? <button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => setSelectedInvoiceIds([])}>Limpar seleção</button> : null}
                    </div>
                  </div>
                  <div className="nfse-table-wrap">
                    <table className="nfse-table">
                      <thead><tr><th className="nfse-select-cell"><input type="checkbox" aria-label="Selecionar notas da página" checked={allInvoicesSelected} onChange={toggleAllInvoices} /></th><th>Número</th><th>Tomador</th><th>Emissão</th><th>Valor</th><th>Status</th><th>Arquivos</th></tr></thead>
                      <tbody>
                        {invoices.length ? invoices.map((invoice) => (
                          <tr key={invoice.id} className={selectedInvoiceIds.includes(invoice.id) ? 'is-selected' : ''}>
                            <td className="nfse-select-cell"><input type="checkbox" aria-label={`Selecionar nota ${invoice.number || invoice.id}`} checked={selectedInvoiceIds.includes(invoice.id)} onChange={() => toggleInvoiceSelection(invoice.id)} /></td>
                            <td><div className="nfse-invoice-number"><strong>{invoice.number || invoice.id.slice(0, 8)}</strong><small className="nfse-access-key">Chave: {invoice.accessKey || '-'}</small></div></td>
                            <td>{invoice.customer?.name || '-'}</td>
                            <td>{formatDate(invoice.issuedAt || invoice.createdAt)}</td>
                            <td>{formatCurrency(invoice.amount)}</td>
                            <td><span className="nfse-chip">{invoiceStatusLabel(invoice.status)}</span></td>
                            <td><div className="nfse-actions"><button className="nfse-icon-button nfse-file-icon-button" type="button" title="Ver PDF" aria-label="Ver PDF" onClick={() => void showStoredFile(invoice.id, 'pdf')}><PdfFileIcon /></button><button className="nfse-icon-button nfse-file-icon-button" type="button" title="Ver XML" aria-label="Ver XML" onClick={() => void showStoredFile(invoice.id, 'xml')}><XmlFileIcon /></button><button className="companies-button companies-button--ghost" type="button" onClick={() => void transmitExistingInvoice(invoice.id)}>Transmitir</button><button className="companies-button companies-button--ghost" type="button" onClick={() => void syncInvoice(invoice.id)}>Sincronizar</button>{invoice.status === 'DRAFT' ? <button className="nfse-icon-button nfse-icon-button--danger" type="button" disabled={!canDeleteLastInvoice(invoice)} title={canDeleteLastInvoice(invoice) ? 'Excluir ultima NFS-e em rascunho' : 'Somente a ultima NFS-e em rascunho pode ser excluida'} aria-label="Excluir NFS-e" onClick={() => void deleteLastInvoice(invoice)}><TrashIcon /></button> : null}</div></td>
                          </tr>
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

            {!isLoading && activeCompany && isAccountingSection ? (
              <section className="nfse-section">
                <section className="company-module-hero">
                  <p>Contabilidade</p>
                  <h1>{accountingSectionTitle}</h1>
                  <span>Módulo preparado para organizar documentos, impostos, solicitações e processos contábeis.</span>
                </section>
                <div className="nfse-panel">
                  <p className="company-module-empty">Funcionalidade em preparação para este módulo.</p>
                </div>
              </section>
            ) : null}

            {!isLoading && activeCompany && (activeSection === 'settings' || activeSection === 'nfse-params') ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>Configurações</p><h1>Configurações da empresa</h1><span>{activeCompany.legalName} - {formatCnpj(activeCompany.cnpj)}</span></section>
                <div className="company-settings-tabs" aria-label="Abas de configuração">
                  <button className="is-active" type="button">NFS-e</button>
                </div>
                <SettingsSection companyId={activeCompanyId} company={activeCompany} requestApi={requestApi} services={services} reloadServices={loadServices} />
              </section>
            ) : null}
          </div>
        </section>
      </div>
      {modal}
    </main>
  );
}
