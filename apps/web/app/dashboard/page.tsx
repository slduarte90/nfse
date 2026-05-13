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
  serviceCodeDefault?: string | null;
  isActive: boolean;
  role: CompanyRole;
}

interface CreateCompanyForm {
  legalName: string;
  tradeName: string;
  cnpj: string;
  municipalRegistration: string;
  city: string;
  state: string;
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
  legalName: '',
  tradeName: '',
  cnpj: '',
  municipalRegistration: '',
  city: '',
  state: '',
  taxRegime: 'Simples Nacional',
  serviceCodeDefault: '',
};

const emptyInviteForm: InviteUserForm = {
  companyId: '',
  name: '',
  email: '',
  role: 'OPERATOR',
};

function formatCnpj(cnpj: string) {
  const digits = cnpj.replace(/\D/g, '').padEnd(14, ' ');
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5').trim();
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
      const parsedUser = JSON.parse(storedUser) as StoredUser;
      setUser(parsedUser);
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

    try {
      const response = await fetch('http://localhost:3333/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(companyForm),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Nao foi possivel criar a empresa.');
        return;
      }

      setSuccess('Empresa criada com sucesso.');
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
          <input
            type="search"
            placeholder="Buscar em Minhas empresas..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
          <button className="companies-button companies-button--ghost" type="button" onClick={handleLogout}>
            Sair
          </button>
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
            <label>
              Empresa
              <select
                value={inviteForm.companyId}
                onChange={(event) => setInviteForm((current) => ({ ...current, companyId: event.target.value }))}
                required
              >
                <option value="">Selecione uma empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.legalName} - {formatCnpj(company.cnpj)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome
              <input
                value={inviteForm.name}
                onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nome do usuario"
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={inviteForm.email}
                onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="usuario@empresa.com.br"
                required
              />
            </label>
            <label>
              Perfil na empresa
              <select
                value={inviteForm.role}
                onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value as InviteUserForm['role'] }))}
              >
                <option value="OPERATOR">Operador</option>
                <option value="VIEWER">Visualizador</option>
                <option value="ADMIN">Administrador da empresa</option>
              </select>
            </label>
            <button className="companies-button companies-button--primary" type="submit">
              Enviar convite
            </button>
          </form>
        </section>
      ) : null}

      {isAdmin && showCreateForm ? (
        <section className="companies-panel">
          <div>
            <h2>Criar empresa</h2>
            <p>Cadastre uma nova empresa para emissao de NFS-e.</p>
          </div>
          <form className="companies-form companies-form--grid" onSubmit={handleCreateCompany}>
            <label>
              Razao social
              <input value={companyForm.legalName} onChange={(event) => setCompanyForm((current) => ({ ...current, legalName: event.target.value }))} required />
            </label>
            <label>
              Nome fantasia
              <input value={companyForm.tradeName} onChange={(event) => setCompanyForm((current) => ({ ...current, tradeName: event.target.value }))} />
            </label>
            <label>
              CNPJ
              <input value={companyForm.cnpj} onChange={(event) => setCompanyForm((current) => ({ ...current, cnpj: event.target.value }))} placeholder="Somente numeros" required />
            </label>
            <label>
              Inscricao municipal
              <input value={companyForm.municipalRegistration} onChange={(event) => setCompanyForm((current) => ({ ...current, municipalRegistration: event.target.value }))} />
            </label>
            <label>
              Cidade
              <input value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} required />
            </label>
            <label>
              UF
              <input maxLength={2} value={companyForm.state} onChange={(event) => setCompanyForm((current) => ({ ...current, state: event.target.value.toUpperCase() }))} required />
            </label>
            <label>
              Regime tributario
              <input value={companyForm.taxRegime} onChange={(event) => setCompanyForm((current) => ({ ...current, taxRegime: event.target.value }))} required />
            </label>
            <label>
              Codigo de servico padrao
              <input value={companyForm.serviceCodeDefault} onChange={(event) => setCompanyForm((current) => ({ ...current, serviceCodeDefault: event.target.value }))} />
            </label>
            <button className="companies-button companies-button--primary" type="submit">
              Salvar empresa
            </button>
          </form>
        </section>
      ) : null}

      <section className="companies-grid" aria-label="Lista de empresas">
        {isLoading ? <p className="companies-empty">Carregando empresas...</p> : null}

        {!isLoading && visibleCompanies.length === 0 ? (
          <p className="companies-empty">Nenhuma empresa encontrada.</p>
        ) : null}

        {visibleCompanies.map((company) => (
          <article className="company-card" key={company.id}>
            <div className="company-card__menu" aria-hidden="true">⋮</div>
            <button className="company-card__content" type="button">
              <h2>{company.legalName}</h2>
              <p>{formatCnpj(company.cnpj)}</p>
              <div className="company-card__meta">
                <span>{company.city}/{company.state}</span>
                <span>{company.taxRegime}</span>
              </div>
              <div className="company-card__footer">
                <span className="company-card__badge">{initials(company.legalName)}</span>
                {company.role ? <span className="company-card__role">{company.role === 'ADMIN_VIEW' ? 'Visao geral' : company.role}</span> : null}
              </div>
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
