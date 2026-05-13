'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import '../companies.css';

type AccountRole = 'ADMIN' | 'USER';
type CompanyRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'ADMIN_VIEW';
type ClientType = 'PJ' | 'PF' | 'EXTERIOR';
type ClientTab = 'contact' | 'address' | 'bank';

interface StoredUser {
  id: string;
  name: string;
  email: string;
  accountRole: AccountRole;
}

interface Company {
  id: string;
  legalName: string;
  tradeName?: string | null;
  cnpj: string;
  municipalRegistration?: string | null;
  city: string;
  state: string;
  taxRegime: string;
  isActive: boolean;
  role: CompanyRole;
}

interface CreateCompanyForm {
  cnpj: string;
  legalName: string;
  tradeName: string;
  registrationStatus: string;
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
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  pixKey: string;
  mainActivity: string;
  legalNature: string;
  taxRegime: string;
  serviceCodeDefault: string;
}

interface InviteUserForm {
  companyId: string;
  name: string;
  email: string;
  role: 'OPERATOR' | 'VIEWER' | 'ADMIN';
}

const emptyCompanyForm: CreateCompanyForm = {
  cnpj: '',
  legalName: '',
  tradeName: '',
  registrationStatus: '',
  municipalRegistration: '',
  city: '',
  state: '',
  country: 'Brasil',
  zipCode: '',
  address: '',
  number: '',
  complement: '',
  neighborhood: '',
  email: '',
  phone: '',
  mobile: '',
  contactPerson: '',
  website: '',
  bankName: '',
  bankAgency: '',
  bankAccount: '',
  pixKey: '',
  mainActivity: '',
  legalNature: '',
  taxRegime: 'Não informado',
  serviceCodeDefault: '',
};

