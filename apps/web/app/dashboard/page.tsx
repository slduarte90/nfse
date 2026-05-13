'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import '../companies.css';

type AccountRole = 'ADMIN' | 'USER';
type CompanyRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'ADMIN_VIEW';

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

interface CompanyLookup {
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
  mainActivity: string;
  legalNature: string;
}

interface CreateCompanyForm extends CompanyLookup {
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
  mainActivity: '',
  legalNature: '',
  taxRegime: 'Nao informado',
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
        setError('Nao foi possivel carregar as empresas.');
        return;
      }

      const data = (await response.json()) as Company[];
      setCompanies(data);

      if (data.length > 0 && !inviteForm.companyId) {
        setInviteForm((current) => ({ ...current, companyId: data[0].id }));
      }
    } catch {
      setError('Nao foi possivel conectar com a API. Verifique se o backend esta rodando.');
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
      setLookupError('CNPJ invalido.');
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
        setLookupError(data.message || 'CNPJ nao encontrado.');
        return;
      }

      setCompanyForm((current) => ({
        ...current,
        ...data,
        cnpj: data.cnpj || cnpj,
        taxRegime: current.taxRegime || 'Nao informado',
      }));
      setSuccess('Dados cadastrais localizados. Confira as informacoes antes de cadastrar.');
    } catch {
      setLookupError('Nao foi possivel consultar o CNPJ agora.');
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
      setError('Busque o CNPJ ou preencha razao social, cidade e UF antes de cadastrar.');
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
        setError(data.message || 'Nao foi possivel criar a empresa.');
        return;
      }

      setSuccess('Empresa cadastrada com sucesso. As configuracoes fiscais serao feitas dentro da empresa.');
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
        setError(data.message || 'Nao foi possivel registrar o convite.');
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
                ✉ Convidar usuarios
              </button>
              <button className="companies-button companies-button--primary" type="button" onClick={() => setShowCreateForm((value) => !value)}>
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
          <strong>{isAdmin ? 'Administrador' : 'Usuario'}</strong>
        </section>
      ) : null}

      {error ? <p className="companies-alert companies-alert--error">{error}</p> : null}
      {success ? <p className="companies-alert companies-alert--success">{success}</p> : null}

      {isAdmin && showInviteForm ? (
        <section className="companies-panel">
          <div>
            <h2>Convidar usuario</h2>
            <p>Selecione a empresa que o novo usuario podera acessar.</p>
          </div>
          <form className="companies-form" onSubmit={handleInviteUser}>
            <label>Empresa<select value={inviteForm.companyId} onChange={(event) => setInviteForm((current) => ({ ...current, companyId: event.target.value }))} required><option value="">Selecione uma empresa</option>{companies.map((company) => (<option key={company.id} value={company.id}>{company.legalName} - {formatCnpj(company.cnpj)}</option>))}</select></label>
            <label>Nome<input value={inviteForm.name} onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do usuario" /></label>
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
              <p>Cadastro basico do CNPJ. As configuracoes de emissao de NFS-e ficarao dentro da empresa.</p>
            </div>
            <button className="companies-close" type="button" onClick={() => setShowCreateForm(false)}>×</button>
          </div>

          <form onSubmit={handleCreateCompany}>
            <div className="client-types" aria-label="Tipo de cliente">
              <button className="client-type is-active" type="button">▦<span>Pessoa Juridica</span></button>
              <button className="client-type" type="button" disabled>♙<span>Pessoa Fisica</span></button>
              <button className="client-type" type="button" disabled>🌐<span>Exterior</span></button>
            </div>

            <div className="companies-form companies-form--client-top">
              <label className={lookupError ? 'is-invalid' : ''}>
                CNPJ
                <div className="lookup-row">
                  <input value={formatCnpj(companyForm.cnpj)} onChange={(event) => setCompanyForm((current) => ({ ...current, cnpj: onlyDigits(event.target.value) }))} placeholder="__/___.___/____-__" required />
                  <button className="lookup-button" type="button" onClick={handleLookupCnpj} disabled={isLookupLoading}>{isLookupLoading ? 'Buscando...' : 'Buscar'}</button>
                </div>
                {lookupError ? <span className="field-error">● {lookupError}</span> : null}
              </label>
              <label>Razao Social<input value={companyForm.legalName} onChange={(event) => setCompanyForm((current) => ({ ...current, legalName: event.target.value }))} required /></label>
              <label>Nome fantasia<input value={companyForm.tradeName} onChange={(event) => setCompanyForm((current) => ({ ...current, tradeName: event.target.value }))} /></label>
              <label>Inscricao Municipal<input value={companyForm.municipalRegistration} onChange={(event) => setCompanyForm((current) => ({ ...current, municipalRegistration: event.target.value }))} /></label>
            </div>

            <div className="client-tabs"><span className="is-active">Dados de contato</span><span>Endereco</span><span>Dados bancarios</span></div>
            <div className="companies-form companies-form--client-details">
              <label>E-mail(s) para envio <small>(separados por virgula)</small><input value={companyForm.email} onChange={(event) => setCompanyForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label>Telefone<input value={companyForm.phone} onChange={(event) => setCompanyForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label>CEP<input value={formatCep(companyForm.zipCode)} onChange={(event) => setCompanyForm((current) => ({ ...current, zipCode: onlyDigits(event.target.value) }))} /></label>
              <label>Endereco<input value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} /></label>
              <label>Numero<input value={companyForm.number} onChange={(event) => setCompanyForm((current) => ({ ...current, number: event.target.value }))} /></label>
              <label>Complemento<input value={companyForm.complement} onChange={(event) => setCompanyForm((current) => ({ ...current, complement: event.target.value }))} /></label>
              <label>Bairro<input value={companyForm.neighborhood} onChange={(event) => setCompanyForm((current) => ({ ...current, neighborhood: event.target.value }))} /></label>
              <label>Estado<input value={companyForm.state} maxLength={2} onChange={(event) => setCompanyForm((current) => ({ ...current, state: event.target.value.toUpperCase() }))} required /></label>
              <label>Cidade<input value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required /></label>
              <label>Pais<input value={companyForm.country} onChange={(event) => setCompanyForm((current) => ({ ...current, country: event.target.value }))} /></label>
            </div>

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
              <div className="company-card__footer"><span className="company-card__badge">{initials(company.legalName)}</span>{company.role ? <span className="company-card__role">{company.role === 'ADMIN_VIEW' ? 'Visao geral' : company.role}</span> : null}</div>
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
