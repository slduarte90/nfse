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

interface StoredUser { id: string; name: string; email: string; accountRole: AccountRole; }
interface Company { id: string; legalName: string; tradeName?: string | null; cnpj: string; city: string; state: string; taxRegime: string; role: CompanyRole; }
interface CreateCompanyForm { document: string; legalName: string; tradeName: string; municipalRegistration: string; city: string; state: string; country: string; zipCode: string; address: string; number: string; complement: string; neighborhood: string; email: string; phone: string; mobile: string; contactPerson: string; website: string; registrationStatus: string; mainActivity: string; legalNature: string; taxRegime: string; serviceCodeDefault: string; }
interface InviteUserForm { companyIds: string[]; name: string; email: string; role: 'OPERATOR' | 'VIEWER' | 'ADMIN'; }

const emptyCompanyForm: CreateCompanyForm = { document: '', legalName: '', tradeName: '', municipalRegistration: '', city: '', state: '', country: 'Brasil', zipCode: '', address: '', number: '', complement: '', neighborhood: '', email: '', phone: '', mobile: '', contactPerson: '', website: '', registrationStatus: '', mainActivity: '', legalNature: '', taxRegime: 'Não informado', serviceCodeDefault: '' };
const emptyInviteForm: InviteUserForm = { companyIds: [], name: '', email: '', role: 'OPERATOR' };

