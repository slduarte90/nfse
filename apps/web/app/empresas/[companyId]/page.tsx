'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import '../../company-module.css';

type AccountRole = 'ADMIN' | 'USER';
type CompanyRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'ADMIN_VIEW';
type StoredUser = { id: string; name: string; email: string; accountRole: AccountRole };
type Company = { id: string; legalName: string; tradeName?: string | null; cnpj: string; city: string; state: string; taxRegime: string; role: CompanyRole };

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length !== 14) return value;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function roleLabel(role: string) {
  return ({ OWNER: 'Responsável', ADMIN: 'Administrador', OPERATOR: 'Operador', VIEWER: 'Visualizador', ADMIN_VIEW: 'Administrador' } as Record<string, string>)[role] || role;
}

export default function CompanyModulePage() {
  const router = useRouter();
  const params = useParams<{ companyId: string }>();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState(params.companyId);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const activeCompany = useMemo(() => companies.find((company) => company.id === activeCompanyId) || null, [companies, activeCompanyId]);

  useEffect(() => {
    const token = localStorage.getItem('nfse_access_token');
    const storedUser = localStorage.getItem('nfse_user');
    if (!token) { router.replace('/login'); return; }
    if (storedUser) setUser(JSON.parse(storedUser) as StoredUser);

    async function loadCompanies() {
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch('http://localhost:3333/companies', { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || 'Não foi possível carregar as empresas.');
        setCompanies(data);
        const canAccessSelected = data.some((company: Company) => company.id === params.companyId);
        if (!canAccessSelected && data[0]?.id) {
          setActiveCompanyId(data[0].id);
          router.replace(`/empresas/${data[0].id}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar as empresas.');
      } finally {
        setIsLoading(false);
      }
    }

    void loadCompanies();
  }, [params.companyId, router]);

  function handleCompanyChange(companyId: string) {
    setActiveCompanyId(companyId);
    router.push(`/empresas/${companyId}`);
  }

  function handleLogout() {
    localStorage.removeItem('nfse_access_token');
    localStorage.removeItem('nfse_user');
    router.replace('/login');
  }

  return (
    <main className="company-module-page">
      <div className={`company-module-shell ${isCollapsed ? 'is-collapsed' : ''}`}>
        <aside className="company-sidebar" aria-label="Menu da empresa">
          <div className="company-sidebar__brand">
            <span className="company-sidebar__mark">Z</span>
            <span className="company-sidebar__brand-text"><strong>Zip NFS-e</strong><span>Empresa</span></span>
            <button className="company-sidebar__toggle" type="button" onClick={() => setIsCollapsed((current) => !current)} aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}>{isCollapsed ? '›' : '‹'}</button>
          </div>
          <nav className="company-sidebar__nav">
            <div className="company-sidebar__section">
              <button className="company-sidebar__item is-active" type="button">
                <span className="company-sidebar__icon">⌂</span>
                <span className="company-sidebar__label">Dashboard</span>
                <span className="company-sidebar__chevron">▾</span>
              </button>
            </div>
          </nav>
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
              <span>{user?.name || 'Usuário'}</span>
              <button type="button" onClick={() => router.push('/dashboard')}>Empresas</button>
              <button type="button" onClick={handleLogout}>Sair</button>
            </div>
          </header>

          <div className="company-module-content">
            {error ? <p className="companies-alert companies-alert--error">{error}</p> : null}
            {isLoading ? <p className="company-module-empty">Carregando ambiente da empresa...</p> : null}
            {!isLoading && activeCompany ? <>
              <section className="company-module-hero">
                <p>Dashboard</p>
                <h1>{activeCompany.legalName}</h1>
                <span>{formatCnpj(activeCompany.cnpj)} · {activeCompany.city}/{activeCompany.state} · {roleLabel(activeCompany.role)}</span>
              </section>
              <section className="company-module-cards" aria-label="Resumo da empresa">
                <article className="company-module-card"><strong>Home</strong><span>Área inicial do módulo da empresa. Os próximos menus serão adicionados nesta estrutura lateral.</span></article>
                <article className="company-module-card"><strong>Regime tributário</strong><span>{activeCompany.taxRegime || 'Não informado'}</span></article>
                <article className="company-module-card"><strong>Status</strong><span>Ambiente modular iniciado para esta empresa.</span></article>
              </section>
            </> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
