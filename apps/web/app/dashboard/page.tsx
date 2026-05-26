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
  | 'accounting.documents.view'
  | 'accounting.taxes.view'
  | 'accounting.requests.view'
  | 'accounting.processes.view';
type AdminModal = 'invite' | 'create' | 'companyUsers' | 'users' | null;
type UserStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

type StoredUser = { id: string; name: string; email: string; accountRole: AccountRole };
type Company = { id: string; legalName: string; tradeName?: string | null; cnpj: string; municipalRegistration?: string | null; city: string; state: string; country?: string | null; zipCode?: string | null; address?: string | null; number?: string | null; complement?: string | null; neighborhood?: string | null; email?: string | null; phone?: string | null; registrationStatus?: string | null; mainActivity?: string | null; legalNature?: string | null; taxRegime: string; serviceCodeDefault?: string | null; role: CompanyRole; permissions?: CompanyPermission[] };
type CompanyAccessUser = { id: string; name: string; email: string; role: CompanyRole; permissions?: CompanyPermission[]; status: CompanyUserStatus; isActive: boolean; accountRole: AccountRole; canDelete?: boolean; linkedInvoices?: number };
type UserCompanyAccess = { id: string; legalName: string; tradeName?: string | null; cnpj: string; city: string; state: string; isActive: boolean; role: CompanyRole; permissions?: CompanyPermission[]; status: CompanyUserStatus };
type AdminUser = { id: string; name: string; email: string; accountRole: AccountRole; isActive: boolean; companiesCount: number; companies: UserCompanyAccess[] };
type InviteUserForm = { companyIds: string[]; name: string; email: string; role: 'OPERATOR' | 'VIEWER' | 'ADMIN'; permissions: CompanyPermission[] };
type EditUserForm = { name: string; email: string; accountRole: AccountRole; role: 'OPERATOR' | 'VIEWER' | 'ADMIN'; companyIds: string[]; permissions: CompanyPermission[] };
type CreateCompanyForm = { document: string; legalName: string; tradeName: string; municipalRegistration: string; city: string; state: string; country: string; zipCode: string; address: string; number: string; complement: string; neighborhood: string; email: string; phone: string; mobile: string; contactPerson: string; website: string; registrationStatus: string; mainActivity: string; legalNature: string; taxRegime: string; serviceCodeDefault: string };

const emptyCompanyForm: CreateCompanyForm = { document: '', legalName: '', tradeName: '', municipalRegistration: '', city: '', state: '', country: 'Brasil', zipCode: '', address: '', number: '', complement: '', neighborhood: '', email: '', phone: '', mobile: '', contactPerson: '', website: '', registrationStatus: '', mainActivity: '', legalNature: '', taxRegime: 'Não informado', serviceCodeDefault: '' };
const COMPANY_PERMISSION_GROUPS: Array<{ title: string; items: Array<{ key: CompanyPermission; label: string }> }> = [
  { title: 'NFS-e / Notas Fiscais', items: [
    { key: 'nfse.invoices.view', label: 'Visualizar' },
    { key: 'nfse.invoices.create', label: 'Nova NFS-e' },
    { key: 'nfse.invoices.edit', label: 'Editar' },
    { key: 'nfse.invoices.delete', label: 'Excluir locais' },
    { key: 'nfse.invoices.transmit', label: 'Transmitir' },
    { key: 'nfse.invoices.sync', label: 'Sincronizar' },
  ] },
  { title: 'NFS-e / Tomadores', items: [
    { key: 'nfse.takers.view', label: 'Visualizar' },
    { key: 'nfse.takers.create', label: 'Cadastrar' },
    { key: 'nfse.takers.edit', label: 'Editar' },
    { key: 'nfse.takers.delete', label: 'Excluir/Inativar' },
  ] },
  { title: 'NFS-e / Configurações', items: [
    { key: 'nfse.settings.view', label: 'Visualizar' },
    { key: 'nfse.settings.edit', label: 'Alterar' },
  ] },
  { title: 'Contabilidade', items: [
    { key: 'accounting.documents.view', label: 'Documentos' },
    { key: 'accounting.taxes.view', label: 'Impostos' },
    { key: 'accounting.requests.view', label: 'Solicitações' },
    { key: 'accounting.processes.view', label: 'Processos' },
  ] },
];
const ALL_COMPANY_PERMISSIONS = COMPANY_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));
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

