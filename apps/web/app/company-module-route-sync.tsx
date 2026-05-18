'use client';

import { useEffect } from 'react';

const routes: Array<{ path: string; label: string }> = [
  { path: '/nfse/emissao', label: 'Emissão' },
  { path: '/nfse/tomadores', label: 'Cadastro de Tomadores' },
  { path: '/nfse/notas', label: 'Notas Fiscais' },
  { path: '/nfse/parametrizacao', label: 'Parametrização' },
  { path: '/configuracoes', label: 'Configurações' },
];

function basePath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] === 'empresas' && parts[1] ? `/empresas/${parts[1]}` : '';
}

function labelFromPath() {
  const base = basePath();
  if (!base) return null;
  const suffix = window.location.pathname.slice(base.length);
  if (!suffix || suffix === '/') return 'Home';
  return routes.find((route) => route.path === suffix)?.label || null;
}

function findSidebarButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.company-sidebar button')).find((button) => button.textContent?.trim() === label) || null;
}

function syncActiveSection() {
  const label = labelFromPath();
  if (!label) return;
  const button = findSidebarButton(label);
  if (button && !button.classList.contains('is-active')) button.click();
}

function bindSidebarButtons() {
  const base = basePath();
  if (!base) return;
  const labels = [{ path: '', label: 'Home' }, ...routes];
  labels.forEach((route) => {
    const button = findSidebarButton(route.label);
    if (!button || button.dataset.routeSyncReady === 'true') return;
    button.dataset.routeSyncReady = 'true';
    button.addEventListener('click', () => {
      const nextPath = `${base}${route.path}`;
      if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    });
  });
}

export function CompanyModuleRouteSync() {
  useEffect(() => {
    const sync = () => {
      bindSidebarButtons();
      syncActiveSection();
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', syncActiveSection);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', syncActiveSection);
    };
  }, []);
  return null;
}
