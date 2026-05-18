'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import '../../company-module.css';

type AccountRole = 'ADMIN' | 'USER';
type CompanyRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'ADMIN_VIEW';
type ModuleSection = 'home' | 'settings';
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

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.75 10.75 12 4l8.25 6.75" />
      <path d="M5.75 9.5v9.25h4.6v-5.4h3.3v5.4h4.6V9.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.85 1.85 0 0 0 .37 2.04l.07.07a2.22 2.22 0 1 1-3.14 3.14l-.07-.07a1.85 1.85 0 0 0-2.04-.37 1.85 1.85 0 0 0-1.12 1.7V21.7a2.22 2.22 0 1 1-4.44 0v-.1a1.85 1.85 0 0 0-1.12-1.7 1.85 1.85 0 0 0-2.04.37l-.07.07a2.22 2.22 0 1 1-3.14-3.14l.07-.07A1.85 1.85 0 0 0 4.1 15a1.85 1.85 0 0 0-1.7-1.12H2.3a2.22 2.22 0 1 1 0-4.44h.1a1.85 1.85 0 0 0 1.7-1.12 1.85 1.85 0 0 0-.37-2.04l-.07-.07A2.22 2.22 0 1 1 6.8 3.07l.07.07a1.85 1.85 0 0 0 2.04.37 1.85 1.85 0 0 0 1.12-1.7V1.7a2.22 2.22 0 1 1 4.44 0v.1a1.85 1.85 0 0 0 1.12 1.7 1.85 1.85 0 0 0 2.04-.37l.07-.07a2.22 2.22 0 1 1 3.14 3.14l-.07.07a1.85 1.85 0 0 0-.37 2.04 1.85 1.85 0 0 0 1.7 1.12h.1a2.22 2.22 0 1 1 0 4.44h-.1A1.85 1.85 0 0 0 19.4 15Z" />
    </svg>
  );
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {collapsed ? <><path d="m8 6 6 6-6 6" /><path d="m13 6 6 6-6 6" /></> : <><path d="m16 6-6 6 6 6" /><path d="m11 6-6 6 6 6" /></>}
    </svg>
  );
}

export default function CompanyModulePage() {
  const router = useRouter();
  const params = useParams<{ companyId: string }>();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState(params.companyId);
  const [activeSection, setActiveSection] = useState<ModuleSection>('home');
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
            <img className="company-sidebar__logo" src="/zip-logo.png" alt="Zip" onError={(event) => { event.currentTarget.src = '/zip-logo.svg'; }} />
            <button className="company-sidebar__toggle" type="button" onClick={() => setIsCollapsed((current) => !current)} aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}><SidebarToggleIcon collapsed={isCollapsed} /></button>
          </div>
          <nav className="company-sidebar__nav">
            <div className="company-sidebar__section">
              <button className={`company-sidebar__item ${activeSection === 'home' ? 'is-active' : ''}`} type="button" onClick={() => setActiveSection('home')}>
                <span className="company-sidebar__icon"><HomeIcon /></span>
                <span className="company-sidebar__label">Home</span>
              </button>
            </div>
          </nav>
          <div className="company-sidebar__footer">
            <button className={`company-sidebar__item company-sidebar__item--settings ${activeSection === 'settings' ? 'is-active' : ''}`} type="button" onClick={() => setActiveSection('settings')} title="Configurações de emissão de notas fiscais">
              <span className="company-sidebar__icon"><SettingsIcon /></span>
              <span className="company-sidebar__label">Configurações</span>
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
              <span>{user?.name || 'Usuário'}</span>
              <button type="button" onClick={() => router.push('/dashboard')}>Empresas</button>
              <button type="button" onClick={handleLogout}>Sair</button>
            </div>
          </header>

          <div className="company-module-content">
            {error ? <p className="companies-alert companies-alert--error">{error}</p> : null}
            {isLoading ? <p className="company-module-empty">Carregando ambiente da empresa...</p> : null}
            {!isLoading && activeCompany && activeSection === 'home' ? <>
              <section className="company-module-hero">
                <p>Home</p>
                <h1>{activeCompany.legalName}</h1>
                <span>{formatCnpj(activeCompany.cnpj)} · {activeCompany.city}/{activeCompany.state} · {roleLabel(activeCompany.role)}</span>
              </section>
              <section className="company-module-cards" aria-label="Resumo da empresa">
                <article className="company-module-card"><strong>Home</strong><span>Área inicial do módulo da empresa. Os próximos menus serão adicionados nesta estrutura lateral.</span></article>
                <article className="company-module-card"><strong>Regime tributário</strong><span>{activeCompany.taxRegime || 'Não informado'}</span></article>
                <article className="company-module-card"><strong>Status</strong><span>Ambiente modular iniciado para esta empresa.</span></article>
              </section>
            </> : null}
            {!isLoading && activeCompany && activeSection === 'settings' ? <>
              <section className="company-module-hero">
                <p>Configurações</p>
                <h1>Configurações de emissão de NFS-e</h1>
                <span>{activeCompany.legalName} · {formatCnpj(activeCompany.cnpj)}</span>
              </section>
              <section className="company-module-cards" aria-label="Configurações de emissão">
                <article className="company-module-card"><strong>Certificado digital</strong><span>Upload e validação do certificado A1 da empresa para assinatura das emissões.</span></article>
                <article className="company-module-card"><strong>Dados fiscais</strong><span>Inscrição municipal, CNAE, regime tributário, códigos de serviço e demais dados exigidos pela API nacional.</span></article>
                <article className="company-module-card"><strong>Ambiente de emissão</strong><span>Parâmetros do emissor nacional, credenciais, município e configurações de homologação/produção.</span></article>
              </section>
            </> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
