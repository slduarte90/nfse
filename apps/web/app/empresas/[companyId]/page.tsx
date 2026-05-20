'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import '../../company-module.css';
import '../../nfse-module.css';

const apiBase = 'http://localhost:3333';
const pageSizeOptions = [20, 50, 100];

type AccountRole = 'ADMIN' | 'USER';
type CompanyRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'ADMIN_VIEW';
type ModuleSection = 'home' | 'settings' | 'nfse-issue' | 'nfse-takers' | 'nfse-list' | 'nfse-params';
type InvoiceStatus = 'DRAFT' | 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED';
type MessageTone = 'success' | 'error';
type ApiRequester = <T>(path: string, options?: RequestInit) => Promise<T>;

type StoredUser = { id: string; name: string; email: string; accountRole: AccountRole };
type Company = { id: string; legalName: string; tradeName?: string | null; cnpj: string; city: string; state: string; taxRegime: string; role: CompanyRole };
type Customer = { id: string; name: string; document: string; email?: string | null; phone?: string | null; city?: string | null; state?: string | null; address?: string | null; number?: string | null; neighborhood?: string | null; zipCode?: string | null; municipalRegistration?: string | null; stateRegistration?: string | null; country?: string | null; isForeign?: boolean };
type NfseServiceItem = { id: string; name: string; nationalTaxCode: string; municipalServiceCode?: string | null; cityServiceCode?: string | null; cnae?: string | null; issRate?: string | number | null; description?: string | null; isDefault?: boolean; isIssWithheld?: boolean };
type NfseSettings = { environment?: string; apiBaseUrl?: string | null; apiVersion?: string | null; municipalIbgeCode?: string | null; municipalRegistration?: string | null; taxRegime?: string; specialTaxRegime?: string | null; isSimpleNational?: boolean; hasFiscalIncentive?: boolean; defaultIssWithheld?: boolean; defaultOperationNature?: string | null; defaultRpsSeries?: string | null };
type CertificateSummary = { id: string; originalFileName: string; subjectName?: string | null; issuerName?: string | null; serialNumber?: string | null; validFrom?: string | null; validUntil?: string | null; status: string; createdAt: string };
type NfseInvoice = { id: string; number?: string | null; accessKey?: string | null; status: InvoiceStatus; amount: string | number; serviceDescription: string; serviceCode?: string | null; nationalTaxCode?: string | null; municipalServiceCode?: string | null; issuedAt?: string | null; createdAt: string; errorMessage?: string | null; customer?: Customer | null; service?: NfseServiceItem | null };
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
  operationNature: 'Tributacao no municipio',
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
  return ({ OWNER: 'Responsavel', ADMIN: 'Administrador', OPERATOR: 'Operador', VIEWER: 'Visualizador', ADMIN_VIEW: 'Administrador' } as Record<string, string>)[role] || role;
}

function invoiceStatusLabel(status: string) {
  return ({ DRAFT: 'Rascunho', PROCESSING: 'Processando', AUTHORIZED: 'Autorizada', REJECTED: 'Rejeitada', CANCELLED: 'Cancelada' } as Record<string, string>)[status] || status;
}

function certificateStatusLabel(status?: string) {
  return ({ VALID: 'Valido', EXPIRED: 'Vencido', INVALID: 'Invalido', PENDING: 'Pendente', REVOKED: 'Desvinculado' } as Record<string, string>)[status || ''] || 'Nao informado';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
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
  if (suffix === '/nfse/emissao') return 'nfse-issue';
  if (suffix === '/nfse/tomadores') return 'nfse-takers';
  if (suffix === '/nfse/notas') return 'nfse-list';
  if (suffix === '/nfse/parametrizacao') return 'nfse-params';
  if (suffix === '/configuracoes') return 'settings';
  return 'home';
}

function pathForSection(companyId: string, section: ModuleSection) {
  const base = `/empresas/${companyId}`;
  if (section === 'nfse-issue') return `${base}/nfse/emissao`;
  if (section === 'nfse-takers') return `${base}/nfse/tomadores`;
  if (section === 'nfse-list') return `${base}/nfse/notas`;
  if (section === 'nfse-params') return `${base}/nfse/parametrizacao`;
  if (section === 'settings') return `${base}/configuracoes`;
  return base;
}

function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.75 10.75 12 4l8.25 6.75" /><path d="M5.75 9.5v9.25h4.6v-5.4h3.3v5.4h4.6V9.5" /></svg>;
}

function NoteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.75h7l3 3v13.5H7z" /><path d="M14 3.75v3h3" /><path d="M9.5 10h5" /><path d="M9.5 13h5" /><path d="M9.5 16h3" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.85 1.85 0 0 0 .37 2.04l.07.07a2.22 2.22 0 1 1-3.14 3.14l-.07-.07a1.85 1.85 0 0 0-2.04-.37 1.85 1.85 0 0 0-1.12 1.7V21.7a2.22 2.22 0 1 1-4.44 0v-.1a1.85 1.85 0 0 0-1.12-1.7 1.85 1.85 0 0 0-2.04.37l-.07.07a2.22 2.22 0 1 1-3.14-3.14l.07-.07A1.85 1.85 0 0 0 4.1 15a1.85 1.85 0 0 0-1.7-1.12H2.3a2.22 2.22 0 1 1 0-4.44h.1a1.85 1.85 0 0 0 1.7-1.12 1.85 1.85 0 0 0-.37-2.04l-.07-.07A2.22 2.22 0 1 1 6.8 3.07l.07.07a1.85 1.85 0 0 0 2.04.37 1.85 1.85 0 0 0 1.12-1.7V1.7a2.22 2.22 0 1 1 4.44 0v.1a1.85 1.85 0 0 0 1.12 1.7 1.85 1.85 0 0 0 2.04-.37l.07-.07a2.22 2.22 0 1 1 3.14 3.14l-.07.07a1.85 1.85 0 0 0-.37 2.04 1.85 1.85 0 0 0 1.7 1.12h.1a2.22 2.22 0 1 1 0 4.44h-.1A1.85 1.85 0 0 0 19.4 15Z" /></svg>;
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{collapsed ? <><path d="m8 6 6 6-6 6" /><path d="m13 6 6 6-6 6" /></> : <><path d="m16 6-6 6 6 6" /><path d="m11 6-6 6 6 6" /></>}</svg>;
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
  const [serviceForm, setServiceForm] = useState({ name: '', nationalTaxCode: '', municipalServiceCode: '', issRate: '', description: '' });

  useEffect(() => {
    let mounted = true;
    async function load() {
      setIsLoading(true);
      setMessage('');
      try {
        const [settingsData, certificateData] = await Promise.all([
          requestApi<NfseSettings>(`/companies/${companyId}/nfse/settings`),
          requestApi<{ certificate: CertificateSummary | null }>(`/companies/${companyId}/nfse/settings/certificate`),
          reloadServices(),
        ]);
        if (!mounted) return;
        setSettings(settingsData);
        setCertificate(certificateData.certificate || null);
      } catch (error) {
        if (!mounted) return;
        setMessage(error instanceof Error ? error.message : 'Nao foi possivel carregar as configuracoes.');
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
      reportSettingsError('settings-municipality', 'Selecione o municipio para preencher um codigo IBGE valido com 7 digitos.');
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
      setMessage('Configuracoes salvas com sucesso.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nao foi possivel salvar as configuracoes.');
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
      setMessage('Certificado enviado e vinculado a empresa.');
      setMessageTone('success');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Nao foi possivel enviar o certificado.';
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
      setMessage('Certificado desvinculado e anexo anterior removido.');
      setMessageTone('success');
    } catch (error) {
      reportSettingsError('certificate-file', error instanceof Error ? error.message : 'Nao foi possivel desvincular o certificado.');
    } finally {
      setIsUploading(false);
    }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSettingsErrors({});
    if (!serviceForm.name.trim()) {
      reportSettingsError('service-name', 'Informe o nome do servico.');
      return;
    }
    if (!serviceForm.nationalTaxCode.trim()) {
      reportSettingsError('service-national-code', 'Informe o codigo de tributacao nacional.');
      return;
    }
    if (!isValidDecimal(serviceForm.issRate)) {
      reportSettingsError('service-iss-rate', 'Aliquota ISS invalida. Use somente numeros e virgula.');
      return;
    }
    try {
      await requestApi<NfseServiceItem>(`/companies/${companyId}/nfse/services`, {
        method: 'POST',
        body: JSON.stringify({ ...serviceForm, issRate: serviceForm.issRate.replace(',', '.'), isDefault: services.length === 0 }),
      });
      setServiceForm({ name: '', nationalTaxCode: '', municipalServiceCode: '', issRate: '', description: '' });
      await reloadServices();
      setMessage('Servico cadastrado com sucesso.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nao foi possivel cadastrar o servico.');
      setMessageTone('error');
    }
  }

  async function setDefaultService(serviceId: string) {
    try {
      await requestApi<NfseServiceItem>(`/companies/${companyId}/nfse/services/${serviceId}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) });
      await reloadServices();
      setMessage('Servico padrao atualizado.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nao foi possivel atualizar o servico padrao.');
      setMessageTone('error');
    }
  }

  async function deleteService(serviceId: string) {
    try {
      await requestApi<NfseServiceItem>(`/companies/${companyId}/nfse/services/${serviceId}`, { method: 'DELETE' });
      await reloadServices();
      setMessage('Servico inativado.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nao foi possivel inativar o servico.');
      setMessageTone('error');
    }
  }

  if (isLoading) return <p className="company-module-empty">Carregando configuracoes...</p>;

  const hasMunicipality = onlyDigits(settings?.municipalIbgeCode || '').length === 7;
  const hasCertificate = certificate?.status === 'VALID';
  const hasServices = services.length > 0;
  const defaultService = services.find((service) => service.isDefault);
  const essentialReady = [hasMunicipality, hasCertificate, hasServices].filter(Boolean).length;

  return (
    <section className="nfse-settings-clean nfse-params-clean">
      <div className="nfse-params-top">
        <div>
          <p>Parametrizacao</p>
          <h2>Emissao de NFS-e</h2>
        </div>
        <div className="nfse-params-progress" aria-label="Itens essenciais configurados">
          <strong>{essentialReady}/3</strong>
          <span>essenciais</span>
        </div>
      </div>

      <div className="nfse-params-company-strip">
        <span><strong>CNPJ</strong>{formatCnpj(company.cnpj)}</span>
        <span><strong>Razao social</strong>{company.legalName}</span>
        <span><strong>Municipio</strong>{company.city}/{company.state}</span>
      </div>

      <Message text={message} tone={messageTone} />

      <div className="nfse-params-layout">
        <aside className="nfse-params-sidebar" aria-label="Etapas da parametrizacao">
          <a className={hasMunicipality ? 'is-done' : ''} href="#nfse-param-fiscal"><strong>Dados fiscais</strong><small>{hasMunicipality ? 'Municipio definido' : 'Pendente'}</small></a>
          <a className={hasCertificate ? 'is-done' : ''} href="#nfse-param-certificate"><strong>Certificado</strong><small>{hasCertificate ? 'Valido' : 'Pendente'}</small></a>
          <a className={hasServices ? 'is-done' : ''} href="#nfse-param-services"><strong>Servicos</strong><small>{hasServices ? `${services.length} cadastrado(s)` : 'Pendente'}</small></a>
          <a href="#nfse-param-optional"><strong>Opcionais</strong><small>Regime e API</small></a>
        </aside>

        <div className="nfse-params-main">
          <section className="nfse-params-section" id="nfse-param-fiscal">
            <div className="nfse-params-section__heading">
              <div>
                <h3>Dados fiscais</h3>
                <span>Necessario para identificar o municipio da emissao.</span>
              </div>
              <em>{hasMunicipality ? 'OK' : 'Obrigatorio'}</em>
            </div>
            <div className="nfse-settings-clean__fields nfse-settings-clean__fields--municipality">
              <label className={`nfse-city-combobox-field ${settingsErrors['settings-municipality'] ? 'is-invalid' : ''}`} data-field="settings-municipality">Municipio
                <div className="nfse-city-combobox">
                  <input value={municipalitySearch} onChange={(event) => void searchMunicipalities(event.target.value)} placeholder="Digite e selecione o municipio" autoComplete="off" />
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
              <label className={settingsErrors['settings-municipality'] ? 'is-invalid' : ''}>Codigo IBGE
                <input value={settings?.municipalIbgeCode || ''} onChange={(event) => updateSetting('municipalIbgeCode', onlyDigits(event.target.value).slice(0, 7))} placeholder="Ex.: 3148103" />
              </label>
              <label>Inscricao Municipal
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
              <em>{hasCertificate ? 'OK' : 'Obrigatorio'}</em>
            </div>
            {certificate ? (
              <div className="nfse-certificate-status">
                <div className="nfse-certificate-status__grid">
                  <span><strong>Arquivo</strong>{certificate.originalFileName}</span>
                  <span><strong>Status</strong>{certificateStatusLabel(certificate.status)}</span>
                  <span><strong>Titular</strong>{certificate.subjectName || 'Nao informado'}</span>
                  <span><strong>Vencimento</strong>{formatDate(certificate.validUntil)}</span>
                </div>
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
                <h3>Perfis de servico</h3>
                <span>{defaultService ? `Padrao: ${defaultService.name}` : 'Defina ao menos um servico para agilizar a emissao.'}</span>
              </div>
              <em>{hasServices ? 'OK' : 'Recomendado'}</em>
            </div>
            <div className="nfse-services-table-wrap">
              <table className="nfse-services-table">
                <thead>
                  <tr><th>Padrao</th><th>Servico</th><th>Codigo nacional</th><th>ISS</th><th>Acoes</th></tr>
                </thead>
                <tbody>
                  {services.length ? services.map((service) => (
                    <tr key={service.id}>
                      <td>
                        <label className="nfse-service-default-choice" title="Marcar este servico como padrao">
                          <input type="radio" name="defaultService" checked={Boolean(service.isDefault)} onChange={() => void setDefaultService(service.id)} />
                          <span>{service.isDefault ? 'Padrao' : 'Definir'}</span>
                        </label>
                      </td>
                      <td><strong>{service.name || '-'}</strong><small>{service.municipalServiceCode ? `Municipal: ${service.municipalServiceCode}` : service.description || ''}</small></td>
                      <td>{service.nationalTaxCode || '-'}</td>
                      <td>{service.issRate ?? '-'}</td>
                      <td><button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => void deleteService(service.id)}>Inativar</button></td>
                    </tr>
                  )) : <tr><td colSpan={5} className="nfse-services-empty">Nenhum servico cadastrado ainda.</td></tr>}
                </tbody>
              </table>
            </div>
            <details className="nfse-params-details" open={!services.length}>
              <summary>Adicionar perfil de servico</summary>
              <form className="nfse-service-form" onSubmit={createService}>
                <label className={`nfse-service-field--wide ${settingsErrors['service-name'] ? 'is-invalid' : ''}`} data-field="service-name">Nome do servico
                  <input value={serviceForm.name} onChange={(event) => { setServiceForm((current) => ({ ...current, name: event.target.value })); setSettingsErrors((current) => ({ ...current, 'service-name': undefined })); }} placeholder="Ex.: Honorarios contabeis" />
                  {settingsErrors['service-name'] ? <span className="field-error">● {settingsErrors['service-name']}</span> : null}
                </label>
                <label className={settingsErrors['service-national-code'] ? 'is-invalid' : ''} data-field="service-national-code">Codigo nacional
                  <input value={serviceForm.nationalTaxCode} onChange={(event) => { setServiceForm((current) => ({ ...current, nationalTaxCode: event.target.value })); setSettingsErrors((current) => ({ ...current, 'service-national-code': undefined })); }} placeholder="Ex.: 1701" />
                  {settingsErrors['service-national-code'] ? <span className="field-error">● {settingsErrors['service-national-code']}</span> : null}
                </label>
                <label>Codigo municipal
                  <input value={serviceForm.municipalServiceCode} onChange={(event) => setServiceForm((current) => ({ ...current, municipalServiceCode: event.target.value }))} placeholder="Opcional" />
                </label>
                <label className={settingsErrors['service-iss-rate'] ? 'is-invalid' : ''} data-field="service-iss-rate">Aliquota ISS
                  <input value={serviceForm.issRate} onChange={(event) => { setServiceForm((current) => ({ ...current, issRate: formatDecimalInput(event.target.value) })); setSettingsErrors((current) => ({ ...current, 'service-iss-rate': undefined })); }} placeholder="Ex.: 2,00" />
                  {settingsErrors['service-iss-rate'] ? <span className="field-error">● {settingsErrors['service-iss-rate']}</span> : null}
                </label>
                <label className="nfse-service-field--wide">Descricao
                  <input value={serviceForm.description} onChange={(event) => setServiceForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descricao usada na nota" />
                </label>
                <button className="companies-button companies-button--primary" type="submit">Adicionar</button>
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
                    <option value="NONE">Nao sei informar</option>
                  </select>
                </label>
                <label>Regime especial
                  <input value={settings?.specialTaxRegime || ''} onChange={(event) => updateSetting('specialTaxRegime', event.target.value)} placeholder="Opcional" />
                </label>
              </div>
              <div className="nfse-settings-clean__checks">
                <label><input type="checkbox" checked={Boolean(settings?.isSimpleNational)} onChange={(event) => updateSetting('isSimpleNational', event.target.checked)} /> Simples Nacional</label>
                <label><input type="checkbox" checked={Boolean(settings?.hasFiscalIncentive)} onChange={(event) => updateSetting('hasFiscalIncentive', event.target.checked)} /> Incentivo fiscal</label>
                <label><input type="checkbox" checked={Boolean(settings?.defaultIssWithheld)} onChange={(event) => updateSetting('defaultIssWithheld', event.target.checked)} /> Reter ISS</label>
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
                  <input value={settings?.apiBaseUrl || ''} onChange={(event) => updateSetting('apiBaseUrl', event.target.value)} placeholder="URL padrao do ambiente" />
                </label>
                <label>Versao da API
                  <input value={settings?.apiVersion || ''} onChange={(event) => updateSetting('apiVersion', event.target.value)} placeholder="Opcional" />
                </label>
                <label>Natureza padrao
                  <input value={settings?.defaultOperationNature || ''} onChange={(event) => updateSetting('defaultOperationNature', event.target.value)} placeholder="Tributacao no municipio" />
                </label>
                <label>Serie/RPS padrao
                  <input value={settings?.defaultRpsSeries || ''} onChange={(event) => updateSetting('defaultRpsSeries', event.target.value)} placeholder="Opcional" />
                </label>
              </div>
            </details>
          </section>
        </div>
      </div>

      <div className="nfse-settings-footer">
        <span>Obrigatorio para a API: municipio IBGE, certificado valido e dados do servico na DPS. O restante e padrao operacional do sistema.</span>
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
  const [nfseModal, setNfseModal] = useState<'issue' | 'taker' | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<NfseServiceItem[]>([]);
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
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [takerForm, setTakerForm] = useState<TakerForm>(emptyTakerForm);
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

  async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem('nfse_access_token');
    if (!token) {
      router.replace('/login');
      throw new Error('Sessao expirada.');
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
    if (!response.ok) throw new Error(data?.message || 'Nao foi possivel concluir a solicitacao.');
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

  async function loadInvoices(nextPage = invoicePage, nextPageSize = invoicePageSize) {
    if (!activeCompanyId) return;
    const paramsQuery = new URLSearchParams();
    paramsQuery.set('page', String(nextPage));
    paramsQuery.set('pageSize', String(nextPageSize));
    if (invoiceSearch.trim()) paramsQuery.set('search', invoiceSearch.trim());
    if (invoiceStatus) paramsQuery.set('status', invoiceStatus);
    if (invoiceStartDate) paramsQuery.set('startDate', invoiceStartDate);
    if (invoiceEndDate) paramsQuery.set('endDate', invoiceEndDate);
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
        setError(err instanceof Error ? err.message : 'Nao foi possivel carregar as empresas.');
      } finally {
        setIsLoading(false);
      }
    }

    void loadCompanies();
  }, [params.companyId, router]);

  useEffect(() => {
    async function loadSectionData() {
      try {
        if (activeSection === 'nfse-takers' || activeSection === 'nfse-issue') await loadCustomers();
        if (activeSection === 'nfse-issue' || activeSection === 'settings' || activeSection === 'nfse-params') await loadServices();
        if (activeSection === 'nfse-list') await loadInvoices(1, invoicePageSize);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Nao foi possivel carregar os dados do modulo.');
      }
    }
    if (!isLoading && activeCompanyId) void loadSectionData();
  }, [activeSection, activeCompanyId, isLoading]);

  function handleCompanyChange(companyId: string) {
    setActiveCompanyId(companyId);
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
    router.push(pathForSection(activeCompanyId, section));
  }

  function openIssueModal() {
    const defaultService = services.find((service) => service.isDefault) || services[0];
    const defaultIbge = activeCompany?.city && activeCompany?.state ? `${activeCompany.city}/${activeCompany.state}` : '';
    setInvoiceForm({
      ...emptyInvoiceForm,
      serviceId: defaultService?.id || '',
      serviceDescription: defaultService?.description || defaultService?.name || '',
      nationalTaxCode: defaultService?.nationalTaxCode || '',
      municipalServiceCode: defaultService?.municipalServiceCode || '',
      issRate: defaultService?.issRate ? String(defaultService.issRate) : '',
    });
    setIssueMunicipalitySearch(defaultIbge);
    setIssueMunicipalitySuggestions([]);
    setModalFieldErrors({});
    setModalError('');
    setModalSuccess('');
    setNfseModal('issue');
  }

  function openTakerModal(customer?: Customer) {
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
    if (!onlyDigits(invoiceForm.municipalIbgeCode) || onlyDigits(invoiceForm.municipalIbgeCode).length !== 7) errors.municipalIbgeCode = 'Selecione o municipio para preencher o codigo IBGE com 7 digitos.';
    if (!isPositiveDecimal(invoiceForm.amount)) errors.amount = 'Informe o valor do servico em formato monetario valido.';
    if (!isValidDecimal(invoiceForm.issRate)) errors.issRate = 'Aliquota ISS invalida. Use somente numeros e virgula.';
    if (!invoiceForm.serviceDescription.trim()) errors.serviceDescription = 'Informe a discriminacao do servico.';
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
      setModalFieldErrors((current) => ({ ...current, document: err instanceof Error ? err.message : 'Nao foi possivel consultar o CNPJ.' }));
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
        setModalFieldErrors((current) => ({ ...current, zipCode: 'CEP nao encontrado.' }));
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
      setModalSuccess('Endereco preenchido automaticamente pelo CEP. Confira antes de salvar.');
    } catch {
      setModalFieldErrors((current) => ({ ...current, zipCode: 'Nao foi possivel buscar o CEP agora.' }));
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
      await requestApi<Customer>(`/companies/${activeCompanyId}/nfse/customers`, {
        method: 'POST',
        body: JSON.stringify({
          ...takerForm,
          document,
          foreignDocument: isForeignDocument ? document : '',
          isForeign: isForeignDocument,
          phone: onlyDigits(takerForm.phone) || takerForm.phone,
          zipCode: onlyDigits(takerForm.zipCode),
        }),
      });
      setModalSuccess('Tomador cadastrado com sucesso.');
      setTakerForm(emptyTakerForm);
      await loadCustomers();
      setNfseModal(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Nao foi possivel salvar o tomador.');
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
    try {
      const created = await requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices`, {
        method: 'POST',
        body: JSON.stringify({ ...invoiceForm, amount: invoiceForm.amount.replace(',', '.'), issRate: invoiceForm.issRate.replace(',', '.') }),
      });
      await requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices/${created.id}/transmit`, { method: 'POST' });
      setModalSuccess('NFS-e enviada para transmissao.');
      setNfseModal(null);
      await loadInvoices(1, invoicePageSize);
      router.push(pathForSection(activeCompanyId, 'nfse-list'));
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Nao foi possivel transmitir a NFS-e.');
      scrollToField('modal-footer');
    } finally {
      setIsModalSaving(false);
    }
  }

  async function transmitExistingInvoice(invoiceId: string) {
    try {
      await requestApi<NfseInvoice>(`/companies/${activeCompanyId}/nfse/invoices/${invoiceId}/transmit`, { method: 'POST' });
      setInvoiceMessage('NFS-e enviada para transmissao.');
      setInvoiceMessageTone('success');
      await loadInvoices(invoicePage, invoicePageSize);
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Nao foi possivel transmitir a NFS-e.');
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
      setInvoiceMessage(err instanceof Error ? err.message : 'Nao foi possivel consultar a NFS-e.');
      setInvoiceMessageTone('error');
    }
  }

  async function showStoredFile(invoiceId: string, kind: 'xml' | 'pdf') {
    try {
      const file = await requestApi<StoredFile>(`/companies/${activeCompanyId}/nfse/invoices/${invoiceId}/${kind}`);
      setInvoiceMessage(`${file.kind} registrado: ${file.fileName} (${file.path}).`);
      setInvoiceMessageTone('success');
    } catch (err) {
      setInvoiceMessage(err instanceof Error ? err.message : 'Arquivo ainda nao disponivel.');
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
      const customerName = invoice.customer?.name || 'Tomador nao informado';
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
              <p>Dados iniciais da DPS/RPS para transmissao a API nacional de NFS-e.</p>
            </div>
            <form className="nfse-form" onSubmit={saveAndTransmitInvoice} noValidate>
              <label className={modalFieldErrors.customerId ? 'is-invalid' : ''} data-field="customerId">Tomador
                <select value={invoiceForm.customerId} onChange={(event) => updateInvoice('customerId', event.target.value)} required>
                  <option value="">Selecione o tomador...</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
                {modalFieldErrors.customerId ? <span className="field-error">● {modalFieldErrors.customerId}</span> : null}
              </label>
              <label>Servico
                <select value={invoiceForm.serviceId} onChange={(event) => handleServiceChange(event.target.value)}>
                  <option value="">Selecione o servico...</option>
                  {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
              </label>
              <label>Data de competencia
                <input type="date" value={invoiceForm.competenceDate} onChange={(event) => updateInvoice('competenceDate', event.target.value)} />
              </label>
              <label className={`nfse-city-combobox-field ${modalFieldErrors.municipalIbgeCode ? 'is-invalid' : ''}`} data-field="municipalIbgeCode">Municipio de incidencia
                <div className="nfse-city-combobox">
                  <input value={issueMunicipalitySearch} onChange={(event) => void searchIssueMunicipalities(event.target.value)} placeholder="Digite o municipio" autoComplete="off" />
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
                <small>Codigo IBGE: {invoiceForm.municipalIbgeCode || 'selecione o municipio'}</small>
                {modalFieldErrors.municipalIbgeCode ? <span className="field-error">● {modalFieldErrors.municipalIbgeCode}</span> : null}
              </label>
              <label>Codigo de tributacao nacional
                <input value={invoiceForm.nationalTaxCode} onChange={(event) => updateInvoice('nationalTaxCode', event.target.value)} placeholder="Ex.: 01.01.01" />
              </label>
              <label>Codigo do servico municipal
                <input value={invoiceForm.municipalServiceCode} onChange={(event) => updateInvoice('municipalServiceCode', event.target.value)} placeholder="Item da lista municipal" />
              </label>
              <label>Natureza da operacao
                <input value={invoiceForm.operationNature} onChange={(event) => updateInvoice('operationNature', event.target.value)} />
              </label>
              <label className={modalFieldErrors.amount ? 'is-invalid' : ''} data-field="amount">Valor do servico
                <input value={invoiceForm.amount} onChange={(event) => updateInvoice('amount', formatDecimalInput(event.target.value))} placeholder="0,00" required inputMode="decimal" />
                {modalFieldErrors.amount ? <span className="field-error">● {modalFieldErrors.amount}</span> : null}
              </label>
              <label className={modalFieldErrors.issRate ? 'is-invalid' : ''} data-field="issRate">Aliquota ISS
                <input value={invoiceForm.issRate} onChange={(event) => updateInvoice('issRate', formatDecimalInput(event.target.value, 4))} placeholder="0,00%" inputMode="decimal" />
                {modalFieldErrors.issRate ? <span className="field-error">● {modalFieldErrors.issRate}</span> : null}
              </label>
              <label>Retencao ISS
                <select value={invoiceForm.issWithheld ? 'true' : 'false'} onChange={(event) => updateInvoice('issWithheld', event.target.value === 'true')}>
                  <option value="false">Nao</option>
                  <option value="true">Sim</option>
                </select>
              </label>
              <label className={`is-half ${modalFieldErrors.serviceDescription ? 'is-invalid' : ''}`} data-field="serviceDescription">Discriminacao do servico
                <textarea value={invoiceForm.serviceDescription} onChange={(event) => updateInvoice('serviceDescription', event.target.value)} placeholder="Descreva o servico prestado..." required />
                {modalFieldErrors.serviceDescription ? <span className="field-error">● {modalFieldErrors.serviceDescription}</span> : null}
              </label>
              <label className="is-half">Informacoes complementares
                <textarea value={invoiceForm.additionalInformation} onChange={(event) => updateInvoice('additionalInformation', event.target.value)} placeholder="Observacoes para a nota fiscal..." />
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
              <h2>Cadastrar tomador</h2>
              <p>Cadastro base para emissao das notas fiscais de servico.</p>
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
              <label className={modalFieldErrors.name ? 'is-invalid' : ''} data-field="name">Razao social / Nome
                <input value={takerForm.name} onChange={(event) => updateTaker('name', event.target.value)} placeholder="Nome do tomador" required />
                {modalFieldErrors.name ? <span className="field-error">● {modalFieldErrors.name}</span> : null}
              </label>
              <label className={modalFieldErrors.email ? 'is-invalid' : ''} data-field="email">E-mail
                <input type="email" value={takerForm.email} onChange={(event) => updateTaker('email', event.target.value)} placeholder="email@tomador.com.br" />
                {modalFieldErrors.email ? <span className="field-error">● {modalFieldErrors.email}</span> : null}
              </label>
              <label>Inscricao Municipal
                <input value={takerForm.municipalRegistration} onChange={(event) => updateTaker('municipalRegistration', event.target.value)} placeholder="Opcional" />
              </label>
              <label>Telefone
                <input value={formatPhone(takerForm.phone)} onChange={(event) => updateTaker('phone', onlyDigits(event.target.value))} placeholder="(00) 00000-0000" inputMode="tel" />
              </label>
              <label className="is-half">Endereco
                <input value={takerForm.address} onChange={(event) => updateTaker('address', event.target.value)} placeholder="Logradouro" />
              </label>
              <label>Numero
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
                <button className="companies-button companies-button--primary" type="submit" disabled={isModalSaving}>{isModalSaving ? 'Salvando...' : 'Salvar tomador'}</button>
              </div>
            </form>
          </>
        ) : null}
      </section>
    </div>
  ) : null;

  return (
    <main className="company-module-page">
      <div className={`company-module-shell ${isCollapsed ? 'is-collapsed' : ''}`}>
        <aside className="company-sidebar" aria-label="Menu da empresa">
          <div className="company-sidebar__brand">
            <img className="company-sidebar__logo" src="/zip-logo.png" alt="Zip" onError={(event) => { event.currentTarget.src = '/zip-logo.svg'; }} />
            <button className="company-sidebar__toggle" type="button" onClick={() => setIsCollapsed((current) => !current)} aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}>
              <SidebarToggleIcon collapsed={isCollapsed} />
            </button>
          </div>
          <nav className="company-sidebar__nav">
            <div className="company-sidebar__section">
              <button className={`company-sidebar__item ${activeSection === 'home' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('home')}>
                <span className="company-sidebar__icon"><HomeIcon /></span><span className="company-sidebar__label">Home</span>
              </button>
            </div>
            <div className={`company-sidebar__group ${isNfseOpen ? 'is-open' : ''}`}>
              <button className="company-sidebar__item company-sidebar__group-toggle" type="button" onClick={() => setIsNfseOpen((current) => !current)}>
                <span className="company-sidebar__group-title"><span className="company-sidebar__icon"><NoteIcon /></span><span className="company-sidebar__label">NFS-e</span></span>
                <span className="company-sidebar__group-arrow">&gt;</span>
              </button>
              {isNfseOpen ? (
                <div className="company-sidebar__submenu">
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-issue' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('nfse-issue')}>Emissao</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-takers' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('nfse-takers')}>Cadastro de Tomadores</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-list' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('nfse-list')}>Notas Fiscais</button>
                  <button className={`company-sidebar__item company-sidebar__subitem ${activeSection === 'nfse-params' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('nfse-params')}>Parametrizacao</button>
                </div>
              ) : null}
            </div>
          </nav>
          <div className="company-sidebar__footer">
            <button className={`company-sidebar__item company-sidebar__item--settings ${activeSection === 'settings' || activeSection === 'nfse-params' ? 'is-active' : ''}`} type="button" onClick={() => goToSection('settings')} title="Configuracoes de emissao de notas fiscais">
              <span className="company-sidebar__icon"><SettingsIcon /></span><span className="company-sidebar__label">Configuracoes</span>
            </button>
          </div>
        </aside>

        <section className="company-module-main">
          <header className="company-module-topbar">
            <div className="company-switcher">
              <label htmlFor="company-switcher">Empresa em acesso</label>
              <select id="company-switcher" value={activeCompanyId} onChange={(event) => handleCompanyChange(event.target.value)} disabled={isLoading || companies.length === 0}>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}
              </select>
            </div>
            <div className="company-module-user">
              <span>{user?.name || 'Usuario'}</span>
              <button type="button" onClick={() => router.push('/dashboard')}>Empresas</button>
              <button type="button" onClick={handleLogout}>Sair</button>
            </div>
          </header>

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
                  <article className="company-module-card"><strong>Emissao NFS-e</strong><span>Crie DPS, selecione tomador e servico, e acompanhe a transmissao.</span></article>
                  <article className="company-module-card"><strong>Regime tributario</strong><span>{activeCompany.taxRegime || 'Nao informado'}</span></article>
                  <article className="company-module-card"><strong>Parametrizacao</strong><span>Certificado, municipio, regime e servicos padroes em um fluxo React unico.</span></article>
                </section>
              </>
            ) : null}

            {!isLoading && activeCompany && activeSection === 'nfse-issue' ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>NFS-e</p><h1>Emissao de NFS-e</h1><span>Preencha a DPS e transmita para a API nacional.</span></section>
                <div className="nfse-panel">
                  <div className="nfse-panel__header">
                    <div><h2>Nova emissao</h2><p>Fluxo integrado aos tomadores, servicos e parametros cadastrados para esta empresa.</p></div>
                    <button className="companies-button companies-button--primary" type="button" onClick={openIssueModal}>+ Emitir NFS-e</button>
                  </div>
                  <div className="nfse-status-grid">
                    <span><strong>Tomadores</strong>{customers.length}</span>
                    <span><strong>Servicos</strong>{services.length}</span>
                    <span><strong>Servico padrao</strong>{services.find((service) => service.isDefault)?.name || 'Nao definido'}</span>
                  </div>
                </div>
              </section>
            ) : null}

            {!isLoading && activeCompany && activeSection === 'nfse-takers' ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>NFS-e</p><h1>Cadastro de Tomadores</h1><span>Clientes que poderao ser selecionados na emissao.</span></section>
                <div className="nfse-panel">
                  <div className="nfse-panel__header">
                    <div><h2>Tomadores cadastrados</h2><p>Lista carregada pela API, no mesmo padrao React da tela inicial.</p></div>
                    <button className="companies-button companies-button--primary" type="button" onClick={() => openTakerModal()}>+ Novo tomador</button>
                  </div>
                  <div className="nfse-table-wrap">
                    <table className="nfse-table">
                      <thead><tr><th>Nome</th><th>Documento</th><th>E-mail</th><th>Cidade/UF</th><th>Acoes</th></tr></thead>
                      <tbody>
                        {customers.length ? customers.map((customer) => (
                          <tr key={customer.id}>
                            <td>{customer.name}</td>
                            <td>{formatDocument(customer.document)}</td>
                            <td>{customer.email || '-'}</td>
                            <td>{customer.city || '-'}/{customer.state || '-'}</td>
                            <td><div className="nfse-actions"><button className="companies-button companies-button--ghost" type="button" onClick={() => openTakerModal(customer)}>Usar como base</button></div></td>
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
                <section className="company-module-hero"><p>NFS-e</p><h1>Notas Fiscais</h1><span>Consulta paginada com acoes, selecao e exportacao em lote.</span></section>
                <div className="nfse-panel">
                  <form className="nfse-search-row nfse-search-row--with-period" onSubmit={(event) => { event.preventDefault(); void loadInvoices(1, invoicePageSize); }}>
                    <input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Buscar por tomador, numero, chave de acesso, valor ou status..." />
                    <select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)}>
                      <option value="">Todos os status</option>
                      <option value="DRAFT">Rascunho</option>
                      <option value="PROCESSING">Processando</option>
                      <option value="AUTHORIZED">Autorizada</option>
                      <option value="REJECTED">Rejeitada</option>
                      <option value="CANCELLED">Cancelada</option>
                    </select>
                    <input type="date" aria-label="Data inicial" value={invoiceStartDate} onChange={(event) => setInvoiceStartDate(event.target.value)} />
                    <input type="date" aria-label="Data final" value={invoiceEndDate} onChange={(event) => setInvoiceEndDate(event.target.value)} />
                    <button className="companies-button companies-button--primary" type="submit">Buscar</button>
                  </form>
                  {invoiceMessage ? <p className="nfse-settings-clean__message" data-tone={invoiceMessageTone}>{invoiceMessage}</p> : null}
                  <div className="nfse-selection-summary">
                    <span>{selectedInvoices.length ? `${selectedInvoices.length} nota(s) selecionada(s)` : `${invoiceTotal} nota(s) encontrada(s).`}</span>
                    <div className="nfse-bulk-download-actions">
                      <button className="companies-button companies-button--ghost companies-button--mini" type="button" disabled={!selectedInvoices.length} onClick={() => downloadSelected('pdf')}>Baixar PDFs .zip</button>
                      <button className="companies-button companies-button--ghost companies-button--mini" type="button" disabled={!selectedInvoices.length} onClick={() => downloadSelected('xml')}>Baixar XMLs .zip</button>
                      {selectedInvoices.length ? <button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={() => setSelectedInvoiceIds([])}>Limpar selecao</button> : null}
                    </div>
                  </div>
                  <div className="nfse-table-wrap">
                    <table className="nfse-table">
                      <thead><tr><th className="nfse-select-cell"><input type="checkbox" aria-label="Selecionar notas da pagina" checked={allInvoicesSelected} onChange={toggleAllInvoices} /></th><th>Numero</th><th>Tomador</th><th>Emissao</th><th>Valor</th><th>Status</th><th>Arquivos</th></tr></thead>
                      <tbody>
                        {invoices.length ? invoices.map((invoice) => (
                          <tr key={invoice.id} className={selectedInvoiceIds.includes(invoice.id) ? 'is-selected' : ''}>
                            <td className="nfse-select-cell"><input type="checkbox" aria-label={`Selecionar nota ${invoice.number || invoice.id}`} checked={selectedInvoiceIds.includes(invoice.id)} onChange={() => toggleInvoiceSelection(invoice.id)} /></td>
                            <td><div className="nfse-invoice-number"><strong>{invoice.number || invoice.id.slice(0, 8)}</strong><small className="nfse-access-key">Chave: {invoice.accessKey || '-'}</small></div></td>
                            <td>{invoice.customer?.name || '-'}</td>
                            <td>{formatDate(invoice.issuedAt || invoice.createdAt)}</td>
                            <td>{formatCurrency(invoice.amount)}</td>
                            <td><span className="nfse-chip">{invoiceStatusLabel(invoice.status)}</span></td>
                            <td><div className="nfse-actions"><button className="companies-button companies-button--ghost" type="button" onClick={() => void showStoredFile(invoice.id, 'pdf')}>PDF</button><button className="companies-button companies-button--ghost" type="button" onClick={() => void showStoredFile(invoice.id, 'xml')}>XML</button><button className="companies-button companies-button--ghost" type="button" onClick={() => void transmitExistingInvoice(invoice.id)}>Transmitir</button><button className="companies-button companies-button--ghost" type="button" onClick={() => void syncInvoice(invoice.id)}>Sincronizar</button></div></td>
                          </tr>
                        )) : <tr><td colSpan={7} className="nfse-empty-row">Nenhuma nota encontrada para os filtros informados.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="nfse-pagination">
                    <label className="nfse-page-size">Notas por pagina
                      <select value={invoicePageSize} onChange={(event: ChangeEvent<HTMLSelectElement>) => void loadInvoices(1, Number(event.target.value))}>
                        {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <button className="companies-button companies-button--ghost" type="button" disabled={invoicePage <= 1} onClick={() => void loadInvoices(invoicePage - 1, invoicePageSize)}>Anterior</button>
                    <span>Pagina {invoicePage} de {invoiceTotalPages}</span>
                    <button className="companies-button companies-button--ghost" type="button" disabled={invoicePage >= invoiceTotalPages} onClick={() => void loadInvoices(invoicePage + 1, invoicePageSize)}>Proxima</button>
                  </div>
                </div>
              </section>
            ) : null}

            {!isLoading && activeCompany && (activeSection === 'settings' || activeSection === 'nfse-params') ? (
              <section className="nfse-section">
                <section className="company-module-hero"><p>Parametrizacao</p><h1>Configuracoes de emissao de NFS-e</h1><span>{activeCompany.legalName} - {formatCnpj(activeCompany.cnpj)}</span></section>
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