const emptyInviteForm: InviteUserForm = {
  companyId: '',
  name: '',
  email: '',
  role: 'OPERATOR',
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatCnpj(cnpj: string) {
  const digits = onlyDigits(cnpj).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatCep(cep: string) {
  const digits = onlyDigits(cep).slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'Z';
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [clientType, setClientType] = useState<ClientType>('PJ');
  const [activeClientTab, setActiveClientTab] = useState<ClientTab>('contact');
  const [companyForm, setCompanyForm] = useState<CreateCompanyForm>(emptyCompanyForm);
  const [inviteForm, setInviteForm] = useState<InviteUserForm>(emptyInviteForm);

  const isAdmin = user?.accountRole === 'ADMIN';
  const visibleCompanies = useMemo(() => companies, [companies]);

  useEffect(() => {
    const token = localStorage.getItem('nfse_access_token');
    const storedUser = localStorage.getItem('nfse_user');

    if (!token) {
      router.replace('/login');
      return;
    }

    if (storedUser) {
      setUser(JSON.parse(storedUser) as StoredUser);
    }

    void loadCompanies(search);
  }, [router]);

  async function loadCompanies(searchTerm = '') {
    const token = localStorage.getItem('nfse_access_token');

    if (!token) {
      router.replace('/login');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const params = searchTerm.trim() ? `?search=${encodeURIComponent(searchTerm.trim())}` : '';
      const response = await fetch(`http://localhost:3333/companies${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (!response.ok) {
        setError('Não foi possível carregar as empresas.');
        return;
      }

      const data = (await response.json()) as Company[];
      setCompanies(data);

      if (data.length > 0 && !inviteForm.companyId) {
        setInviteForm((current) => ({ ...current, companyId: data[0].id }));
      }
    } catch {
      setError('Não foi possível conectar com a API. Verifique se o backend está rodando.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLookupCnpj() {
    const token = localStorage.getItem('nfse_access_token');
    const cnpj = onlyDigits(companyForm.cnpj);

    setLookupError('');
    setError('');
    setSuccess('');

    if (cnpj.length !== 14) {
      setLookupError('CNPJ inválido.');
      return;
    }

    if (!token) {
      router.replace('/login');
      return;
    }

    setIsLookupLoading(true);

    try {
      const response = await fetch(`http://localhost:3333/companies/lookup/cnpj?cnpj=${cnpj}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        setLookupError(data.message || 'CNPJ não encontrado.');
        return;
      }

      setCompanyForm((current) => ({
        ...current,
        ...data,
        cnpj: data.cnpj || cnpj,
        taxRegime: current.taxRegime || 'Não informado',
      }));
      setSuccess('Dados cadastrais localizados. Confira as informações antes de cadastrar.');
    } catch {
      setLookupError('Não foi possível consultar o CNPJ agora. Tente novamente.');
    } finally {
      setIsLookupLoading(false);
    }
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadCompanies(search);
  }

  async function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem('nfse_access_token');

    if (!token) {
      router.replace('/login');
      return;
    }

    setError('');
    setSuccess('');
    setLookupError('');

    if (!companyForm.legalName || !companyForm.city || !companyForm.state) {
      setError('Busque o CNPJ ou preencha razão social, cidade e UF antes de cadastrar.');
      return;
    }

    try {
      const response = await fetch('http://localhost:3333/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...companyForm,
          cnpj: onlyDigits(companyForm.cnpj),
          zipCode: onlyDigits(companyForm.zipCode),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Não foi possível criar a empresa.');
        return;
      }

      setSuccess('Empresa cadastrada com sucesso. As configurações fiscais serão feitas dentro da empresa.');
      setCompanyForm(emptyCompanyForm);
      setShowCreateForm(false);
      await loadCompanies(search);
    } catch {
      setError('Erro ao criar empresa. Verifique a API.');
    }
  }

  async function handleInviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem('nfse_access_token');

    if (!token) {
      router.replace('/login');
      return;
    }

    setError('');
    setSuccess('');

    try {
      const response = await fetch('http://localhost:3333/companies/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(inviteForm),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Não foi possível registrar o convite.');
        return;
      }

      setSuccess(data.message || 'Convite registrado com sucesso.');
      setInviteForm({ ...emptyInviteForm, companyId: inviteForm.companyId });
      setShowInviteForm(false);
    } catch {
      setError('Erro ao registrar convite. Verifique a API.');
    }
  }

  function handleLogout() {
    localStorage.removeItem('nfse_access_token');
    localStorage.removeItem('nfse_user');
    router.replace('/login');
  }

  function openCreateForm() {
    setShowCreateForm((value) => !value);
    setActiveClientTab('contact');
    setLookupError('');
  }

  return (
    <main className="companies-page">
      <header className="companies-header">
        <div>
          <p className="companies-eyebrow">Zip NFS-e</p>
          <h1>Minhas empresas</h1>
        </div>

        <form className="companies-search" onSubmit={handleSearchSubmit}>
          <input type="search" placeholder="Buscar em Minhas empresas..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </form>

        <div className="companies-actions">
          {isAdmin ? (
            <>
              <button className="companies-button companies-button--light" type="button" onClick={() => setShowInviteForm((value) => !value)}>
                ✉ Convidar usuários
              </button>
              <button className="companies-button companies-button--primary" type="button" onClick={openCreateForm}>
                + Criar empresa
              </button>
            </>
          ) : null}
          <button className="companies-button companies-button--ghost" type="button" onClick={handleLogout}>Sair</button>
        </div>
      </header>

      {user ? (
        <section className="companies-user-bar">
          <span>{user.name}</span>
          <strong>{isAdmin ? 'Administrador' : 'Usuário'}</strong>
        </section>
      ) : null}

      {error ? <p className="companies-alert companies-alert--error">{error}</p> : null}
      {success ? <p className="companies-alert companies-alert--success">{success}</p> : null}

      {isAdmin && showInviteForm ? (
        <section className="companies-panel">
          <div>
            <h2>Convidar usuário</h2>
            <p>Selecione a empresa que o novo usuário poderá acessar.</p>
          </div>
          <form className="companies-form" onSubmit={handleInviteUser}>
            <label>Empresa<select value={inviteForm.companyId} onChange={(event) => setInviteForm((current) => ({ ...current, companyId: event.target.value }))} required><option value="">Selecione uma empresa</option>{companies.map((company) => (<option key={company.id} value={company.id}>{company.legalName} - {formatCnpj(company.cnpj)}</option>))}</select></label>
            <label>Nome<input value={inviteForm.name} onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do usuário" /></label>
            <label>E-mail<input type="email" value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@empresa.com.br" required /></label>
            <label>Perfil na empresa<select value={inviteForm.role} onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value as InviteUserForm['role'] }))}><option value="OPERATOR">Operador</option><option value="VIEWER">Visualizador</option><option value="ADMIN">Administrador da empresa</option></select></label>
            <button className="companies-button companies-button--primary" type="submit">Enviar convite</button>
          </form>
        </section>
      ) : null}

      {isAdmin && showCreateForm ? (
        <section className="companies-panel companies-panel--client">
          <div className="companies-panel__header">
            <div>
              <h2>Novo cliente</h2>
              <p>Cadastro básico do CNPJ. As configurações de emissão de NFS-e ficarão dentro da empresa.</p>
            </div>
            <button className="companies-close" type="button" onClick={() => setShowCreateForm(false)}>×</button>
          </div>

          <form onSubmit={handleCreateCompany}>
            <div className="client-types" aria-label="Tipo de cliente">
              <button className={`client-type ${clientType === 'PJ' ? 'is-active' : ''}`} type="button" onClick={() => setClientType('PJ')}>▦<span>Pessoa Jurídica</span></button>
              <button className={`client-type ${clientType === 'PF' ? 'is-active' : ''}`} type="button" onClick={() => setClientType('PF')}>♙<span>Pessoa Física</span></button>
              <button className={`client-type ${clientType === 'EXTERIOR' ? 'is-active' : ''}`} type="button" onClick={() => setClientType('EXTERIOR')}>🌐<span>Exterior</span></button>
            </div>

            <div className="companies-form companies-form--client-top">
              <label className={lookupError ? 'is-invalid' : ''}>
                {clientType === 'PF' ? 'CPF' : clientType === 'EXTERIOR' ? 'Documento' : 'CNPJ'}
                <div className="lookup-row">
                  <input value={formatCnpj(companyForm.cnpj)} onChange={(event) => setCompanyForm((current) => ({ ...current, cnpj: onlyDigits(event.target.value) }))} placeholder="__/___.___/____-__" required />
                  {clientType === 'PJ' ? <button className="lookup-button" type="button" onClick={handleLookupCnpj} disabled={isLookupLoading}>{isLookupLoading ? 'Buscando...' : 'Buscar'}</button> : null}
                </div>
                {lookupError ? <span className="field-error">● {lookupError}</span> : null}
              </label>
              <label>Razão Social<input value={companyForm.legalName} onChange={(event) => setCompanyForm((current) => ({ ...current, legalName: event.target.value }))} required /></label>
              <label>Nome fantasia<input value={companyForm.tradeName} onChange={(event) => setCompanyForm((current) => ({ ...current, tradeName: event.target.value }))} /></label>
              <label>Inscrição Municipal<input value={companyForm.municipalRegistration} onChange={(event) => setCompanyForm((current) => ({ ...current, municipalRegistration: event.target.value }))} /></label>
            </div>

            <div className="client-tabs">
              <button className={activeClientTab === 'contact' ? 'is-active' : ''} type="button" onClick={() => setActiveClientTab('contact')}>Dados de contato</button>
              <button className={activeClientTab === 'address' ? 'is-active' : ''} type="button" onClick={() => setActiveClientTab('address')}>Endereço</button>
              <button className={activeClientTab === 'bank' ? 'is-active' : ''} type="button" onClick={() => setActiveClientTab('bank')}>Dados bancários</button>
            </div>

            {activeClientTab === 'contact' ? (
              <div className="companies-form companies-form--client-details">
                <label>E-mail(s) para envio <small>(separados por vírgula)</small><input value={companyForm.email} onChange={(event) => setCompanyForm((current) => ({ ...current, email: event.target.value }))} /></label>
                <label>Telefone<input value={companyForm.phone} onChange={(event) => setCompanyForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label>Celular<input value={companyForm.mobile} onChange={(event) => setCompanyForm((current) => ({ ...current, mobile: event.target.value }))} /></label>
                <label>Pessoa de contato<input value={companyForm.contactPerson} onChange={(event) => setCompanyForm((current) => ({ ...current, contactPerson: event.target.value }))} /></label>
                <label>Website<input value={companyForm.website} onChange={(event) => setCompanyForm((current) => ({ ...current, website: event.target.value }))} placeholder="https://" /></label>
              </div>
            ) : null}

            {activeClientTab === 'address' ? (
              <div className="companies-form companies-form--client-details">
                <label>CEP<input value={formatCep(companyForm.zipCode)} onChange={(event) => setCompanyForm((current) => ({ ...current, zipCode: onlyDigits(event.target.value) }))} /></label>
                <label>Endereço<input value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} /></label>
                <label>Número<input value={companyForm.number} onChange={(event) => setCompanyForm((current) => ({ ...current, number: event.target.value }))} /></label>
                <label>Complemento<input value={companyForm.complement} onChange={(event) => setCompanyForm((current) => ({ ...current, complement: event.target.value }))} /></label>
                <label>Bairro<input value={companyForm.neighborhood} onChange={(event) => setCompanyForm((current) => ({ ...current, neighborhood: event.target.value }))} /></label>
                <label>Estado<input value={companyForm.state} maxLength={2} onChange={(event) => setCompanyForm((current) => ({ ...current, state: event.target.value.toUpperCase() }))} required /></label>
                <label>Cidade<input value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required /></label>
                <label>País<input value={companyForm.country} onChange={(event) => setCompanyForm((current) => ({ ...current, country: event.target.value }))} /></label>
              </div>
            ) : null}

            {activeClientTab === 'bank' ? (
              <div className="companies-form companies-form--client-details">
                <label>Banco<input value={companyForm.bankName} onChange={(event) => setCompanyForm((current) => ({ ...current, bankName: event.target.value }))} /></label>
                <label>Agência<input value={companyForm.bankAgency} onChange={(event) => setCompanyForm((current) => ({ ...current, bankAgency: event.target.value }))} /></label>
                <label>Conta<input value={companyForm.bankAccount} onChange={(event) => setCompanyForm((current) => ({ ...current, bankAccount: event.target.value }))} /></label>
                <label>Chave PIX<input value={companyForm.pixKey} onChange={(event) => setCompanyForm((current) => ({ ...current, pixKey: event.target.value }))} /></label>
              </div>
            ) : null}

            <div className="companies-form-footer">
              <button className="companies-button companies-button--ghost" type="button" onClick={() => setShowCreateForm(false)}>Cancelar</button>
              <button className="companies-button companies-button--primary" type="submit">Cadastrar</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="companies-grid" aria-label="Lista de empresas">
        {isLoading ? <p className="companies-empty">Carregando empresas...</p> : null}
        {!isLoading && visibleCompanies.length === 0 ? <p className="companies-empty">Nenhuma empresa encontrada.</p> : null}
        {visibleCompanies.map((company) => (
          <article className="company-card" key={company.id}>
            <div className="company-card__menu" aria-hidden="true">⋮</div>
            <button className="company-card__content" type="button">
              <h2>{company.legalName}</h2>
              <p>{formatCnpj(company.cnpj)}</p>
              <div className="company-card__meta"><span>{company.city}/{company.state}</span><span>{company.taxRegime}</span></div>
              <div className="company-card__footer"><span className="company-card__badge">{initials(company.legalName)}</span>{company.role ? <span className="company-card__role">{company.role === 'ADMIN_VIEW' ? 'Visão geral' : company.role}</span> : null}</div>
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
