'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BRAZIL_STATES, CITY_OPTIONS } from '../address-options';
import { ClientType, formatCep, formatCnpj, formatDocument, isValidCpf, onlyDigits } from '../document-utils';
import { ClientTypeIcon } from '../company-form-helpers';
import '../companies.css';

type AccountRole = 'ADMIN' | 'USER';
type CompanyRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'ADMIN_VIEW';
type ClientTab = 'contact' | 'address' | 'bank';
type CompanyUserStatus = 'ACTIVE' | 'BLOCKED' | 'DISABLED';

type CompanyAccessUser = {
  id: string;
  name: string;
  email: string;
  role: CompanyRole;
  status: CompanyUserStatus;
  isActive: boolean;
  accountRole: AccountRole;
};

type StoredUser = { id: string; name: string; email: string; accountRole: AccountRole };
type Company = { id: string; legalName: string; tradeName?: string | null; cnpj: string; city: string; state: string; taxRegime: string; role: CompanyRole };

type CreateCompanyForm = {
  document: string;
  legalName: string;
  tradeName: string;
  municipalRegistration: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  email: string;
  phone: string;
  mobile: string;
  contactPerson: string;
  website: string;
  registrationStatus: string;
  mainActivity: string;
  legalNature: string;
  taxRegime: string;
  serviceCodeDefault: string;
};

type InviteUserForm = { companyIds: string[]; name: string; email: string; role: 'OPERATOR' | 'VIEWER' | 'ADMIN' };

const emptyCompanyForm: CreateCompanyForm = {
  document: '', legalName: '', tradeName: '', municipalRegistration: '', city: '', state: '', country: 'Brasil', zipCode: '', address: '', number: '', complement: '', neighborhood: '', email: '', phone: '', mobile: '', contactPerson: '', website: '', registrationStatus: '', mainActivity: '', legalNature: '', taxRegime: 'Não informado', serviceCodeDefault: '',
};
const emptyInviteForm: InviteUserForm = { companyIds: [], name: '', email: '', role: 'OPERATOR' };

