'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BRAZIL_STATES, CITY_OPTIONS } from '../address-options';
import { ClientType, formatCep, formatCnpj, formatDocument, isValidCpf, onlyDigits } from '../document-utils';
import { ClientTypeIcon } from '../company-form-helpers';
import '../companies.css';

type AccountRole = 'ADMIN' | 'USER';
type CompanyRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'ADMIN_VIEW';
type CompanyUserStatus = 'ACTIVE' | 'BLOCKED' | 'DISABLED';
type CompanyStatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';
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
  | 'accounting.processes.delete'
  | 'control.overview.view'
  | 'control.accounting.view'
  | 'control.tax.view'
  | 'control.payroll.view';
type AdminModal = 'invite' | 'create' | 'companyUsers' | 'users' | null;
type UserStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

type StoredUser = { id: string; name: string; email: string; accountRole: AccountRole };
type Company = { id: string; legalName: string; tradeName?: string | null; cnpj: string; municipalRegistration?: string | null; city: string; state: string; country?: string | null; zipCode?: string | null; address?: string | null; number?: string | null; complement?: string | null; neighborhood?: string | null; email?: string | null; phone?: string | null; registrationStatus?: string | null; mainActivity?: string | null; legalNature?: string | null; taxRegime: string; serviceCodeDefault?: string | null; isActive?: boolean; role: CompanyRole; permissions?: CompanyPermission[] };
type CompanyAccessUser = { id: string; name: string; email: string; role: CompanyRole; permissions?: CompanyPermission[]; status: CompanyUserStatus; isActive: boolean; accountRole: AccountRole; canDelete?: boolean; linkedInvoices?: number };
type UserCompanyAccess = { id: string; legalName: string; tradeName?: string | null; cnpj: string; city: string; state: string; isActive: boolean; role: CompanyRole; permissions?: CompanyPermission[]; status: CompanyUserStatus };
type AdminUser = { id: string; name: string; email: string; accountRole: AccountRole; isActive: boolean; companiesCount: number; companies: UserCompanyAccess[] };
type InviteUserForm = { companyIds: string[]; name: string; email: string; role: 'OPERATOR' | 'VIEWER' | 'ADMIN'; permissions: CompanyPermission[] };
type EditUserForm = { name: string; email: string; accountRole: AccountRole; role: 'OPERATOR' | 'VIEWER' | 'ADMIN'; companyIds: string[]; permissions: CompanyPermission[]; companyPermissions: Record<string, CompanyPermission[]> };
type CreateCompanyForm = { document: string; legalName: string; tradeName: string; municipalRegistration: string; city: string; state: string; country: string; zipCode: string; address: string; number: string; complement: string; neighborhood: string; email: string; phone: string; mobile: string; contactPerson: string; website: string; registrationStatus: string; mainActivity: string; legalNature: string; taxRegime: string; serviceCodeDefault: string };

const emptyCompanyForm: CreateCompanyForm = { document: '', legalName: '', tradeName: '', municipalRegistration: '', city: '', state: '', country: 'Brasil', zipCode: '', address: '', number: '', complement: '', neighborhood: '', email: '', phone: '', mobile: '', contactPerson: '', website: '', registrationStatus: '', mainActivity: '', legalNature: '', taxRegime: 'Não informado', serviceCodeDefault: '' };
type PermissionAction = 'view' | 'edit' | 'delete';
type PermissionCell = { action: PermissionAction; permissions: CompanyPermission[] };
type PermissionRow = { title: string; cells: PermissionCell[] };
type PermissionModule = { title: string; rows: PermissionRow[] };

const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = { view: 'Visualizar', edit: 'Editar', delete: 'Excluir' };
const COMPANY_PERMISSION_MODULES: PermissionModule[] = [
  {
    title: 'Módulo NFS-e',
    rows: [
      {
        title: 'Notas Fiscais',
        cells: [
          { action: 'view', permissions: ['nfse.invoices.view'] },
          { action: 'edit', permissions: ['nfse.invoices.view', 'nfse.invoices.create', 'nfse.invoices.edit', 'nfse.invoices.transmit', 'nfse.invoices.sync'] },
          { action: 'delete', permissions: ['nfse.invoices.view', 'nfse.invoices.delete'] },
        ],
      },
      {
        title: 'Tomadores',
        cells: [
          { action: 'view', permissions: ['nfse.takers.view'] },
          { action: 'edit', permissions: ['nfse.takers.view', 'nfse.takers.create', 'nfse.takers.edit'] },
          { action: 'delete', permissions: ['nfse.takers.view', 'nfse.takers.delete'] },
        ],
      },
      {
        title: 'Parametrização',
        cells: [
          { action: 'view', permissions: ['nfse.settings.view'] },
          { action: 'edit', permissions: ['nfse.settings.view', 'nfse.settings.edit'] },
          { action: 'delete', permissions: ['nfse.settings.view', 'nfse.settings.delete'] },
        ],
      },
    ],
  },
  {
    title: 'Módulo Contabilidade',
    rows: [
      {
        title: 'Documentos',
        cells: [
          { action: 'view', permissions: ['accounting.documents.view'] },
          { action: 'edit', permissions: ['accounting.documents.view', 'accounting.documents.edit'] },
          { action: 'delete', permissions: ['accounting.documents.view', 'accounting.documents.delete'] },
        ],
      },
      {
        title: 'Impostos',
        cells: [
          { action: 'view', permissions: ['accounting.taxes.view'] },
          { action: 'edit', permissions: ['accounting.taxes.view', 'accounting.taxes.edit'] },
          { action: 'delete', permissions: ['accounting.taxes.view', 'accounting.taxes.delete'] },
        ],
      },
      {
        title: 'Solicitações',
        cells: [
          { action: 'view', permissions: ['accounting.requests.view'] },
          { action: 'edit', permissions: ['accounting.requests.view', 'accounting.requests.edit'] },
          { action: 'delete', permissions: ['accounting.requests.view', 'accounting.requests.delete'] },
        ],
      },
      {
        title: 'Processos',
        cells: [
          { action: 'view', permissions: ['accounting.processes.view'] },
          { action: 'edit', permissions: ['accounting.processes.view', 'accounting.processes.edit'] },
          { action: 'delete', permissions: ['accounting.processes.view', 'accounting.processes.delete'] },
        ],
      },
    ],
  },
  {
    title: 'Módulo Controle',
    rows: [
      {
        title: 'Visão geral',
        cells: [
          { action: 'view', permissions: ['control.overview.view'] },
        ],
      },
      {
        title: 'Contábil',
        cells: [
          { action: 'view', permissions: ['control.accounting.view'] },
        ],
      },
      {
        title: 'Fiscal',
        cells: [
          { action: 'view', permissions: ['control.tax.view'] },
        ],
      },
      {
        title: 'Departamento pessoal',
        cells: [
          { action: 'view', permissions: ['control.payroll.view'] },
        ],
      },
    ],
  },
];
const uniquePermissions = (permissions: CompanyPermission[]) => Array.from(new Set(permissions));
const rowPermissions = (row: PermissionRow) => uniquePermissions(row.cells.flatMap((cell) => cell.permissions));
const modulePermissions = (module: PermissionModule) => uniquePermissions(module.rows.flatMap(rowPermissions));
const ALL_COMPANY_PERMISSIONS = uniquePermissions(COMPANY_PERMISSION_MODULES.flatMap(modulePermissions));
const DEFAULT_COMPANY_PERMISSIONS: CompanyPermission[] = [
  'nfse.invoices.view',
  'nfse.invoices.create',
  'nfse.invoices.edit',
  'nfse.invoices.transmit',
  'nfse.invoices.sync',
  'nfse.takers.view',
  'nfse.takers.create',
  'nfse.takers.edit',
  'nfse.settings.view',
  'accounting.documents.view',
  'accounting.taxes.view',
  'accounting.requests.view',
  'accounting.processes.view',
];