function initials(name: string) { return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'Z'; }

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [cepError, setCepError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [clientType, setClientType] = useState<ClientType>('PJ');
  const [activeClientTab, setActiveClientTab] = useState<ClientTab>('contact');
  const [companyForm, setCompanyForm] = useState<CreateCompanyForm>(emptyCompanyForm);
  const [inviteForm, setInviteForm] = useState<InviteUserForm>(emptyInviteForm);

  const isAdmin = user?.accountRole === 'ADMIN';
  const visibleCompanies = useMemo(() => companies, [companies]);
  const cityOptions = companyForm.state ? CITY_OPTIONS[companyForm.state] || [] : [];

  useEffect(() => {
    const token = localStorage.getItem('nfse_access_token');
    const storedUser = localStorage.getItem('nfse_user');
    if (!token) { router.replace('/login'); return; }
    if (storedUser) setUser(JSON.parse(storedUser) as StoredUser);
    void loadCompanies(search);
  }, [router]);

  async function loadCompanies(searchTerm = '') {
    const token = localStorage.getItem('nfse_access_token');
    if (!token) { router.replace('/login'); return; }
    setIsLoading(true); setError('');
    try {
      const params = searchTerm.trim() ? `?search=${encodeURIComponent(searchTerm.trim())}` : '';
      const response = await fetch(`http://localhost:3333/companies${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) { handleLogout(); return; }
      if (!response.ok) { setError('Não foi possível carregar as empresas.'); return; }
      const data = (await response.json()) as Company[];
      setCompanies(data);
    } catch { setError('Não foi possível conectar com a API. Verifique se o backend está rodando.'); }
    finally { setIsLoading(false); }
  }

  async function handleLookupCnpj() {
    const token = localStorage.getItem('nfse_access_token');
    const cnpj = onlyDigits(companyForm.document);
    setLookupError(''); setError(''); setSuccess('');
    if (cnpj.length !== 14) { setLookupError('CNPJ inválido.'); return; }
    if (!token) { router.replace('/login'); return; }
    setIsLookupLoading(true);
    try {
      const response = await fetch(`http://localhost:3333/companies/lookup/cnpj?cnpj=${cnpj}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) { setLookupError(data.message || 'CNPJ não encontrado.'); return; }
      setCompanyForm((current) => ({ ...current, ...data, document: data.cnpj || cnpj, taxRegime: current.taxRegime || 'Não informado' }));
      setSuccess('Dados cadastrais localizados. Confira as informações antes de cadastrar.');
    } catch { setLookupError('Não foi possível consultar o CNPJ agora. Tente novamente.'); }
    finally { setIsLookupLoading(false); }
  }

  async function handleLookupCep() {
    const cep = onlyDigits(companyForm.zipCode); setCepError('');
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
    const token = localStorage.getItem('nfse_access_token');
    if (!token) { router.replace('/login'); return; }
    setError(''); setSuccess(''); setLookupError('');
    if (clientType === 'PF' && !isValidCpf(companyForm.document)) { setLookupError('CPF inválido.'); return; }
    if (clientType === 'EXTERIOR' && !companyForm.document.trim()) { setLookupError('Documento obrigatório.'); return; }
    if (clientType !== 'PJ') { setError('Cadastro definitivo de Pessoa Física e Exterior será conectado ao backend na próxima etapa.'); return; }
    if (!companyForm.legalName || !companyForm.city || !companyForm.state) { setError('Busque o CNPJ ou preencha razão social, cidade e UF antes de cadastrar.'); return; }
    try {
      const response = await fetch('http://localhost:3333/companies', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...companyForm, cnpj: onlyDigits(companyForm.document), zipCode: onlyDigits(companyForm.zipCode) }) });
      const data = await response.json();
      if (!response.ok) { setError(data.message || 'Não foi possível criar a empresa.'); return; }
      setSuccess('Empresa cadastrada com sucesso. As configurações fiscais serão feitas dentro da empresa.');
      setCompanyForm(emptyCompanyForm); setShowCreateForm(false); await loadCompanies(search);
    } catch { setError('Erro ao criar empresa. Verifique a API.'); }
  }

  function toggleInviteCompany(companyId: string) {
    setInviteForm((current) => ({
      ...current,
      companyIds: current.companyIds.includes(companyId)
        ? current.companyIds.filter((id) => id !== companyId)
        : [...current.companyIds, companyId],
    }));
  }

  async function handleInviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem('nfse_access_token');
    if (!token) { router.replace('/login'); return; }
    setError(''); setSuccess(''); setInviteLink('');
    if (inviteForm.companyIds.length === 0) { setError('Selecione ao menos uma empresa para o usuário acessar.'); return; }
    try {
      const response = await fetch('http://localhost:3333/companies/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(inviteForm) });
      const data = await response.json();
      if (!response.ok) { setError(data.message || 'Não foi possível registrar o convite.'); return; }
      const linkToken = data.inviteLinkToken || data.invitation?.groupToken || data.invitation?.token;
      const link = linkToken ? `${window.location.origin}/convite/${linkToken}` : '';
      setInviteLink(link);
      setSuccess(data.message || 'Convite registrado com sucesso.');
      setInviteForm(emptyInviteForm);
    } catch { setError('Erro ao registrar convite. Verifique a API.'); }
  }

  function handleLogout() { localStorage.removeItem('nfse_access_token'); localStorage.removeItem('nfse_user'); router.replace('/login'); }
  function openCreateForm() { setShowCreateForm((value) => !value); setActiveClientTab('contact'); setLookupError(''); setCepError(''); }
  function handleClientTypeChange(type: ClientType) { setClientType(type); setLookupError(''); setCompanyForm((current) => ({ ...current, document: '' })); }

  return (
    <main className="companies-page">
      <header className="companies-header">
        <div><p className="companies-eyebrow">Zip NFS-e</p><h1>Minhas empresas</h1></div>
        <form className="companies-search" onSubmit={handleSearchSubmit}><input type="search" placeholder="Buscar em Minhas empresas..." value={search} onChange={(event) => setSearch(event.target.value)} /></form>
        <div className="companies-actions">{isAdmin ? <><button className="companies-button companies-button--light" type="button" onClick={() => setShowInviteForm((value) => !value)}>✉ Convidar usuários</button><button className="companies-button companies-button--primary" type="button" onClick={openCreateForm}>+ Criar empresa</button></> : null}<button className="companies-button companies-button--ghost" type="button" onClick={handleLogout}>Sair</button></div>
      </header>

      {user ? <section className="companies-user-bar"><span>{user.name}</span><strong>{isAdmin ? 'Administrador' : 'Usuário'}</strong></section> : null}
      {error ? <p className="companies-alert companies-alert--error">{error}</p> : null}
      {success ? <p className="companies-alert companies-alert--success">{success}</p> : null}
      {inviteLink ? <div className="companies-alert companies-alert--success"><strong>Link de convite para teste:</strong><br /><a href={inviteLink}>{inviteLink}</a></div> : null}

      {isAdmin && showInviteForm ? (
        <section className="companies-panel">
          <div><h2>Convidar usuário</h2><p>Informe os dados do usuário e selecione uma ou mais empresas que ele poderá acessar.</p></div>
          <form className="companies-form invite-form-grid" onSubmit={handleInviteUser}>
            <label>Nome<input value={inviteForm.name} onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do usuário" /></label>
            <label>E-mail<input type="email" value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@empresa.com.br" required /></label>
            <label>Perfil<select value={inviteForm.role} onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value as InviteUserForm['role'] }))}><option value="OPERATOR">Operador</option><option value="VIEWER">Visualizador</option><option value="ADMIN">Administrador da empresa</option></select></label>
            <fieldset className="companies-checkboxes">
              <legend>Empresas liberadas para este usuário</legend>
              {companies.length === 0 ? <p>Nenhuma empresa cadastrada para selecionar.</p> : companies.map((company) => (
                <label key={company.id} className="company-checkbox">
                  <input type="checkbox" checked={inviteForm.companyIds.includes(company.id)} onChange={() => toggleInviteCompany(company.id)} />
                  <span><strong>{company.legalName}</strong><small>{formatCnpj(company.cnpj)} · {company.city}/{company.state}</small></span>
                </label>
              ))}
            </fieldset>
            <button className="companies-button companies-button--primary" type="submit">Enviar convite</button>
          </form>
        </section>
      ) : null}

      {isAdmin && showCreateForm ? (
        <section className="companies-panel companies-panel--client">
          <div className="companies-panel__header"><div><h2>Novo cliente</h2><p>Cadastro básico do cliente. As configurações de emissão de NFS-e ficarão dentro da empresa.</p></div><button className="companies-close" type="button" onClick={() => setShowCreateForm(false)}>×</button></div>
          <form onSubmit={handleCreateCompany}>
            <div className="client-types" aria-label="Tipo de cliente"><button className={`client-type ${clientType === 'PJ' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('PJ')}><span className="client-type__icon"><ClientTypeIcon type="PJ" /></span><span>Pessoa Jurídica</span></button><button className={`client-type ${clientType === 'PF' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('PF')}><span className="client-type__icon"><ClientTypeIcon type="PF" /></span><span>Pessoa Física</span></button><button className={`client-type ${clientType === 'EXTERIOR' ? 'is-active' : ''}`} type="button" onClick={() => handleClientTypeChange('EXTERIOR')}><span className="client-type__icon"><ClientTypeIcon type="EXTERIOR" /></span><span>Exterior</span></button></div>
            <div className="companies-form companies-form--client-top"><label className={lookupError ? 'is-invalid' : ''}>{clientType === 'PF' ? 'CPF' : clientType === 'EXTERIOR' ? 'Documento' : 'CNPJ'}<div className="lookup-row"><input value={formatDocument(companyForm.document, clientType)} onChange={(event) => setCompanyForm((current) => ({ ...current, document: clientType === 'EXTERIOR' ? event.target.value.toUpperCase() : onlyDigits(event.target.value) }))} placeholder={clientType === 'PF' ? '___.___.___-__' : clientType === 'PJ' ? '__.___.___/____-__' : 'Documento estrangeiro'} required />{clientType === 'PJ' ? <button className="lookup-button" type="button" onClick={handleLookupCnpj} disabled={isLookupLoading}>{isLookupLoading ? 'Buscando...' : 'Buscar'}</button> : null}</div>{lookupError ? <span className="field-error">● {lookupError}</span> : null}</label><label>Razão Social<input value={companyForm.legalName} onChange={(event) => setCompanyForm((current) => ({ ...current, legalName: event.target.value }))} required /></label><label>Nome fantasia<input value={companyForm.tradeName} onChange={(event) => setCompanyForm((current) => ({ ...current, tradeName: event.target.value }))} /></label><label>Inscrição Municipal<input value={companyForm.municipalRegistration} onChange={(event) => setCompanyForm((current) => ({ ...current, municipalRegistration: event.target.value }))} /></label></div>
            <div className="client-tabs"><button className={activeClientTab === 'contact' ? 'is-active' : ''} type="button" onClick={() => setActiveClientTab('contact')}>Dados de contato</button><button className={activeClientTab === 'address' ? 'is-active' : ''} type="button" onClick={() => setActiveClientTab('address')}>Endereço</button><button className={activeClientTab === 'bank' ? 'is-active' : ''} type="button" onClick={() => setActiveClientTab('bank')}>Dados bancários</button></div>
            {activeClientTab === 'contact' ? <div className="companies-form companies-form--client-details"><label>E-mail(s) para envio <small>(separados por vírgula)</small><input value={companyForm.email} onChange={(event) => setCompanyForm((current) => ({ ...current, email: event.target.value }))} /></label><label>Telefone<input value={companyForm.phone} onChange={(event) => setCompanyForm((current) => ({ ...current, phone: event.target.value }))} /></label><label>Celular<input value={companyForm.mobile} onChange={(event) => setCompanyForm((current) => ({ ...current, mobile: event.target.value }))} /></label><label>Pessoa de contato<input value={companyForm.contactPerson} onChange={(event) => setCompanyForm((current) => ({ ...current, contactPerson: event.target.value }))} /></label><label>Website<input value={companyForm.website} onChange={(event) => setCompanyForm((current) => ({ ...current, website: event.target.value }))} placeholder="https://" /></label></div> : null}
            {activeClientTab === 'address' ? <div className="companies-form companies-form--client-details"><label className={cepError ? 'is-invalid' : ''}>CEP<div className="lookup-row"><input value={formatCep(companyForm.zipCode)} onChange={(event) => setCompanyForm((current) => ({ ...current, zipCode: onlyDigits(event.target.value) }))} placeholder="_____-___" /><button className="lookup-button" type="button" onClick={handleLookupCep} disabled={isCepLoading}>{isCepLoading ? 'Buscando...' : 'Buscar'}</button></div>{cepError ? <span className="field-error">● {cepError}</span> : null}</label><label>Endereço<input value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} /></label><label>Número<input value={companyForm.number} onChange={(event) => setCompanyForm((current) => ({ ...current, number: event.target.value }))} /></label><label>Complemento<input value={companyForm.complement} onChange={(event) => setCompanyForm((current) => ({ ...current, complement: event.target.value }))} /></label><label>Bairro<input value={companyForm.neighborhood} onChange={(event) => setCompanyForm((current) => ({ ...current, neighborhood: event.target.value }))} /></label><label>Estado<select value={companyForm.state} onChange={(event) => setCompanyForm((current) => ({ ...current, state: event.target.value, city: '' }))} required><option value="">Selecione o estado...</option>{BRAZIL_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></label><label>Cidade{cityOptions.length > 0 ? <select value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required><option value="">Selecione a cidade...</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}{companyForm.city && !cityOptions.includes(companyForm.city) ? <option value={companyForm.city}>{companyForm.city}</option> : null}</select> : <input value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required />}</label><label>País<input value={companyForm.country} onChange={(event) => setCompanyForm((current) => ({ ...current, country: event.target.value }))} /></label></div> : null}
            {activeClientTab === 'bank' ? <div className="companies-form companies-form--client-details"><p className="companies-empty">Dados bancários habilitados para cadastro em etapa futura.</p></div> : null}
            <div className="companies-form-footer"><button className="companies-button companies-button--ghost" type="button" onClick={() => setShowCreateForm(false)}>Cancelar</button><button className="companies-button companies-button--primary" type="submit">Cadastrar</button></div>
          </form>
        </section>
      ) : null}

      <section className="companies-grid" aria-label="Lista de empresas">{isLoading ? <p className="companies-empty">Carregando empresas...</p> : null}{!isLoading && visibleCompanies.length === 0 ? <p className="companies-empty">Nenhuma empresa encontrada.</p> : null}{visibleCompanies.map((company) => <article className="company-card" key={company.id}><div className="company-card__menu" aria-hidden="true">⋮</div><button className="company-card__content" type="button"><h2>{company.legalName}</h2><p>{formatCnpj(company.cnpj)}</p><div className="company-card__meta"><span>{company.city}/{company.state}</span><span>{company.taxRegime}</span></div><div className="company-card__footer"><span className="company-card__badge">{initials(company.legalName)}</span>{company.role ? <span className="company-card__role">{company.role === 'ADMIN_VIEW' ? 'Visão geral' : company.role}</span> : null}</div></button></article>)}</section>
    </main>
  );
}