function roleLabel(role: string) {
  const labels: Record<string, string> = { OWNER: 'Responsável', ADMIN: 'Administrador', OPERATOR: 'Operador', VIEWER: 'Visualizador', ADMIN_VIEW: 'Administrador' };
  return labels[role] || role;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { ACTIVE: 'Ativo', BLOCKED: 'Bloqueado', DISABLED: 'Desativado' };
  return labels[status] || status;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [cepError, setCepError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [openMenuCompanyId, setOpenMenuCompanyId] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<CompanyAccessUser[]>([]);
  const [clientType, setClientType] = useState<ClientType>('PJ');
  const [activeClientTab, setActiveClientTab] = useState<ClientTab>('contact');
  const [companyForm, setCompanyForm] = useState<CreateCompanyForm>(emptyCompanyForm);
  const [inviteForm, setInviteForm] = useState<InviteUserForm>(emptyInviteForm);

  const isAdmin = user?.accountRole === 'ADMIN';
  const cityOptions = companyForm.state ? CITY_OPTIONS[companyForm.state] || [] : [];
  const visibleCompanies = useMemo(() => companies, [companies]);

  useEffect(() => {
    const token = localStorage.getItem('nfse_access_token');
    const storedUser = localStorage.getItem('nfse_user');
    if (!token) { router.replace('/login'); return; }
    if (storedUser) setUser(JSON.parse(storedUser) as StoredUser);
    void loadCompanies(search);
  }, [router]);

  async function requestApi(path: string, options: RequestInit = {}) {
    const token = localStorage.getItem('nfse_access_token');
    if (!token) { router.replace('/login'); throw new Error('Sessão expirada.'); }
    const response = await fetch(`http://localhost:3333${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message || 'Não foi possível concluir a solicitação.');
    return data;
  }

  async function loadCompanies(searchTerm = '') {
    setIsLoading(true); setError('');
    try {
      const params = searchTerm.trim() ? `?search=${encodeURIComponent(searchTerm.trim())}` : '';
      const data = await requestApi(`/companies${params}`);
      setCompanies(data as Company[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as empresas.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLookupCnpj() {
    const cnpj = onlyDigits(companyForm.document);
    setLookupError(''); setError(''); setSuccess('');
    if (cnpj.length !== 14) { setLookupError('CNPJ inválido.'); return; }
    setIsLookupLoading(true);
    try {
      const data = await requestApi(`/companies/lookup/cnpj?cnpj=${cnpj}`);
      setCompanyForm((current) => ({ ...current, ...data, document: data.cnpj || cnpj, taxRegime: current.taxRegime || 'Não informado' }));
      setSuccess('Dados cadastrais localizados. Confira as informações antes de cadastrar.');
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Não foi possível consultar o CNPJ agora.');
    } finally {
      setIsLookupLoading(false);
    }
  }

  async function handleLookupCep() {
    const cep = onlyDigits(companyForm.zipCode);
    setCepError('');
    if (cep.length !== 8) { setCepError('CEP inválido.'); return; }
    setIsCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!response.ok || data.erro) { setCepError('CEP não encontrado.'); return; }
      setCompanyForm((current) => ({ ...current, zipCode: cep, address: data.logradouro || current.address, complement: data.complemento || current.complement, neighborhood: data.bairro || current.neighborhood, state: data.uf || current.state, city: data.localidade || current.city, country: 'Brasil' }));
    } catch { setCepError('Não foi possível buscar o CEP agora.'); }
    finally { setIsCepLoading(false); }
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await loadCompanies(search); }

  async function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setSuccess(''); setLookupError('');
    if (clientType === 'PF' && !isValidCpf(companyForm.document)) { setLookupError('CPF inválido.'); return; }
    if (clientType === 'EXTERIOR' && !companyForm.document.trim()) { setLookupError('Documento obrigatório.'); return; }
    if (clientType !== 'PJ') { setError('Cadastro definitivo de Pessoa Física e Exterior será conectado ao backend na próxima etapa.'); return; }
    if (!companyForm.legalName || !companyForm.city || !companyForm.state) { setError('Busque o CNPJ ou preencha razão social, cidade e UF antes de cadastrar.'); return; }
    try {
      await requestApi('/companies', { method: 'POST', body: JSON.stringify({ ...companyForm, cnpj: onlyDigits(companyForm.document), zipCode: onlyDigits(companyForm.zipCode) }) });
      setSuccess('Empresa cadastrada com sucesso. As configurações fiscais serão feitas dentro da empresa.');
      setCompanyForm(emptyCompanyForm); setShowCreateForm(false); await loadCompanies(search);
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao criar empresa.'); }
  }

  async function handleInviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setSuccess(''); setInviteLink('');
    if (inviteForm.companyIds.length === 0) { setError('Selecione ao menos uma empresa para o usuário acessar.'); return; }
    try {
      const data = await requestApi('/companies/invitations', { method: 'POST', body: JSON.stringify(inviteForm) });
      const linkToken = data.inviteLinkToken || data.invitation?.groupToken || data.invitation?.token;
      setInviteLink(linkToken ? `${window.location.origin}/convite/${linkToken}` : '');
      setSuccess(data.message || 'Convite registrado com sucesso.');
      setInviteForm(emptyInviteForm);
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao registrar convite.'); }
  }

  function toggleInviteCompany(companyId: string) {
    setInviteForm((current) => ({ ...current, companyIds: current.companyIds.includes(companyId) ? current.companyIds.filter((id) => id !== companyId) : [...current.companyIds, companyId] }));
  }

  async function openUsersModal(company: Company) {
    setSelectedCompany(company); setShowUsersModal(true); setOpenMenuCompanyId(null); setIsUsersLoading(true); setError('');
    try { setCompanyUsers(await requestApi(`/companies/${company.id}/users`) as CompanyAccessUser[]); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar usuários.'); }
    finally { setIsUsersLoading(false); }
  }

  async function changeUserStatus(targetUser: CompanyAccessUser, action: 'block' | 'disable' | 'activate') {
    if (!selectedCompany) return;
    try {
      const data = await requestApi(`/companies/${selectedCompany.id}/users/${targetUser.id}/${action}`, { method: 'PATCH' });
      setSuccess(data.message || 'Usuário atualizado.');
      await openUsersModal(selectedCompany);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar usuário.'); }
  }

  async function removeCompanyUser(targetUser: CompanyAccessUser) {
    if (!selectedCompany) return;
    try {
      const data = await requestApi(`/companies/${selectedCompany.id}/users/${targetUser.id}`, { method: 'DELETE' });
      setSuccess(data.message || 'Usuário removido.');
      await openUsersModal(selectedCompany);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível remover usuário.'); }
  }

  function handleLogout() { localStorage.removeItem('nfse_access_token'); localStorage.removeItem('nfse_user'); router.replace('/login'); }
  function openInviteForm() { setShowInviteForm(true); setShowCreateForm(false); setShowUsersModal(false); setError(''); setSuccess(''); setInviteLink(''); }
  function openCreateForm() { setShowCreateForm(true); setShowInviteForm(false); setShowUsersModal(false); setActiveClientTab('contact'); setLookupError(''); setCepError(''); setError(''); setSuccess(''); }
  function closeModal() { setShowCreateForm(false); setShowInviteForm(false); setShowUsersModal(false); }
  function handleClientTypeChange(type: ClientType) { setClientType(type); setLookupError(''); setCompanyForm((current) => ({ ...current, document: '' })); }

  return (
    <main className="companies-page">
      <header className="companies-header">
        <div><p className="companies-eyebrow">Zip NFS-e</p><h1>Minhas empresas</h1></div>
        <form className="companies-search" onSubmit={handleSearchSubmit}><input type="search" placeholder="Buscar em Minhas empresas..." value={search} onChange={(event) => setSearch(event.target.value)} /></form>
        <div className="companies-actions">{isAdmin ? <><button className="companies-button companies-button--light" type="button" onClick={openInviteForm}>✉ Convidar usuários</button><button className="companies-button companies-button--primary" type="button" onClick={openCreateForm}>+ Criar empresa</button></> : null}<button className="companies-button companies-button--ghost" type="button" onClick={handleLogout}>Sair</button></div>
      </header>

      {user ? <section className="companies-user-bar"><span>{user.name}</span><strong>{isAdmin ? 'Administrador' : 'Usuário'}</strong></section> : null}
      {error ? <p className="companies-alert companies-alert--error">{error}</p> : null}
      {success ? <p className="companies-alert companies-alert--success">{success}</p> : null}
      {inviteLink ? <div className="companies-alert companies-alert--success"><strong>Link de convite para teste:</strong><br /><a href={inviteLink}>{inviteLink}</a></div> : null}

      <section className="companies-grid" aria-label="Lista de empresas">
        {isLoading ? <p className="companies-empty">Carregando empresas...</p> : null}
        {!isLoading && visibleCompanies.length === 0 ? <p className="companies-empty">Nenhuma empresa encontrada.</p> : null}
        {visibleCompanies.map((company) => (
          <article className="company-card" key={company.id}>
            <div className="company-card__menu-wrap">
              <button className="company-card__menu-button" type="button" onClick={() => setOpenMenuCompanyId(openMenuCompanyId === company.id ? null : company.id)}>⋮</button>
              {openMenuCompanyId === company.id ? (
                <div className="company-card__dropdown">
                  <button type="button" onClick={() => { setOpenMenuCompanyId(null); setSuccess('Edição de empresa será feita na próxima etapa.'); }}>Editar Empresa</button>
                  <button type="button" onClick={() => void openUsersModal(company)}>Ver usuários</button>
                </div>
              ) : null}
            </div>
            <button className="company-card__content" type="button">
              <h2 title={company.legalName}>{company.legalName}</h2>
              <p>{formatCnpj(company.cnpj)}</p>
              <div className="company-card__meta"><span>{company.city}/{company.state}</span><span>{company.taxRegime}</span></div>
            </button>
          </article>
        ))}
      </section>

      {(showInviteForm || showCreateForm || showUsersModal) ? (
        <div className="modal-backdrop" role="presentation">
          <section className={`modal-card ${showCreateForm ? 'modal-card--wide' : ''}`} role="dialog" aria-modal="true">
            <button className="companies-close modal-close" type="button" onClick={closeModal}>×</button>

            {showInviteForm ? (
              <>
                <div className="modal-heading"><h2>Convidar usuário</h2><p>Informe os dados do usuário e selecione uma ou mais empresas que ele poderá acessar.</p></div>
                <form className="companies-form invite-form-grid" onSubmit={handleInviteUser}>
                  <label>Nome<input value={inviteForm.name} onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do usuário" /></label>
                  <label>E-mail<input type="email" value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@empresa.com.br" required /></label>
                  <label>Perfil<select value={inviteForm.role} onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value as InviteUserForm['role'] }))}><option value="OPERATOR">Operador</option><option value="VIEWER">Visualizador</option><option value="ADMIN">Administrador da empresa</option></select></label>
                  <fieldset className="companies-checkboxes">
                    <legend>Selecione a(s) empresa(s) para convidar</legend>
                    {companies.length === 0 ? <p>Nenhuma empresa cadastrada para selecionar.</p> : companies.map((company) => (
                      <label key={company.id} className="company-checkbox company-checkbox--compact">
                        <input type="checkbox" checked={inviteForm.companyIds.includes(company.id)} onChange={() => toggleInviteCompany(company.id)} />
                        <span title={company.legalName}>{company.legalName}</span>
                      </label>
                    ))}
                  </fieldset>
                  <button className="companies-button companies-button--primary" type="submit">Enviar convite</button>
                </form>
              </>
            ) : null}

            {showUsersModal && selectedCompany ? (
              <>
                <div className="modal-heading"><h2>Usuários liberados</h2><p>{selectedCompany.legalName}</p></div>
                <div className="users-list">
                  {isUsersLoading ? <p className="companies-empty">Carregando usuários...</p> : null}
                  {!isUsersLoading && companyUsers.length === 0 ? <p className="companies-empty">Nenhum usuário vinculado a esta empresa.</p> : null}
                  {companyUsers.map((item) => (
                    <div className="user-row" key={item.id}>
                      <div><strong>{item.name}</strong><span>{item.email}</span></div>
                      <div className="user-row__meta"><span>{roleLabel(item.role)}</span><span>{statusLabel(item.status)}</span></div>
                      <div className="user-row__actions">
                        <button type="button" onClick={() => void changeUserStatus(item, 'block')}>Bloquear</button>
                        <button type="button" onClick={() => void changeUserStatus(item, 'disable')}>Desativar</button>
                        <button type="button" onClick={() => void changeUserStatus(item, 'activate')}>Ativar</button>
                        <button type="button" title="Há lançamentos vinculados a esse usuário, não é possível excluir" onClick={() => void removeCompanyUser(item)}>Excluir</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {showCreateForm ? (
              <form onSubmit={handleCreateCompany}>
                <div className="modal-heading"><h2>Novo cliente</h2><p>Cadastro básico do cliente. As configurações de emissão de NFS-e ficarão dentro da empresa.</p></div>
                <div className="client-types" aria-label="Tipo de cliente"><button className={`client-type ${clientType === 'PJ' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('PJ')}><span className="client-type__icon"><ClientTypeIcon type="PJ" /></span><span>Pessoa Jurídica</span></button><button className={`client-type ${clientType === 'PF' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('PF')}><span className="client-type__icon"><ClientTypeIcon type="PF" /></span><span>Pessoa Física</span></button><button className={`client-type ${clientType === 'EXTERIOR' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('EXTERIOR')}><span className="client-type__icon"><ClientTypeIcon type="EXTERIOR" /></span><span>Exterior</span></button></div>
                <div className="companies-form companies-form--client-top"><label className={lookupError ? 'is-invalid' : ''}>{clientType === 'PF' ? 'CPF' : clientType === 'EXTERIOR' ? 'Documento' : 'CNPJ'}<div className="lookup-row"><input value={formatDocument(companyForm.document, clientType)} onChange={(event) => setCompanyForm((current) => ({ ...current, document: clientType === 'EXTERIOR' ? event.target.value.toUpperCase() : onlyDigits(event.target.value) }))} placeholder={clientType === 'PF' ? '___.___.___-__' : clientType === 'PJ' ? '__.___.___/____-__' : 'Documento estrangeiro'} required />{clientType === 'PJ' ? <button className="lookup-button" type="button" onClick={handleLookupCnpj} disabled={isLookupLoading}>{isLookupLoading ? 'Buscando...' : 'Buscar'}</button> : null}</div>{lookupError ? <span className="field-error">● {lookupError}</span> : null}</label><label>Razão Social<input value={companyForm.legalName} onChange={(event) => setCompanyForm((current) => ({ ...current, legalName: event.target.value }))} required /></label><label>Nome fantasia<input value={companyForm.tradeName} onChange={(event) => setCompanyForm((current) => ({ ...current, tradeName: event.target.value }))} /></label><label>Inscrição Municipal<input value={companyForm.municipalRegistration} onChange={(event) => setCompanyForm((current) => ({ ...current, municipalRegistration: event.target.value }))} /></label></div>
                <div className="client-tabs"><button className={activeClientTab === 'contact' ? 'is-active' : ''} type="button" onClick={() => setActiveClientTab('contact')}>Dados de contato</button><button className={activeClientTab === 'address' ? 'is-active' : ''} type="button" onClick={() => setActiveClientTab('address')}>Endereço</button><button className={activeClientTab === 'bank' ? 'is-active' : ''} type="button" onClick={() => setActiveClientTab('bank')}>Dados bancários</button></div>
                {activeClientTab === 'contact' ? <div className="companies-form companies-form--client-details"><label>E-mail(s) para envio <small>(separados por vírgula)</small><input value={companyForm.email} onChange={(event) => setCompanyForm((current) => ({ ...current, email: event.target.value }))} /></label><label>Telefone<input value={companyForm.phone} onChange={(event) => setCompanyForm((current) => ({ ...current, phone: event.target.value }))} /></label><label>Celular<input value={companyForm.mobile} onChange={(event) => setCompanyForm((current) => ({ ...current, mobile: event.target.value }))} /></label><label>Pessoa de contato<input value={companyForm.contactPerson} onChange={(event) => setCompanyForm((current) => ({ ...current, contactPerson: event.target.value }))} /></label><label>Website<input value={companyForm.website} onChange={(event) => setCompanyForm((current) => ({ ...current, website: event.target.value }))} placeholder="https://" /></label></div> : null}
                {activeClientTab === 'address' ? <div className="companies-form companies-form--client-details"><label className={cepError ? 'is-invalid' : ''}>CEP<div className="lookup-row"><input value={formatCep(companyForm.zipCode)} onChange={(event) => setCompanyForm((current) => ({ ...current, zipCode: onlyDigits(event.target.value) }))} placeholder="_____-___" /><button className="lookup-button" type="button" onClick={handleLookupCep} disabled={isCepLoading}>{isCepLoading ? 'Buscando...' : 'Buscar'}</button></div>{cepError ? <span className="field-error">● {cepError}</span> : null}</label><label>Endereço<input value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} /></label><label>Número<input value={companyForm.number} onChange={(event) => setCompanyForm((current) => ({ ...current, number: event.target.value }))} /></label><label>Complemento<input value={companyForm.complement} onChange={(event) => setCompanyForm((current) => ({ ...current, complement: event.target.value }))} /></label><label>Bairro<input value={companyForm.neighborhood} onChange={(event) => setCompanyForm((current) => ({ ...current, neighborhood: event.target.value }))} /></label><label>Estado<select value={companyForm.state} onChange={(event) => setCompanyForm((current) => ({ ...current, state: event.target.value, city: '' }))} required><option value="">Selecione o estado...</option>{BRAZIL_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></label><label>Cidade{cityOptions.length > 0 ? <select value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required><option value="">Selecione a cidade...</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}{companyForm.city && !cityOptions.includes(companyForm.city) ? <option value={companyForm.city}>{companyForm.city}</option> : null}</select> : <input value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required />}</label><label>País<input value={companyForm.country} onChange={(event) => setCompanyForm((current) => ({ ...current, country: event.target.value }))} /></label></div> : null}
                {activeClientTab === 'bank' ? <div className="companies-form companies-form--client-details"><p className="companies-empty">Dados bancários habilitados para cadastro em etapa futura.</p></div> : null}
                <div className="companies-form-footer"><button className="companies-button companies-button--ghost" type="button" onClick={closeModal}>Cancelar</button><button className="companies-button companies-button--primary" type="submit">Cadastrar</button></div>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