const emptyInviteForm: InviteUserForm = { companyIds: [], name: '', email: '', role: 'OPERATOR', permissions: [] };
const emptyEditUserForm: EditUserForm = { name: '', email: '', accountRole: 'USER', role: 'OPERATOR', companyIds: [], permissions: DEFAULT_COMPANY_PERMISSIONS, companyPermissions: {} };

function roleLabel(role: string) { return ({ OWNER: 'Responsável', ADMIN: 'Administrador', OPERATOR: 'Operador', VIEWER: 'Visualizador', ADMIN_VIEW: 'Administrador' } as Record<string, string>)[role] || role; }
function statusLabel(status: string) { return ({ ACTIVE: 'Ativo', BLOCKED: 'Bloqueado', DISABLED: 'Desativado' } as Record<string, string>)[status] || status; }
function taxRegimeLabel(value?: string | null) {
  const labels: Record<string, string> = { NONE: 'Não informado', MEI: 'MEI', SIMPLE_NATIONAL: 'Simples Nacional', NORMAL: 'Lucro Presumido / Normal', SPECIAL: 'Regime especial' };
  return labels[String(value || '').trim().toUpperCase()] || value || 'Não informado';
}
function companyUserDisplayStatus(user: CompanyAccessUser) { return user.isActive ? 'ACTIVE' : 'DISABLED'; }
function getPrimaryCompanyRole(companies: UserCompanyAccess[]): EditUserForm['role'] { const role = companies.find((item) => item.role !== 'OWNER')?.role || companies[0]?.role || 'OPERATOR'; return role === 'VIEWER' || role === 'ADMIN' ? role : 'OPERATOR'; }
function getPrimaryCompanyPermissions(companies: UserCompanyAccess[]) {
  const configured = companies.find((item) => Array.isArray(item.permissions));
  return configured?.permissions || DEFAULT_COMPANY_PERMISSIONS;
}
function getCompanyPermissionsMap(companies: UserCompanyAccess[]) {
  return Object.fromEntries(companies.map((company) => [company.id, Array.isArray(company.permissions) ? company.permissions : DEFAULT_COMPANY_PERMISSIONS])) as Record<string, CompanyPermission[]>;
}
function hasSameIds(left: string[], right: string[]) { return left.length === right.length && left.every((id) => right.includes(id)); }
function companyToForm(company: Company): CreateCompanyForm { return { document: company.cnpj || '', legalName: company.legalName || '', tradeName: company.tradeName || '', municipalRegistration: company.municipalRegistration || '', city: company.city || '', state: company.state || '', country: company.country || 'Brasil', zipCode: company.zipCode || '', address: company.address || '', number: company.number || '', complement: company.complement || '', neighborhood: company.neighborhood || '', email: company.email || '', phone: company.phone || '', mobile: '', contactPerson: '', website: '', registrationStatus: company.registrationStatus || '', mainActivity: company.mainActivity || '', legalNature: company.legalNature || '', taxRegime: company.taxRegime || 'Não informado', serviceCodeDefault: company.serviceCodeDefault || '' }; }
function filterCompanyOptions(companies: Company[], term: string) {
  const key = term.trim().toLowerCase();
  if (!key) return companies;
  const digits = onlyDigits(term);
  return companies.filter((company) => {
    const searchable = [company.legalName, company.tradeName || '', company.city, company.state, formatCnpj(company.cnpj)].join(' ').toLowerCase();
    return searchable.includes(key) || (digits ? onlyDigits(company.cnpj).includes(digits) : false);
  });
}