const emptyInviteForm: InviteUserForm = { companyIds: [], name: '', email: '', role: 'OPERATOR', permissions: DEFAULT_COMPANY_PERMISSIONS };
const emptyEditUserForm: EditUserForm = { name: '', email: '', accountRole: 'USER', role: 'OPERATOR', companyIds: [], permissions: DEFAULT_COMPANY_PERMISSIONS };

function roleLabel(role: string) { return ({ OWNER: 'Responsável', ADMIN: 'Administrador', OPERATOR: 'Operador', VIEWER: 'Visualizador', ADMIN_VIEW: 'Administrador' } as Record<string, string>)[role] || role; }
function statusLabel(status: string) { return ({ ACTIVE: 'Ativo', BLOCKED: 'Bloqueado', DISABLED: 'Desativado' } as Record<string, string>)[status] || status; }
function companyUserDisplayStatus(user: CompanyAccessUser) { return user.isActive ? 'ACTIVE' : 'DISABLED'; }
function getPrimaryCompanyRole(companies: UserCompanyAccess[]): EditUserForm['role'] { const role = companies.find((item) => item.role !== 'OWNER')?.role || companies[0]?.role || 'OPERATOR'; return role === 'VIEWER' || role === 'ADMIN' ? role : 'OPERATOR'; }
function getPrimaryCompanyPermissions(companies: UserCompanyAccess[]) {
  const configured = companies.find((item) => Array.isArray(item.permissions));
  return configured?.permissions || DEFAULT_COMPANY_PERMISSIONS;
}
function hasSameIds(left: string[], right: string[]) { return left.length === right.length && left.every((id) => right.includes(id)); }
function companyToForm(company: Company): CreateCompanyForm { return { document: company.cnpj || '', legalName: company.legalName || '', tradeName: company.tradeName || '', municipalRegistration: company.municipalRegistration || '', city: company.city || '', state: company.state || '', country: company.country || 'Brasil', zipCode: company.zipCode || '', address: company.address || '', number: company.number || '', complement: company.complement || '', neighborhood: company.neighborhood || '', email: company.email || '', phone: company.phone || '', mobile: '', contactPerson: '', website: '', registrationStatus: company.registrationStatus || '', mainActivity: company.mainActivity || '', legalNature: company.legalNature || '', taxRegime: company.taxRegime || 'Não informado', serviceCodeDefault: company.serviceCodeDefault || '' }; }

