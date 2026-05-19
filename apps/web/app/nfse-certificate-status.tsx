'use client';

import { useEffect } from 'react';

type CertificateSummary = {
  id: string;
  originalFileName: string;
  subjectName?: string | null;
  issuerName?: string | null;
  serialNumber?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  status: string;
  createdAt: string;
};

const apiBase = 'http://localhost:3333';

function companyIdFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] === 'empresas' && parts[1] ? parts[1] : '';
}

function token() {
  return localStorage.getItem('nfse_access_token') || '';
}

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || 'Não foi possível carregar o certificado.');
  return data;
}

function formatDate(value?: string | null) {
  if (!value) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
}

function statusLabel(status?: string) {
  return ({
    VALID: 'Válido',
    EXPIRED: 'Vencido',
    INVALID: 'Inválido',
    PENDING: 'Pendente',
    REVOKED: 'Desvinculado',
  } as Record<string, string>)[status || ''] || 'Não informado';
}

function findCertificateCard() {
  return Array.from(document.querySelectorAll<HTMLElement>('.nfse-settings-clean__card')).find((card) => card.textContent?.includes('Certificado digital')) || null;
}

function renderCertificate(card: HTMLElement, certificate: CertificateSummary | null, message = '') {
  let panel = card.querySelector<HTMLElement>('.nfse-certificate-status');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'nfse-certificate-status';
    card.appendChild(panel);
  }

  const content = certificate
    ? `<div class="nfse-certificate-status__grid">
        <span><strong>Arquivo</strong>${certificate.originalFileName}</span>
        <span><strong>Status</strong>${statusLabel(certificate.status)}</span>
        <span><strong>Titular</strong>${certificate.subjectName || 'Não informado'}</span>
        <span><strong>Vencimento</strong>${formatDate(certificate.validUntil)}</span>
      </div>
      <div class="nfse-certificate-status__actions">
        <button class="companies-button companies-button--ghost companies-button--mini" type="button" data-action="unlink-certificate">Desvincular certificado</button>
        <small>Ao enviar outro certificado, o atual será substituído automaticamente.</small>
      </div>`
    : `<p class="nfse-certificate-status__empty">Nenhum certificado vinculado ainda.</p>`;

  panel.innerHTML = `${message ? `<p class="nfse-settings-clean__message">${message}</p>` : ''}${content}`;
}

async function syncCertificate(message = '') {
  const card = findCertificateCard();
  const companyId = companyIdFromPath();
  if (!card || !companyId) return;

  try {
    const data = await api(`/companies/${companyId}/nfse/settings/certificate`);
    renderCertificate(card, data?.certificate || null, message);
  } catch {
    renderCertificate(card, null, message);
  }
}

export function NfseCertificateStatus() {
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => void syncCertificate());
    };

    const handleClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-action="unlink-certificate"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        const companyId = companyIdFromPath();
        await api(`/companies/${companyId}/nfse/settings/certificate`, { method: 'DELETE' });
        await syncCertificate('Certificado desvinculado com sucesso.');
      } catch (error) {
        await syncCertificate(error instanceof Error ? error.message : 'Não foi possível desvincular o certificado.');
      }
    };

    sync();
    window.addEventListener('nfse:certificate-updated', sync);
    document.addEventListener('click', handleClick, true);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('nfse:certificate-updated', sync);
      document.removeEventListener('click', handleClick, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