function PermissionMatrix({ value, onChange, disabled = false }: { value: CompanyPermission[]; onChange: (next: CompanyPermission[]) => void; disabled?: boolean }) {
  const [openModules, setOpenModules] = useState<Set<string>>(() => new Set());
  const selectedCount = value.length;
  function hasAll(permissions: CompanyPermission[]) {
    return permissions.every((permission) => value.includes(permission));
  }
  function toggleCell(row: PermissionRow, cell: PermissionCell) {
    const permissions = cell.action === 'view' ? rowPermissions(row) : cell.permissions;
    const allChecked = hasAll(cell.permissions);
    onChange(allChecked ? value.filter((item) => !permissions.includes(item)) : uniquePermissions([...value, ...cell.permissions]));
  }
  function toggleRow(row: PermissionRow) {
    const permissions = rowPermissions(row);
    const allChecked = hasAll(permissions);
    onChange(allChecked ? value.filter((item) => !permissions.includes(item)) : uniquePermissions([...value, ...permissions]));
  }
  function toggleModule(module: PermissionModule) {
    const permissions = modulePermissions(module);
    const allChecked = hasAll(permissions);
    onChange(allChecked ? value.filter((item) => !permissions.includes(item)) : uniquePermissions([...value, ...permissions]));
  }
  function updateOpenModule(title: string, open: boolean) {
    setOpenModules((current) => {
      const next = new Set(current);
      if (open) next.add(title);
      else next.delete(title);
      return next;
    });
  }
  return (
    <fieldset className={`permissions-matrix permissions-matrix--modules ${disabled ? 'is-disabled' : ''}`}>
      <legend>Acessos por menu</legend>
      <div className="permissions-matrix__summary">
        <div>
          <strong>{selectedCount}</strong>
          <span>permissões liberadas</span>
        </div>
        <div className="permissions-matrix__actions">
          <button type="button" disabled={disabled} onClick={() => onChange(ALL_COMPANY_PERMISSIONS)}>Marcar todos</button>
          <button type="button" disabled={disabled} onClick={() => onChange([])}>Limpar</button>
        </div>
      </div>
      {COMPANY_PERMISSION_MODULES.map((module, moduleIndex) => {
        const keys = modulePermissions(module);
        const allChecked = hasAll(keys);
        const groupCount = keys.filter((key) => value.includes(key)).length;
        const status = allChecked ? 'Todas permissões selecionadas' : groupCount ? `${groupCount}/${keys.length} permissões selecionadas` : 'Nenhuma permissão selecionada';
        return (
          <details className="permissions-module" key={module.title} open={openModules.has(module.title)} onToggle={(event) => updateOpenModule(module.title, event.currentTarget.open)}>
            <summary className="permissions-module__header">
              <label onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={allChecked} disabled={disabled} onChange={() => toggleModule(module)} /><span>{module.title}</span></label>
              <small>{status}</small>
            </summary>
            <div className="permissions-module__table">
              <div className="permissions-module__row permissions-module__row--head"><span>Submódulo</span><span>Visualizar</span><span>Editar</span><span>Excluir</span></div>
              {module.rows.map((row) => {
                const permissions = rowPermissions(row);
                const rowChecked = hasAll(permissions);
                return (
                  <div className="permissions-module__row" key={row.title}>
                    <label className="permissions-module__submodule"><input type="checkbox" checked={rowChecked} disabled={disabled} onChange={() => toggleRow(row)} /><span>{row.title}</span></label>
                    {(['view', 'edit', 'delete'] as PermissionAction[]).map((action) => {
                      const cell = row.cells.find((item) => item.action === action);
                      const checked = cell ? hasAll(cell.permissions) : false;
                      return (
                        <label className="permissions-module__cell" key={action} title={PERMISSION_ACTION_LABELS[action]}>
                          <input type="checkbox" checked={checked} disabled={disabled || !cell} onChange={() => cell && toggleCell(row, cell)} />
                          <span>{PERMISSION_ACTION_LABELS[action]}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </fieldset>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [companyStatusFilter, setCompanyStatusFilter] = useState<CompanyStatusFilter>('ACTIVE');
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);
  const [, setError] = useState('');
  const [, setSuccess] = useState('');
  const [, setModalError] = useState('');
  const [, setModalSuccess] = useState('');
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [cepError, setCepError] = useState('');
  const [activeModal, setActiveModal] = useState<AdminModal>(null);
  const [openMenuCompanyId, setOpenMenuCompanyId] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyUsers, setCompanyUsers] = useState<CompanyAccessUser[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null);
  const [passwordResetUserId, setPasswordResetUserId] = useState<string | null>(null);
  const [editUserForm, setEditUserForm] = useState<EditUserForm>(emptyEditUserForm);
  const [selectedPermissionCompanyId, setSelectedPermissionCompanyId] = useState('');
  const [clientType, setClientType] = useState<ClientType>('PJ');
  const [companyForm, setCompanyForm] = useState<CreateCompanyForm>(emptyCompanyForm);
  const [inviteForm, setInviteForm] = useState<InviteUserForm>(emptyInviteForm);
  const [inviteCompanySearch, setInviteCompanySearch] = useState('');
  const [editCompanySearch, setEditCompanySearch] = useState('');

  const isSystemAdmin = user?.accountRole === 'ADMIN';
  const inviteCompanies = allCompanies.length > 0 ? allCompanies : companies;
  const filteredInviteCompanies = useMemo(() => filterCompanyOptions(inviteCompanies, inviteCompanySearch), [inviteCompanies, inviteCompanySearch]);
  const filteredEditCompanies = useMemo(() => filterCompanyOptions(inviteCompanies, editCompanySearch), [inviteCompanies, editCompanySearch]);
  const visibleCompanies = useMemo(() => companies, [companies]);
  const selectedAdminUser = adminUsers.find((item) => item.id === selectedAdminUserId) || adminUsers[0] || null;
  const selectedPermissionCompany = inviteCompanies.find((company) => company.id === selectedPermissionCompanyId) || null;
  const selectedPermissionValue = selectedPermissionCompanyId ? (editUserForm.companyPermissions[selectedPermissionCompanyId] || DEFAULT_COMPANY_PERMISSIONS) : editUserForm.permissions;
  const isEditingSystemAdmin = editUserForm.accountRole === 'ADMIN';
  const cityOptions = companyForm.state ? CITY_OPTIONS[companyForm.state] || [] : [];
  const isEditingCompany = Boolean(editingCompanyId);

  function showToast(text: string, tone: 'success' | 'error' = 'success') { setToast({ text, tone }); }
  function clearModalMessages() { setModalError(''); setModalSuccess(''); setInviteLink(''); }
  function setModalSuccessMessage(message: string) { setModalError(''); setModalSuccess(message); showToast(message, 'success'); }
  function setModalErrorMessage(message: string) { setModalSuccess(''); setModalError(message); showToast(message, 'error'); }

  useEffect(() => { const token = localStorage.getItem('nfse_access_token'); const storedUser = localStorage.getItem('nfse_user'); if (!token) { router.replace('/login'); return; } if (storedUser) setUser(JSON.parse(storedUser) as StoredUser); void loadCompanies('', { updateAll: true }); }, [router]);
  useEffect(() => { const timer = window.setTimeout(() => void loadCompanies(search, { updateAll: false }), 300); return () => window.clearTimeout(timer); }, [search, companyStatusFilter]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 4200); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!openMenuCompanyId) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.company-card__menu-wrap')) return;
      setOpenMenuCompanyId(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [openMenuCompanyId]);
  useEffect(() => { if (activeModal !== 'users') return; const timer = window.setTimeout(() => void loadAdminUsers(userSearch, userStatusFilter), 250); return () => window.clearTimeout(timer); }, [userSearch, userStatusFilter, activeModal]);
  useEffect(() => { if (!selectedAdminUser) { setEditUserForm(emptyEditUserForm); setSelectedPermissionCompanyId(''); return; } const companyIds = selectedAdminUser.companies.map((company) => company.id); const companyPermissions = getCompanyPermissionsMap(selectedAdminUser.companies); setEditUserForm({ name: selectedAdminUser.name, email: selectedAdminUser.email, accountRole: selectedAdminUser.accountRole, role: getPrimaryCompanyRole(selectedAdminUser.companies), companyIds, permissions: getPrimaryCompanyPermissions(selectedAdminUser.companies), companyPermissions }); setSelectedPermissionCompanyId((current) => (current && companyIds.includes(current) ? current : companyIds[0] || '')); }, [selectedAdminUserId, adminUsers]);
  useEffect(() => { if (activeModal !== 'users' || editUserForm.accountRole !== 'ADMIN') return; const allCompanyIds = inviteCompanies.map((company) => company.id); const companyPermissions = Object.fromEntries(allCompanyIds.map((companyId) => [companyId, ALL_COMPANY_PERMISSIONS])) as Record<string, CompanyPermission[]>; setEditUserForm((current) => (current.role === 'ADMIN' && hasSameIds(current.companyIds, allCompanyIds) ? current : { ...current, role: 'ADMIN', companyIds: allCompanyIds, permissions: ALL_COMPANY_PERMISSIONS, companyPermissions })); setSelectedPermissionCompanyId(allCompanyIds[0] || ''); }, [activeModal, editUserForm.accountRole, inviteCompanies]);
  useEffect(() => { if (activeModal !== 'users') return; const disabled = editUserForm.accountRole === 'ADMIN'; const fieldset = document.querySelector<HTMLElement>('.user-company-checkboxes'); fieldset?.classList.toggle('is-disabled', disabled); const legend = fieldset?.querySelector('legend'); if (legend) legend.textContent = disabled ? 'Todas as empresas liberadas automaticamente' : 'Empresas selecionadas'; fieldset?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => { input.disabled = disabled; }); }, [activeModal, editUserForm.accountRole, editUserForm.companyIds, inviteCompanies]);

  async function requestApi(path: string, options: RequestInit = {}) { const token = localStorage.getItem('nfse_access_token'); if (!token) { router.replace('/login'); throw new Error('Sessão expirada.'); } const response = await fetch(`http://localhost:3333${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } }); const text = await response.text(); const data = text ? JSON.parse(text) : null; if (!response.ok) throw new Error(data?.message || 'Não foi possível concluir a solicitação.'); return data; }

  async function loadCompanies(searchTerm = '', options: { updateAll?: boolean } = {}) { setIsLoading(true); setError(''); try { const params = new URLSearchParams(); if (searchTerm.trim()) params.set('search', searchTerm.trim()); params.set('status', companyStatusFilter); const query = params.toString() ? `?${params.toString()}` : ''; const data = (await requestApi(`/companies${query}`)) as Company[]; setCompanies(data); if (options.updateAll || (!searchTerm.trim() && allCompanies.length === 0)) setAllCompanies(data); } catch (err) { const message = err instanceof Error ? err.message : 'Não foi possível carregar as empresas.'; setError(message); showToast(message, 'error'); } finally { setIsLoading(false); } }
  async function loadAllCompaniesForInvite() { try { setAllCompanies((await requestApi('/companies')) as Company[]); } catch (err) { const message = err instanceof Error ? err.message : 'Não foi possível carregar todas as empresas.'; activeModal ? setModalErrorMessage(message) : setError(message); } }
  async function loadAdminUsers(term = '', status = userStatusFilter) { setIsAdminUsersLoading(true); try { const params = new URLSearchParams(); if (term.trim()) params.set('search', term.trim()); if (status !== 'ALL') params.set('status', status); const query = params.toString() ? `?${params.toString()}` : ''; const data = (await requestApi(`/users${query}`)) as AdminUser[]; setAdminUsers(data); setSelectedAdminUserId((current) => (current && data.some((item) => item.id === current) ? current : data[0]?.id || null)); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível carregar usuários.'); } finally { setIsAdminUsersLoading(false); } }

  async function handleLookupCnpj() { const cnpj = onlyDigits(companyForm.document); setLookupError(''); clearModalMessages(); if (cnpj.length !== 14) { setLookupError('CNPJ inválido.'); return; } setIsLookupLoading(true); try { const data = await requestApi(`/companies/lookup/cnpj?cnpj=${cnpj}`); setCompanyForm((current) => ({ ...current, ...data, document: data.cnpj || cnpj, taxRegime: current.taxRegime || 'Não informado' })); setModalSuccessMessage('Dados cadastrais localizados. Confira as informações antes de salvar.'); } catch (err) { setLookupError(err instanceof Error ? err.message : 'Não foi possível consultar o CNPJ agora.'); } finally { setIsLookupLoading(false); } }
  async function handleLookupCep() { const cep = onlyDigits(companyForm.zipCode); setCepError(''); if (cep.length !== 8) { setCepError('CEP inválido.'); return; } setIsCepLoading(true); try { const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const data = await response.json(); if (!response.ok || data.erro) { setCepError('CEP não encontrado.'); return; } setCompanyForm((current) => ({ ...current, zipCode: cep, address: data.logradouro || current.address, complement: data.complemento || current.complement, neighborhood: data.bairro || current.neighborhood, state: data.uf || current.state, city: data.localidade || current.city, country: 'Brasil' })); setModalSuccessMessage('Endereço localizado pelo CEP. Confira as informações antes de salvar.'); } catch { setCepError('Não foi possível buscar o CEP agora.'); } finally { setIsCepLoading(false); } }
  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await loadCompanies(search); }

  async function handleSaveCompany(event: FormEvent<HTMLFormElement>) { event.preventDefault(); clearModalMessages(); setLookupError(''); if (clientType === 'PF' && !isValidCpf(companyForm.document)) { setLookupError('CPF inválido.'); return; } if (clientType === 'EXTERIOR' && !companyForm.document.trim()) { setLookupError('Documento obrigatório.'); return; } if (clientType !== 'PJ') { setModalErrorMessage('Cadastro definitivo de Pessoa Física e Exterior será conectado ao backend na próxima etapa.'); return; } if (!companyForm.legalName || !companyForm.city || !companyForm.state) { setModalErrorMessage('Busque o CNPJ ou preencha razão social, cidade e UF antes de salvar.'); return; } try { const payload = { ...companyForm, cnpj: onlyDigits(companyForm.document), zipCode: onlyDigits(companyForm.zipCode) }; await requestApi(editingCompanyId ? `/companies/${editingCompanyId}` : '/companies', { method: editingCompanyId ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); setModalSuccessMessage(editingCompanyId ? 'Empresa atualizada com sucesso.' : 'Empresa cadastrada com sucesso.'); await loadCompanies(search); await loadAllCompaniesForInvite(); if (!editingCompanyId) setCompanyForm(emptyCompanyForm); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Erro ao salvar empresa.'); } }

  async function handleInviteUser(event: FormEvent<HTMLFormElement>) { event.preventDefault(); clearModalMessages(); if (inviteForm.companyIds.length === 0) { setModalErrorMessage('Selecione ao menos uma empresa para o usuário acessar.'); return; } try { const payload = { ...inviteForm, permissions: inviteForm.role === 'ADMIN' ? ALL_COMPANY_PERMISSIONS : [] }; const data = await requestApi('/companies/invitations', { method: 'POST', body: JSON.stringify(payload) }); const linkToken = data.inviteLinkToken || data.invitation?.groupToken || data.invitation?.token; setInviteLink(linkToken ? `${window.location.origin}/convite/${linkToken}` : ''); setModalSuccessMessage(data.message || 'Convite registrado com sucesso.'); setInviteForm(emptyInviteForm); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Erro ao registrar convite.'); } }

  function toggleInviteCompany(companyId: string) { setInviteForm((current) => ({ ...current, companyIds: current.companyIds.includes(companyId) ? current.companyIds.filter((id) => id !== companyId) : [...current.companyIds, companyId] })); }
  function toggleEditCompany(companyId: string) { setEditUserForm((current) => { if (current.accountRole === 'ADMIN') return current; const isSelected = current.companyIds.includes(companyId); const companyIds = isSelected ? current.companyIds.filter((id) => id !== companyId) : [...current.companyIds, companyId]; const companyPermissions = { ...current.companyPermissions }; if (isSelected) delete companyPermissions[companyId]; else companyPermissions[companyId] = companyPermissions[companyId] || DEFAULT_COMPANY_PERMISSIONS; setSelectedPermissionCompanyId((selected) => (selected && companyIds.includes(selected) ? selected : companyIds[0] || '')); return { ...current, companyIds, companyPermissions }; }); }
  function updateSelectedCompanyPermissions(permissions: CompanyPermission[]) { if (!selectedPermissionCompanyId) return; setEditUserForm((current) => ({ ...current, permissions, companyPermissions: { ...current.companyPermissions, [selectedPermissionCompanyId]: permissions } })); }
  function replicateSelectedCompanyPermissions() { if (!selectedPermissionCompanyId) return; setEditUserForm((current) => { const source = current.companyPermissions[selectedPermissionCompanyId] || current.permissions; const companyPermissions = Object.fromEntries(current.companyIds.map((companyId) => [companyId, source])) as Record<string, CompanyPermission[]>; return { ...current, permissions: source, companyPermissions }; }); setModalSuccessMessage('Permissões replicadas para as demais empresas selecionadas. Clique em Salvar alterações para gravar.'); }

  async function openUsersModal(company: Company) { setSelectedCompany(company); setActiveModal('companyUsers'); setOpenMenuCompanyId(null); setIsUsersLoading(true); clearModalMessages(); try { setCompanyUsers((await requestApi(`/companies/${company.id}/users`)) as CompanyAccessUser[]); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível carregar usuários.'); } finally { setIsUsersLoading(false); } }
  function openEditCompany(company: Company) { if (!isSystemAdmin) return; setEditingCompanyId(company.id); setSelectedCompany(company); setCompanyForm(companyToForm(company)); setClientType('PJ'); setOpenMenuCompanyId(null); setError(''); setSuccess(''); setLookupError(''); setCepError(''); clearModalMessages(); setActiveModal('create'); }
  async function unlinkCompanyUser(targetUser: CompanyAccessUser) { if (!selectedCompany || !isSystemAdmin) return; try { const data = await requestApi(`/companies/${selectedCompany.id}/users/${targetUser.id}`, { method: 'DELETE' }); await openUsersModal(selectedCompany); setModalSuccessMessage(data.message || 'Usuário desvinculado.'); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível desvincular usuário.'); } }
  async function saveAdminUser() { if (!selectedAdminUser) return; clearModalMessages(); if (!editUserForm.name.trim() || !editUserForm.email.trim()) { setModalErrorMessage('Nome e e-mail são obrigatórios.'); return; } try { const payload = editUserForm.accountRole === 'ADMIN' ? { ...editUserForm, role: 'ADMIN', companyIds: inviteCompanies.map((company) => company.id) } : { ...editUserForm, companyPermissions: Object.fromEntries(editUserForm.companyIds.map((companyId) => [companyId, editUserForm.companyPermissions[companyId] || DEFAULT_COMPANY_PERMISSIONS])) }; const data = await requestApi(`/users/${selectedAdminUser.id}`, { method: 'PATCH', body: JSON.stringify(payload) }); setModalSuccessMessage(data.message || 'Usuário atualizado.'); await loadAdminUsers(userSearch, userStatusFilter); await loadAllCompaniesForInvite(); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível salvar usuário.'); } }
  async function sendAdminPasswordReset() { if (!selectedAdminUser) return; clearModalMessages(); setPasswordResetUserId(selectedAdminUser.id); try { const data = await requestApi(`/users/${selectedAdminUser.id}/password-reset`, { method: 'POST' }); setModalSuccessMessage(data.message || 'E-mail de recuperação enviado.'); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível enviar a recuperação de senha.'); } finally { setPasswordResetUserId(null); } }
  async function activateAdminUser() { if (!selectedAdminUser) return; clearModalMessages(); try { const data = await requestApi(`/users/${selectedAdminUser.id}/activate`, { method: 'PATCH' }); setModalSuccessMessage(data.message || 'Usuário ativado.'); await loadAdminUsers(userSearch, userStatusFilter); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível ativar usuário.'); } }
  async function deactivateAdminUser() { if (!selectedAdminUser) return; clearModalMessages(); try { const data = await requestApi(`/users/${selectedAdminUser.id}/deactivate`, { method: 'PATCH' }); setModalSuccessMessage(data.message || 'Usuário inativado.'); await loadAdminUsers(userSearch, userStatusFilter); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível inativar usuário.'); } }
  async function inactivateCompany(company: Company) { if (!isSystemAdmin) return; setOpenMenuCompanyId(null); try { await requestApi(`/companies/${company.id}/inactivate`, { method: 'PATCH' }); showToast('Empresa inativada. Use o filtro para visualizar empresas inativas.', 'success'); await loadCompanies(search); await loadAllCompaniesForInvite(); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível inativar a empresa.', 'error'); } }
  async function activateCompany(company: Company) { if (!isSystemAdmin) return; setOpenMenuCompanyId(null); try { await requestApi(`/companies/${company.id}/activate`, { method: 'PATCH' }); showToast('Empresa reativada com sucesso.', 'success'); await loadCompanies(search); await loadAllCompaniesForInvite(); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível reativar a empresa.', 'error'); } }
  async function removeInactiveCompany(company: Company) { if (!isSystemAdmin || company.isActive !== false) return; setOpenMenuCompanyId(null); const confirmed = window.confirm(`Excluir definitivamente a empresa "${company.legalName}"?\n\nAtenção: essa ação causa perda dos dados vinculados a esta empresa, incluindo usuários vinculados, parametrizações, tomadores, serviços, notas fiscais e arquivos armazenados. Essa exclusão não poderá ser desfeita.`); if (!confirmed) return; try { const data = await requestApi(`/companies/${company.id}`, { method: 'DELETE' }); showToast(data.message || 'Empresa excluída definitivamente.', 'success'); await loadCompanies(search); await loadAllCompaniesForInvite(); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível excluir a empresa.', 'error'); } }

  function handleLogout() { localStorage.removeItem('nfse_access_token'); localStorage.removeItem('nfse_user'); router.replace('/login'); }
  async function openInviteForm() { setActiveModal('invite'); setEditingCompanyId(null); setInviteCompanySearch(''); setError(''); setSuccess(''); clearModalMessages(); await loadAllCompaniesForInvite(); }
  function openCreateForm() { setActiveModal('create'); setEditingCompanyId(null); setSelectedCompany(null); setCompanyForm(emptyCompanyForm); setClientType('PJ'); setLookupError(''); setCepError(''); setError(''); setSuccess(''); clearModalMessages(); }
  async function openAdminUsersModal() { setActiveModal('users'); setEditingCompanyId(null); setUserSearch(''); setEditCompanySearch(''); setUserStatusFilter('ALL'); setError(''); setSuccess(''); clearModalMessages(); await loadAllCompaniesForInvite(); await loadAdminUsers('', 'ALL'); }
  function closeModal() { setActiveModal(null); setEditingCompanyId(null); clearModalMessages(); }
  function handleClientTypeChange(type: ClientType) { setClientType(type); setLookupError(''); setCompanyForm((current) => ({ ...current, document: '' })); }

  const modalMessages = <>{inviteLink ? <div className="companies-alert companies-alert--success"><strong>Link de convite para teste:</strong><br /><a href={inviteLink}>{inviteLink}</a></div> : null}</>;

  return (
    <main className="companies-page">
      <header className="companies-header"><div><p className="companies-eyebrow">Zip NFS-e</p><h1>Minhas empresas</h1></div><form className="companies-search companies-search--with-status" onSubmit={handleSearchSubmit}><input type="search" placeholder="Buscar em Minhas empresas..." value={search} onChange={(event) => setSearch(event.target.value)} /><select value={companyStatusFilter} onChange={(event) => setCompanyStatusFilter(event.target.value as CompanyStatusFilter)} aria-label="Filtrar empresas por status"><option value="ACTIVE">Ativas</option><option value="INACTIVE">Inativas</option><option value="ALL">Todas</option></select></form><div className="companies-actions">{isSystemAdmin ? <><button className="companies-button companies-button--light" type="button" onClick={() => void openAdminUsersModal()}>Usuários</button><button className="companies-button companies-button--light" type="button" onClick={() => void openInviteForm()}>Convidar usuários</button><button className="companies-button companies-button--primary" type="button" onClick={openCreateForm}>+ Criar empresa</button></> : null}<button className="companies-button companies-button--ghost" type="button" onClick={handleLogout}>Sair</button></div></header>
      {toast ? <p className="app-toast" data-tone={toast.tone}>{toast.text}</p> : null}
      {user ? <section className="companies-user-bar"><span>{user.name}</span><strong>{isSystemAdmin ? 'Administrador' : 'Usuário'}</strong></section> : null}
      <section className="companies-grid" aria-label="Lista de empresas">{isLoading ? <p className="companies-empty">Carregando empresas...</p> : null}{!isLoading && visibleCompanies.length === 0 ? <p className="companies-empty">Nenhuma empresa encontrada.</p> : null}{visibleCompanies.map((company) => <article className={`company-card ${company.isActive === false ? 'is-inactive' : ''} ${openMenuCompanyId === company.id ? 'is-menu-open' : ''}`} key={company.id}><div className="company-card__menu-wrap"><button className="company-card__menu-button" type="button" aria-label="Abrir ações da empresa" onClick={() => setOpenMenuCompanyId(openMenuCompanyId === company.id ? null : company.id)}>...</button>{openMenuCompanyId === company.id ? <div className="company-card__dropdown">{isSystemAdmin ? <button type="button" onClick={() => openEditCompany(company)}>Editar Empresa</button> : null}<button type="button" onClick={() => void openUsersModal(company)}>Ver usuários</button>{isSystemAdmin && company.isActive !== false ? <button type="button" onClick={() => void inactivateCompany(company)}>Inativar empresa</button> : null}{isSystemAdmin && company.isActive === false ? <button type="button" onClick={() => void activateCompany(company)}>Reativar empresa</button> : null}{isSystemAdmin && company.isActive === false ? <button className="is-danger" type="button" onClick={() => void removeInactiveCompany(company)}>Excluir empresa</button> : null}</div> : null}</div><button className="company-card__content" type="button" onClick={() => router.push(`/empresas/${company.id}`)}><h2 title={company.legalName}>{company.legalName}</h2><p>{formatCnpj(company.cnpj)}</p><div className="company-card__meta"><span>{company.city}/{company.state}</span><span>{company.isActive === false ? 'Inativa' : taxRegimeLabel(company.taxRegime)}</span></div></button></article>)}</section>

      {activeModal ? <div className="modal-backdrop" role="presentation"><section className={`modal-card ${activeModal === 'create' || activeModal === 'users' ? 'modal-card--wide' : ''}`} role="dialog" aria-modal="true"><button className="companies-close modal-close" type="button" onClick={closeModal}>×</button>
        {activeModal === 'users' ? <><div className="modal-heading"><h2>Usuários</h2><p>Edite dados, categoria, acessos por módulo e empresas vinculadas ao usuário.</p></div>{modalMessages}<div className="admin-users-layout"><div className="admin-users-list"><div className="admin-users-filters"><input className="admin-users-search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Buscar por nome ou e-mail..." /><select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value as UserStatusFilter)}><option value="ALL">Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select></div>{isAdminUsersLoading ? <p className="companies-empty">Carregando usuários...</p> : null}{!isAdminUsersLoading && adminUsers.length === 0 ? <p className="companies-empty">Nenhum usuário encontrado.</p> : null}{adminUsers.map((item) => <button key={item.id} className={`admin-user-card ${selectedAdminUserId === item.id ? 'is-active' : ''} ${!item.isActive ? 'is-inactive' : ''}`} type="button" onClick={() => setSelectedAdminUserId(item.id)}><strong>{item.name}</strong><span>{item.email}</span><small>{item.isActive ? 'Ativo' : 'Inativo'} · {item.accountRole === 'ADMIN' ? 'Administrador do sistema' : 'Usuário da empresa'} · {item.companiesCount} empresa(s)</small></button>)}</div><div className="admin-user-detail">{selectedAdminUser ? <><div className="admin-user-detail__header"><div className="admin-user-detail__header-info"><h3>{selectedAdminUser.name}</h3><p>{selectedAdminUser.email}</p><span>{selectedAdminUser.accountRole === 'ADMIN' ? 'Administrador do sistema' : 'Usuário da empresa'}</span></div>{selectedAdminUser.isActive ? <button className="companies-button companies-button--soft-danger" type="button" onClick={() => void deactivateAdminUser()}>Inativar</button> : <button className="companies-button companies-button--soft-danger" type="button" onClick={() => void activateAdminUser()}>Ativar</button>}</div><div className="companies-form admin-user-edit"><label>Nome<input value={editUserForm.name} onChange={(event) => setEditUserForm((current) => ({ ...current, name: event.target.value }))} /></label><label>E-mail<input type="email" value={editUserForm.email} onChange={(event) => setEditUserForm((current) => ({ ...current, email: event.target.value }))} /></label><label>Categoria<select value={editUserForm.accountRole} onChange={(event) => setEditUserForm((current) => ({ ...current, accountRole: event.target.value as AccountRole }))}><option value="USER">Usuário da empresa</option><option value="ADMIN">Administrador do sistema</option></select></label></div><fieldset className="companies-checkboxes user-company-checkboxes"><legend>Empresas selecionadas</legend><label className="company-option-search">Buscar empresa<input type="search" value={editCompanySearch} onChange={(event) => setEditCompanySearch(event.target.value)} placeholder="Filtrar por nome, CNPJ, cidade ou UF..." /></label>{filteredEditCompanies.length === 0 ? <p className="companies-empty">Nenhuma empresa encontrada.</p> : filteredEditCompanies.map((company) => <label key={company.id} className="company-checkbox company-checkbox--compact"><input type="checkbox" checked={editUserForm.companyIds.includes(company.id)} onChange={() => toggleEditCompany(company.id)} /><span title={company.legalName}>{company.legalName}</span></label>)}</fieldset><div className="user-permission-scope"><label>Configurar acessos da empresa<select value={selectedPermissionCompanyId} onChange={(event) => setSelectedPermissionCompanyId(event.target.value)} disabled={editUserForm.accountRole === 'ADMIN' || editUserForm.companyIds.length === 0}>{editUserForm.companyIds.map((companyId) => { const company = inviteCompanies.find((item) => item.id === companyId); return <option key={companyId} value={companyId}>{company?.legalName || companyId}</option>; })}</select></label><button className="companies-button companies-button--ghost companies-button--mini" type="button" onClick={replicateSelectedCompanyPermissions} disabled={editUserForm.accountRole === 'ADMIN' || editUserForm.companyIds.length <= 1 || !selectedPermissionCompanyId}>Replicar para demais</button></div>{selectedPermissionCompany ? <p className="user-permission-scope__hint">Permissões aplicadas somente em {selectedPermissionCompany.legalName}.</p> : null}<PermissionMatrix value={selectedPermissionValue} onChange={updateSelectedCompanyPermissions} disabled={editUserForm.accountRole === 'ADMIN' || !selectedPermissionCompanyId} /><div className="admin-user-actions"><button className="companies-button companies-button--primary" type="button" onClick={() => void saveAdminUser()}>Salvar alterações</button><button className="companies-button companies-button--ghost" type="button" onClick={() => void sendAdminPasswordReset()} disabled={!selectedAdminUser.isActive || passwordResetUserId === selectedAdminUser.id}>{passwordResetUserId === selectedAdminUser.id ? 'Enviando...' : 'Enviar recuperação de senha'}</button><button className="companies-button companies-button--ghost" type="button" onClick={closeModal}>Cancelar</button></div></> : <p className="companies-empty">Selecione um usuário.</p>}</div></div></> : null}
        {activeModal === 'invite' ? <><div className="modal-heading"><h2>Convidar usuário</h2><p>Informe os dados do usuário e selecione as empresas. Permissões de usuário da empresa serão configuradas depois em Usuários.</p></div>{modalMessages}<form className="companies-form invite-form-grid" onSubmit={handleInviteUser}><label>Nome<input value={inviteForm.name} onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do usuário" /></label><label>E-mail<input type="email" value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@empresa.com.br" required /></label><label>Perfil<select value={inviteForm.role} onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value as InviteUserForm['role'], permissions: event.target.value === 'ADMIN' ? ALL_COMPANY_PERMISSIONS : [] }))}><option value="OPERATOR">Usuário da empresa sem permissões</option><option value="ADMIN">Administrador com acesso padrão</option></select></label><fieldset className="companies-checkboxes"><legend>Selecione a(s) empresa(s) para convidar</legend><label className="company-option-search">Buscar empresa<input type="search" value={inviteCompanySearch} onChange={(event) => setInviteCompanySearch(event.target.value)} placeholder="Filtrar por nome, CNPJ, cidade ou UF..." /></label>{filteredInviteCompanies.length === 0 ? <p className="companies-empty">Nenhuma empresa encontrada.</p> : filteredInviteCompanies.map((company) => <label key={company.id} className="company-checkbox company-checkbox--compact"><input type="checkbox" checked={inviteForm.companyIds.includes(company.id)} onChange={() => toggleInviteCompany(company.id)} /><span title={company.legalName}>{company.legalName}</span></label>)}</fieldset><div className="companies-form-footer"><button className="companies-button companies-button--ghost" type="button" onClick={closeModal}>Cancelar</button><button className="companies-button companies-button--primary" type="submit">Enviar convite</button></div></form></> : null}
        {activeModal === 'companyUsers' && selectedCompany ? <><div className="modal-heading"><h2>Usuários liberados</h2><p>{selectedCompany.legalName}</p></div>{modalMessages}<div className="users-list">{isUsersLoading ? <p className="companies-empty">Carregando usuários...</p> : null}{!isUsersLoading && companyUsers.length === 0 ? <p className="companies-empty">Nenhum usuário vinculado a esta empresa.</p> : null}{companyUsers.map((item) => <div className={`user-row ${companyUserDisplayStatus(item) === 'DISABLED' ? 'is-inactive' : ''}`} key={item.id}><div><strong>{item.name}</strong><span>{item.email}</span></div><div className="user-row__meta"><span>{item.accountRole === 'ADMIN' ? 'Administrador do sistema' : 'Acesso modular'}</span><span>{statusLabel(companyUserDisplayStatus(item))}</span></div>{isSystemAdmin && item.accountRole !== 'ADMIN' ? <div className="user-row__actions"><button type="button" title="Remove o vínculo do usuário com esta empresa. Se houver lançamentos, o acesso será desativado." onClick={() => void unlinkCompanyUser(item)}>Desvincular usuário</button></div> : null}</div>)}</div></> : null}
        {activeModal === 'create' ? <form onSubmit={handleSaveCompany}><div className="modal-heading"><h2>{isEditingCompany ? 'Editar empresa' : 'Novo cliente'}</h2><p>{isEditingCompany ? 'Atualize os dados cadastrais da empresa. As configurações fiscais continuam dentro da empresa.' : 'Cadastro básico do cliente. As configurações de emissão de NFS-e ficarão dentro da empresa.'}</p></div>{modalMessages}<div className="client-types" aria-label="Tipo de cliente"><button className={`client-type ${clientType === 'PJ' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('PJ')}><span className="client-type__icon"><ClientTypeIcon type="PJ" /></span><span>Pessoa Jurídica</span></button><button className={`client-type ${clientType === 'PF' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('PF')}><span className="client-type__icon"><ClientTypeIcon type="PF" /></span><span>Pessoa Física</span></button><button className={`client-type ${clientType === 'EXTERIOR' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('EXTERIOR')}><span className="client-type__icon"><ClientTypeIcon type="EXTERIOR" /></span><span>Exterior</span></button></div><div className="companies-form companies-form--client-top"><label className={lookupError ? 'is-invalid' : ''}>{clientType === 'PF' ? 'CPF' : clientType === 'EXTERIOR' ? 'Documento' : 'CNPJ'}<div className="lookup-row"><input value={formatDocument(companyForm.document, clientType)} onChange={(event) => setCompanyForm((current) => ({ ...current, document: clientType === 'EXTERIOR' ? event.target.value.toUpperCase() : onlyDigits(event.target.value) }))} placeholder={clientType === 'PF' ? '___.___.___-__' : clientType === 'PJ' ? '__.___.___/____-__' : 'Documento estrangeiro'} required />{clientType === 'PJ' ? <button className="lookup-button" type="button" onClick={handleLookupCnpj} disabled={isLookupLoading}>{isLookupLoading ? 'Buscando...' : 'Buscar'}</button> : null}</div>{lookupError ? <span className="field-error">? {lookupError}</span> : null}</label><label>Razão Social<input value={companyForm.legalName} onChange={(event) => setCompanyForm((current) => ({ ...current, legalName: event.target.value }))} required /></label><label>Nome fantasia<input value={companyForm.tradeName} onChange={(event) => setCompanyForm((current) => ({ ...current, tradeName: event.target.value }))} /></label><label>Inscrição Municipal<input value={companyForm.municipalRegistration} onChange={(event) => setCompanyForm((current) => ({ ...current, municipalRegistration: event.target.value }))} /></label></div><div className="companies-form-blocks"><section className="companies-form-block"><h3>Dados de contato</h3><div className="companies-form companies-form--client-details"><label>E-mail(s) para envio <small>(separados por vírgula)</small><input value={companyForm.email} onChange={(event) => setCompanyForm((current) => ({ ...current, email: event.target.value }))} /></label><label>Telefone<input value={companyForm.phone} onChange={(event) => setCompanyForm((current) => ({ ...current, phone: event.target.value }))} /></label><label>Celular<input value={companyForm.mobile} onChange={(event) => setCompanyForm((current) => ({ ...current, mobile: event.target.value }))} /></label><label>Pessoa de contato<input value={companyForm.contactPerson} onChange={(event) => setCompanyForm((current) => ({ ...current, contactPerson: event.target.value }))} /></label><label>Website<input value={companyForm.website} onChange={(event) => setCompanyForm((current) => ({ ...current, website: event.target.value }))} placeholder="https://" /></label></div></section><section className="companies-form-block"><h3>Endereço</h3><div className="companies-form companies-form--client-details"><label className={cepError ? 'is-invalid' : ''}>CEP<div className="lookup-row"><input value={formatCep(companyForm.zipCode)} onChange={(event) => setCompanyForm((current) => ({ ...current, zipCode: onlyDigits(event.target.value) }))} placeholder="_____-___" /><button className="lookup-button" type="button" onClick={handleLookupCep} disabled={isCepLoading}>{isCepLoading ? 'Buscando...' : 'Buscar'}</button></div>{cepError ? <span className="field-error">{cepError}</span> : null}</label><label>Endereço<input value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} /></label><label>Número<input value={companyForm.number} onChange={(event) => setCompanyForm((current) => ({ ...current, number: event.target.value }))} /></label><label>Complemento<input value={companyForm.complement} onChange={(event) => setCompanyForm((current) => ({ ...current, complement: event.target.value }))} /></label><label>Bairro<input value={companyForm.neighborhood} onChange={(event) => setCompanyForm((current) => ({ ...current, neighborhood: event.target.value }))} /></label><label>Estado<select value={companyForm.state} onChange={(event) => setCompanyForm((current) => ({ ...current, state: event.target.value, city: '' }))} required><option value="">Selecione o estado...</option>{BRAZIL_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></label><label>Cidade{cityOptions.length > 0 ? <select value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required><option value="">Selecione a cidade...</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}{companyForm.city && !cityOptions.includes(companyForm.city) ? <option value={companyForm.city}>{companyForm.city}</option> : null}</select> : <input value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required />}</label><label>País<input value={companyForm.country} onChange={(event) => setCompanyForm((current) => ({ ...current, country: event.target.value }))} /></label></div></section></div><div className="companies-form-footer"><button className="companies-button companies-button--ghost" type="button" onClick={closeModal}>Cancelar</button><button className="companies-button companies-button--primary" type="submit">{isEditingCompany ? 'Salvar alterações' : 'Cadastrar'}</button></div></form> : null}
      </section></div> : null}
    </main>
  );
}