function PermissionMatrix({ value, onChange, disabled = false }: { value: CompanyPermission[]; onChange: (next: CompanyPermission[]) => void; disabled?: boolean }) {
  const selectedCount = value.length;
  function toggle(permission: CompanyPermission) { onChange(value.includes(permission) ? value.filter((item) => item !== permission) : [...value, permission]); }
  function toggleGroup(items: CompanyPermission[]) {
    const allChecked = items.every((item) => value.includes(item));
    onChange(allChecked ? value.filter((item) => !items.includes(item)) : Array.from(new Set([...value, ...items])));
  }
  return (
    <fieldset className={`permissions-matrix ${disabled ? 'is-disabled' : ''}`}>
      <legend>Acessos por módulo</legend>
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
      {COMPANY_PERMISSION_GROUPS.map((group) => {
        const keys = group.items.map((item) => item.key);
        const allChecked = keys.every((key) => value.includes(key));
        const groupCount = keys.filter((key) => value.includes(key)).length;
        return (
          <section className="permissions-matrix__group" key={group.title}>
            <label className="permissions-matrix__title"><input type="checkbox" checked={allChecked} disabled={disabled} onChange={() => toggleGroup(keys)} /><span>{group.title}</span><small>{groupCount}/{keys.length}</small></label>
            <div className="permissions-matrix__items">
              {group.items.map((item) => <label key={item.key}><input type="checkbox" checked={value.includes(item.key)} disabled={disabled} onChange={() => toggle(item.key)} /><span>{item.label}</span></label>)}
            </div>
          </section>
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
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
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
  const [editUserForm, setEditUserForm] = useState<EditUserForm>(emptyEditUserForm);
  const [clientType, setClientType] = useState<ClientType>('PJ');
  const [companyForm, setCompanyForm] = useState<CreateCompanyForm>(emptyCompanyForm);
  const [inviteForm, setInviteForm] = useState<InviteUserForm>(emptyInviteForm);

  const isSystemAdmin = user?.accountRole === 'ADMIN';
  const inviteCompanies = allCompanies.length > 0 ? allCompanies : companies;
  const visibleCompanies = useMemo(() => companies, [companies]);
  const selectedAdminUser = adminUsers.find((item) => item.id === selectedAdminUserId) || adminUsers[0] || null;
  const isEditingSystemAdmin = editUserForm.accountRole === 'ADMIN';
  const cityOptions = companyForm.state ? CITY_OPTIONS[companyForm.state] || [] : [];
  const isEditingCompany = Boolean(editingCompanyId);

  function clearModalMessages() { setModalError(''); setModalSuccess(''); setInviteLink(''); }
  function setModalSuccessMessage(message: string) { setModalError(''); setModalSuccess(message); }
  function setModalErrorMessage(message: string) { setModalSuccess(''); setModalError(message); }

  useEffect(() => { const token = localStorage.getItem('nfse_access_token'); const storedUser = localStorage.getItem('nfse_user'); if (!token) { router.replace('/login'); return; } if (storedUser) setUser(JSON.parse(storedUser) as StoredUser); void loadCompanies('', { updateAll: true }); }, [router]);
  useEffect(() => { const timer = window.setTimeout(() => void loadCompanies(search, { updateAll: false }), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { if (activeModal !== 'users') return; const timer = window.setTimeout(() => void loadAdminUsers(userSearch, userStatusFilter), 250); return () => window.clearTimeout(timer); }, [userSearch, userStatusFilter, activeModal]);
  useEffect(() => { if (!selectedAdminUser) { setEditUserForm(emptyEditUserForm); return; } setEditUserForm({ name: selectedAdminUser.name, email: selectedAdminUser.email, accountRole: selectedAdminUser.accountRole, role: getPrimaryCompanyRole(selectedAdminUser.companies), companyIds: selectedAdminUser.companies.map((company) => company.id), permissions: getPrimaryCompanyPermissions(selectedAdminUser.companies) }); }, [selectedAdminUserId, adminUsers]);
  useEffect(() => { if (activeModal !== 'users' || editUserForm.accountRole !== 'ADMIN') return; const allCompanyIds = inviteCompanies.map((company) => company.id); setEditUserForm((current) => (current.role === 'ADMIN' && hasSameIds(current.companyIds, allCompanyIds) ? current : { ...current, role: 'ADMIN', companyIds: allCompanyIds, permissions: ALL_COMPANY_PERMISSIONS })); }, [activeModal, editUserForm.accountRole, inviteCompanies]);
  useEffect(() => { if (activeModal !== 'users') return; const disabled = editUserForm.accountRole === 'ADMIN'; const fieldset = document.querySelector<HTMLElement>('.user-company-checkboxes'); fieldset?.classList.toggle('is-disabled', disabled); const legend = fieldset?.querySelector('legend'); if (legend) legend.textContent = disabled ? 'Todas as empresas liberadas automaticamente' : 'Empresas selecionadas'; fieldset?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => { input.disabled = disabled; }); }, [activeModal, editUserForm.accountRole, editUserForm.companyIds, inviteCompanies]);

  async function requestApi(path: string, options: RequestInit = {}) { const token = localStorage.getItem('nfse_access_token'); if (!token) { router.replace('/login'); throw new Error('Sessão expirada.'); } const response = await fetch(`http://localhost:3333${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } }); const text = await response.text(); const data = text ? JSON.parse(text) : null; if (!response.ok) throw new Error(data?.message || 'Não foi possível concluir a solicitação.'); return data; }

  async function loadCompanies(searchTerm = '', options: { updateAll?: boolean } = {}) { setIsLoading(true); setError(''); try { const params = searchTerm.trim() ? `?search=${encodeURIComponent(searchTerm.trim())}` : ''; const data = (await requestApi(`/companies${params}`)) as Company[]; setCompanies(data); if (options.updateAll || (!searchTerm.trim() && allCompanies.length === 0)) setAllCompanies(data); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar as empresas.'); } finally { setIsLoading(false); } }
  async function loadAllCompaniesForInvite() { try { setAllCompanies((await requestApi('/companies')) as Company[]); } catch (err) { const message = err instanceof Error ? err.message : 'Não foi possível carregar todas as empresas.'; activeModal ? setModalErrorMessage(message) : setError(message); } }
  async function loadAdminUsers(term = '', status = userStatusFilter) { setIsAdminUsersLoading(true); try { const params = new URLSearchParams(); if (term.trim()) params.set('search', term.trim()); if (status !== 'ALL') params.set('status', status); const query = params.toString() ? `?${params.toString()}` : ''; const data = (await requestApi(`/users${query}`)) as AdminUser[]; setAdminUsers(data); setSelectedAdminUserId((current) => (current && data.some((item) => item.id === current) ? current : data[0]?.id || null)); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível carregar usuários.'); } finally { setIsAdminUsersLoading(false); } }

  async function handleLookupCnpj() { const cnpj = onlyDigits(companyForm.document); setLookupError(''); clearModalMessages(); if (cnpj.length !== 14) { setLookupError('CNPJ inválido.'); return; } setIsLookupLoading(true); try { const data = await requestApi(`/companies/lookup/cnpj?cnpj=${cnpj}`); setCompanyForm((current) => ({ ...current, ...data, document: data.cnpj || cnpj, taxRegime: current.taxRegime || 'Não informado' })); setModalSuccessMessage('Dados cadastrais localizados. Confira as informações antes de salvar.'); } catch (err) { setLookupError(err instanceof Error ? err.message : 'Não foi possível consultar o CNPJ agora.'); } finally { setIsLookupLoading(false); } }
  async function handleLookupCep() { const cep = onlyDigits(companyForm.zipCode); setCepError(''); if (cep.length !== 8) { setCepError('CEP inválido.'); return; } setIsCepLoading(true); try { const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const data = await response.json(); if (!response.ok || data.erro) { setCepError('CEP não encontrado.'); return; } setCompanyForm((current) => ({ ...current, zipCode: cep, address: data.logradouro || current.address, complement: data.complemento || current.complement, neighborhood: data.bairro || current.neighborhood, state: data.uf || current.state, city: data.localidade || current.city, country: 'Brasil' })); setModalSuccessMessage('Endereço localizado pelo CEP. Confira as informações antes de salvar.'); } catch { setCepError('Não foi possível buscar o CEP agora.'); } finally { setIsCepLoading(false); } }
  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await loadCompanies(search); }

  async function handleSaveCompany(event: FormEvent<HTMLFormElement>) { event.preventDefault(); clearModalMessages(); setLookupError(''); if (clientType === 'PF' && !isValidCpf(companyForm.document)) { setLookupError('CPF inválido.'); return; } if (clientType === 'EXTERIOR' && !companyForm.document.trim()) { setLookupError('Documento obrigatório.'); return; } if (clientType !== 'PJ') { setModalErrorMessage('Cadastro definitivo de Pessoa Física e Exterior será conectado ao backend na próxima etapa.'); return; } if (!companyForm.legalName || !companyForm.city || !companyForm.state) { setModalErrorMessage('Busque o CNPJ ou preencha razão social, cidade e UF antes de salvar.'); return; } try { const payload = { ...companyForm, cnpj: onlyDigits(companyForm.document), zipCode: onlyDigits(companyForm.zipCode) }; await requestApi(editingCompanyId ? `/companies/${editingCompanyId}` : '/companies', { method: editingCompanyId ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); setModalSuccessMessage(editingCompanyId ? 'Empresa atualizada com sucesso.' : 'Empresa cadastrada com sucesso.'); await loadCompanies(search); await loadAllCompaniesForInvite(); if (!editingCompanyId) setCompanyForm(emptyCompanyForm); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Erro ao salvar empresa.'); } }

  async function handleInviteUser(event: FormEvent<HTMLFormElement>) { event.preventDefault(); clearModalMessages(); if (inviteForm.companyIds.length === 0) { setModalErrorMessage('Selecione ao menos uma empresa para o usuário acessar.'); return; } try { const data = await requestApi('/companies/invitations', { method: 'POST', body: JSON.stringify(inviteForm) }); const linkToken = data.inviteLinkToken || data.invitation?.groupToken || data.invitation?.token; setInviteLink(linkToken ? `${window.location.origin}/convite/${linkToken}` : ''); setModalSuccessMessage(data.message || 'Convite registrado com sucesso.'); setInviteForm(emptyInviteForm); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Erro ao registrar convite.'); } }

  function toggleInviteCompany(companyId: string) { setInviteForm((current) => ({ ...current, companyIds: current.companyIds.includes(companyId) ? current.companyIds.filter((id) => id !== companyId) : [...current.companyIds, companyId] })); }
  function toggleEditCompany(companyId: string) { setEditUserForm((current) => current.accountRole === 'ADMIN' ? current : ({ ...current, companyIds: current.companyIds.includes(companyId) ? current.companyIds.filter((id) => id !== companyId) : [...current.companyIds, companyId] })); }

  async function openUsersModal(company: Company) { setSelectedCompany(company); setActiveModal('companyUsers'); setOpenMenuCompanyId(null); setIsUsersLoading(true); clearModalMessages(); try { setCompanyUsers((await requestApi(`/companies/${company.id}/users`)) as CompanyAccessUser[]); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível carregar usuários.'); } finally { setIsUsersLoading(false); } }
  function openEditCompany(company: Company) { if (!isSystemAdmin) return; setEditingCompanyId(company.id); setSelectedCompany(company); setCompanyForm(companyToForm(company)); setClientType('PJ'); setOpenMenuCompanyId(null); setError(''); setSuccess(''); setLookupError(''); setCepError(''); clearModalMessages(); setActiveModal('create'); }
  async function unlinkCompanyUser(targetUser: CompanyAccessUser) { if (!selectedCompany || !isSystemAdmin) return; try { const data = await requestApi(`/companies/${selectedCompany.id}/users/${targetUser.id}`, { method: 'DELETE' }); await openUsersModal(selectedCompany); setModalSuccessMessage(data.message || 'Usuário desvinculado.'); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível desvincular usuário.'); } }
  async function saveAdminUser() { if (!selectedAdminUser) return; clearModalMessages(); if (!editUserForm.name.trim() || !editUserForm.email.trim()) { setModalErrorMessage('Nome e e-mail são obrigatórios.'); return; } try { const payload = editUserForm.accountRole === 'ADMIN' ? { ...editUserForm, role: 'ADMIN', companyIds: inviteCompanies.map((company) => company.id) } : editUserForm; const data = await requestApi(`/users/${selectedAdminUser.id}`, { method: 'PATCH', body: JSON.stringify(payload) }); setModalSuccessMessage(data.message || 'Usuário atualizado.'); await loadAdminUsers(userSearch, userStatusFilter); await loadAllCompaniesForInvite(); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível salvar usuário.'); } }
  async function activateAdminUser() { if (!selectedAdminUser) return; clearModalMessages(); try { const data = await requestApi(`/users/${selectedAdminUser.id}/activate`, { method: 'PATCH' }); setModalSuccessMessage(data.message || 'Usuário ativado.'); await loadAdminUsers(userSearch, userStatusFilter); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível ativar usuário.'); } }
  async function deactivateAdminUser() { if (!selectedAdminUser) return; clearModalMessages(); try { const data = await requestApi(`/users/${selectedAdminUser.id}/deactivate`, { method: 'PATCH' }); setModalSuccessMessage(data.message || 'Usuário inativado.'); await loadAdminUsers(userSearch, userStatusFilter); } catch (err) { setModalErrorMessage(err instanceof Error ? err.message : 'Não foi possível inativar usuário.'); } }

  function handleLogout() { localStorage.removeItem('nfse_access_token'); localStorage.removeItem('nfse_user'); router.replace('/login'); }
  async function openInviteForm() { setActiveModal('invite'); setEditingCompanyId(null); setError(''); setSuccess(''); clearModalMessages(); await loadAllCompaniesForInvite(); }
  function openCreateForm() { setActiveModal('create'); setEditingCompanyId(null); setSelectedCompany(null); setCompanyForm(emptyCompanyForm); setClientType('PJ'); setLookupError(''); setCepError(''); setError(''); setSuccess(''); clearModalMessages(); }
  async function openAdminUsersModal() { setActiveModal('users'); setEditingCompanyId(null); setUserSearch(''); setUserStatusFilter('ALL'); setError(''); setSuccess(''); clearModalMessages(); await loadAllCompaniesForInvite(); await loadAdminUsers('', 'ALL'); }
  function closeModal() { setActiveModal(null); setEditingCompanyId(null); clearModalMessages(); }
  function handleClientTypeChange(type: ClientType) { setClientType(type); setLookupError(''); setCompanyForm((current) => ({ ...current, document: '' })); }

  const modalMessages = <>{modalError ? <p className="companies-alert companies-alert--error">{modalError}</p> : null}{modalSuccess ? <p className="companies-alert companies-alert--success">{modalSuccess}</p> : null}{inviteLink ? <div className="companies-alert companies-alert--success"><strong>Link de convite para teste:</strong><br /><a href={inviteLink}>{inviteLink}</a></div> : null}</>;

  return (
    <main className="companies-page">
      <header className="companies-header"><div><p className="companies-eyebrow">Zip NFS-e</p><h1>Minhas empresas</h1></div><form className="companies-search" onSubmit={handleSearchSubmit}><input type="search" placeholder="Buscar em Minhas empresas..." value={search} onChange={(event) => setSearch(event.target.value)} /></form><div className="companies-actions">{isSystemAdmin ? <><button className="companies-button companies-button--light" type="button" onClick={() => void openAdminUsersModal()}>👥 Usuários</button><button className="companies-button companies-button--light" type="button" onClick={() => void openInviteForm()}>✉ Convidar usuários</button><button className="companies-button companies-button--primary" type="button" onClick={openCreateForm}>+ Criar empresa</button></> : null}<button className="companies-button companies-button--ghost" type="button" onClick={handleLogout}>Sair</button></div></header>
      {user ? <section className="companies-user-bar"><span>{user.name}</span><strong>{isSystemAdmin ? 'Administrador' : 'Usuário'}</strong></section> : null}
      {!activeModal && error ? <p className="companies-alert companies-alert--error">{error}</p> : null}{!activeModal && success ? <p className="companies-alert companies-alert--success">{success}</p> : null}
      <section className="companies-grid" aria-label="Lista de empresas">{isLoading ? <p className="companies-empty">Carregando empresas...</p> : null}{!isLoading && visibleCompanies.length === 0 ? <p className="companies-empty">Nenhuma empresa encontrada.</p> : null}{visibleCompanies.map((company) => <article className="company-card" key={company.id}><div className="company-card__menu-wrap"><button className="company-card__menu-button" type="button" onClick={() => setOpenMenuCompanyId(openMenuCompanyId === company.id ? null : company.id)}>⋮</button>{openMenuCompanyId === company.id ? <div className="company-card__dropdown">{isSystemAdmin ? <button type="button" onClick={() => openEditCompany(company)}>Editar Empresa</button> : null}<button type="button" onClick={() => void openUsersModal(company)}>Ver usuários</button></div> : null}</div><button className="company-card__content" type="button" onClick={() => router.push(`/empresas/${company.id}`)}><h2 title={company.legalName}>{company.legalName}</h2><p>{formatCnpj(company.cnpj)}</p><div className="company-card__meta"><span>{company.city}/{company.state}</span><span>{company.taxRegime}</span></div></button></article>)}</section>

      {activeModal ? <div className="modal-backdrop" role="presentation"><section className={`modal-card ${activeModal === 'create' || activeModal === 'users' ? 'modal-card--wide' : ''}`} role="dialog" aria-modal="true"><button className="companies-close modal-close" type="button" onClick={closeModal}>×</button>
        {activeModal === 'users' ? <><div className="modal-heading"><h2>Usuários</h2><p>Edite dados, categoria, acessos por módulo e empresas vinculadas ao usuário.</p></div>{modalMessages}<div className="admin-users-layout"><div className="admin-users-list"><div className="admin-users-filters"><input className="admin-users-search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Buscar por nome ou e-mail..." /><select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value as UserStatusFilter)}><option value="ALL">Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select></div>{isAdminUsersLoading ? <p className="companies-empty">Carregando usuários...</p> : null}{!isAdminUsersLoading && adminUsers.length === 0 ? <p className="companies-empty">Nenhum usuário encontrado.</p> : null}{adminUsers.map((item) => <button key={item.id} className={`admin-user-card ${selectedAdminUserId === item.id ? 'is-active' : ''} ${!item.isActive ? 'is-inactive' : ''}`} type="button" onClick={() => setSelectedAdminUserId(item.id)}><strong>{item.name}</strong><span>{item.email}</span><small>{item.isActive ? 'Ativo' : 'Inativo'} · {item.accountRole === 'ADMIN' ? 'Administrador do sistema' : 'Usuário da empresa'} · {item.companiesCount} empresa(s)</small></button>)}</div><div className="admin-user-detail">{selectedAdminUser ? <><div className="admin-user-detail__header"><h3>{selectedAdminUser.name}</h3><p>{selectedAdminUser.email}</p><span>{selectedAdminUser.accountRole === 'ADMIN' ? 'Administrador do sistema' : 'Usuário da empresa'}</span></div><div className="companies-form admin-user-edit"><label>Nome<input value={editUserForm.name} onChange={(event) => setEditUserForm((current) => ({ ...current, name: event.target.value }))} /></label><label>E-mail<input type="email" value={editUserForm.email} onChange={(event) => setEditUserForm((current) => ({ ...current, email: event.target.value }))} /></label><label>Categoria<select value={editUserForm.accountRole} onChange={(event) => setEditUserForm((current) => ({ ...current, accountRole: event.target.value as AccountRole }))}><option value="USER">Usuário da empresa</option><option value="ADMIN">Administrador do sistema</option></select></label></div><fieldset className="companies-checkboxes user-company-checkboxes"><legend>Empresas selecionadas</legend>{inviteCompanies.map((company) => <label key={company.id} className="company-checkbox company-checkbox--compact"><input type="checkbox" checked={editUserForm.companyIds.includes(company.id)} onChange={() => toggleEditCompany(company.id)} /><span title={company.legalName}>{company.legalName}</span></label>)}</fieldset><PermissionMatrix value={editUserForm.permissions} onChange={(permissions) => setEditUserForm((current) => ({ ...current, permissions }))} disabled={editUserForm.accountRole === 'ADMIN'} /><div className="admin-user-actions"><button className="companies-button companies-button--primary" type="button" onClick={() => void saveAdminUser()}>Salvar alterações</button>{selectedAdminUser.isActive ? <button className="companies-button companies-button--soft-danger" type="button" onClick={() => void deactivateAdminUser()}>Inativar</button> : <button className="companies-button companies-button--soft-danger" type="button" onClick={() => void activateAdminUser()}>Ativar</button>}</div></> : <p className="companies-empty">Selecione um usuário.</p>}</div></div></> : null}
        {activeModal === 'invite' ? <><div className="modal-heading"><h2>Convidar usuário</h2><p>Informe os dados do usuário e selecione uma ou mais empresas que ele poderá acessar.</p></div>{modalMessages}<form className="companies-form invite-form-grid" onSubmit={handleInviteUser}><label>Nome<input value={inviteForm.name} onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do usuário" /></label><label>E-mail<input type="email" value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@empresa.com.br" required /></label><fieldset className="companies-checkboxes"><legend>Selecione a(s) empresa(s) para convidar</legend>{inviteCompanies.length === 0 ? <p>Nenhuma empresa cadastrada para selecionar.</p> : inviteCompanies.map((company) => <label key={company.id} className="company-checkbox company-checkbox--compact"><input type="checkbox" checked={inviteForm.companyIds.includes(company.id)} onChange={() => toggleInviteCompany(company.id)} /><span title={company.legalName}>{company.legalName}</span></label>)}</fieldset><PermissionMatrix value={inviteForm.permissions} onChange={(permissions) => setInviteForm((current) => ({ ...current, permissions }))} /><button className="companies-button companies-button--primary" type="submit">Enviar convite</button></form></> : null}
        {activeModal === 'companyUsers' && selectedCompany ? <><div className="modal-heading"><h2>Usuários liberados</h2><p>{selectedCompany.legalName}</p></div>{modalMessages}<div className="users-list">{isUsersLoading ? <p className="companies-empty">Carregando usuários...</p> : null}{!isUsersLoading && companyUsers.length === 0 ? <p className="companies-empty">Nenhum usuário vinculado a esta empresa.</p> : null}{companyUsers.map((item) => <div className={`user-row ${companyUserDisplayStatus(item) === 'DISABLED' ? 'is-inactive' : ''}`} key={item.id}><div><strong>{item.name}</strong><span>{item.email}</span></div><div className="user-row__meta"><span>{item.accountRole === 'ADMIN' ? 'Administrador do sistema' : 'Acesso modular'}</span><span>{statusLabel(companyUserDisplayStatus(item))}</span></div>{isSystemAdmin && item.accountRole !== 'ADMIN' ? <div className="user-row__actions"><button type="button" title="Remove o vínculo do usuário com esta empresa. Se houver lançamentos, o acesso será desativado." onClick={() => void unlinkCompanyUser(item)}>Desvincular usuário</button></div> : null}</div>)}</div></> : null}
        {activeModal === 'create' ? <form onSubmit={handleSaveCompany}><div className="modal-heading"><h2>{isEditingCompany ? 'Editar empresa' : 'Novo cliente'}</h2><p>{isEditingCompany ? 'Atualize os dados cadastrais da empresa. As configurações fiscais continuam dentro da empresa.' : 'Cadastro básico do cliente. As configurações de emissão de NFS-e ficarão dentro da empresa.'}</p></div>{modalMessages}<div className="client-types" aria-label="Tipo de cliente"><button className={`client-type ${clientType === 'PJ' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('PJ')}><span className="client-type__icon"><ClientTypeIcon type="PJ" /></span><span>Pessoa Jurídica</span></button><button className={`client-type ${clientType === 'PF' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('PF')}><span className="client-type__icon"><ClientTypeIcon type="PF" /></span><span>Pessoa Física</span></button><button className={`client-type ${clientType === 'EXTERIOR' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('EXTERIOR')}><span className="client-type__icon"><ClientTypeIcon type="EXTERIOR" /></span><span>Exterior</span></button></div><div className="companies-form companies-form--client-top"><label className={lookupError ? 'is-invalid' : ''}>{clientType === 'PF' ? 'CPF' : clientType === 'EXTERIOR' ? 'Documento' : 'CNPJ'}<div className="lookup-row"><input value={formatDocument(companyForm.document, clientType)} onChange={(event) => setCompanyForm((current) => ({ ...current, document: clientType === 'EXTERIOR' ? event.target.value.toUpperCase() : onlyDigits(event.target.value) }))} placeholder={clientType === 'PF' ? '___.___.___-__' : clientType === 'PJ' ? '__.___.___/____-__' : 'Documento estrangeiro'} required />{clientType === 'PJ' ? <button className="lookup-button" type="button" onClick={handleLookupCnpj} disabled={isLookupLoading}>{isLookupLoading ? 'Buscando...' : 'Buscar'}</button> : null}</div>{lookupError ? <span className="field-error">● {lookupError}</span> : null}</label><label>Razão Social<input value={companyForm.legalName} onChange={(event) => setCompanyForm((current) => ({ ...current, legalName: event.target.value }))} required /></label><label>Nome fantasia<input value={companyForm.tradeName} onChange={(event) => setCompanyForm((current) => ({ ...current, tradeName: event.target.value }))} /></label><label>Inscrição Municipal<input value={companyForm.municipalRegistration} onChange={(event) => setCompanyForm((current) => ({ ...current, municipalRegistration: event.target.value }))} /></label></div><div className="companies-form-blocks"><section className="companies-form-block"><h3>Dados de contato</h3><div className="companies-form companies-form--client-details"><label>E-mail(s) para envio <small>(separados por vírgula)</small><input value={companyForm.email} onChange={(event) => setCompanyForm((current) => ({ ...current, email: event.target.value }))} /></label><label>Telefone<input value={companyForm.phone} onChange={(event) => setCompanyForm((current) => ({ ...current, phone: event.target.value }))} /></label><label>Celular<input value={companyForm.mobile} onChange={(event) => setCompanyForm((current) => ({ ...current, mobile: event.target.value }))} /></label><label>Pessoa de contato<input value={companyForm.contactPerson} onChange={(event) => setCompanyForm((current) => ({ ...current, contactPerson: event.target.value }))} /></label><label>Website<input value={companyForm.website} onChange={(event) => setCompanyForm((current) => ({ ...current, website: event.target.value }))} placeholder="https://" /></label></div></section><section className="companies-form-block"><h3>Endereço</h3><div className="companies-form companies-form--client-details"><label className={cepError ? 'is-invalid' : ''}>CEP<div className="lookup-row"><input value={formatCep(companyForm.zipCode)} onChange={(event) => setCompanyForm((current) => ({ ...current, zipCode: onlyDigits(event.target.value) }))} placeholder="_____-___" /><button className="lookup-button" type="button" onClick={handleLookupCep} disabled={isCepLoading}>{isCepLoading ? 'Buscando...' : 'Buscar'}</button></div>{cepError ? <span className="field-error">{cepError}</span> : null}</label><label>Endereço<input value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} /></label><label>Número<input value={companyForm.number} onChange={(event) => setCompanyForm((current) => ({ ...current, number: event.target.value }))} /></label><label>Complemento<input value={companyForm.complement} onChange={(event) => setCompanyForm((current) => ({ ...current, complement: event.target.value }))} /></label><label>Bairro<input value={companyForm.neighborhood} onChange={(event) => setCompanyForm((current) => ({ ...current, neighborhood: event.target.value }))} /></label><label>Estado<select value={companyForm.state} onChange={(event) => setCompanyForm((current) => ({ ...current, state: event.target.value, city: '' }))} required><option value="">Selecione o estado...</option>{BRAZIL_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></label><label>Cidade{cityOptions.length > 0 ? <select value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required><option value="">Selecione a cidade...</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}{companyForm.city && !cityOptions.includes(companyForm.city) ? <option value={companyForm.city}>{companyForm.city}</option> : null}</select> : <input value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required />}</label><label>País<input value={companyForm.country} onChange={(event) => setCompanyForm((current) => ({ ...current, country: event.target.value }))} /></label></div></section></div><div className="companies-form-footer"><button className="companies-button companies-button--ghost" type="button" onClick={closeModal}>Cancelar</button><button className="companies-button companies-button--primary" type="submit">{isEditingCompany ? 'Salvar alterações' : 'Cadastrar'}</button></div></form> : null}
      </section></div> : null}
    </main>
  );
}
