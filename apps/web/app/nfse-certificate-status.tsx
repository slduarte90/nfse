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
const certificateCache = new Map<string, CertificateSummary | null>();
let lastUnlinkedAt = 0;

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

function renderCertificate(card: HTMLElement, certificate: CertificateSummary | null, message = '', tone: 'success' | 'error' = 'success') {
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

  panel.innerHTML = `${message ? `<p class="nfse-settings-clean__message" data-tone="${tone}">${message}</p>` : ''}${content}`;
}

function renderCurrent(certificate: CertificateSummary | null, message = '', tone: 'success' | 'error' = 'success') {
  const card = findCertificateCard();
  if (card) renderCertificate(card, certificate, message, tone);
}

async function syncCertificate(message = '') {
  const companyId = companyIdFromPath();
  if (!companyId) return;

  if (Date.now() - lastUnlinkedAt < 2500) {
    renderCurrent(null, message || 'Certificado desvinculado com sucesso.');
    return;
  }

  const cached = certificateCache.get(companyId);
  if (cached !== undefined) renderCurrent(cached, message);

  try {
    const data = await api(`/companies/${companyId}/nfse/settings/certificate`);
    const certificate = data?.certificate || null;
    certificateCache.set(companyId, certificate);
    renderCurrent(certificate, message);
  } catch {
    if (cached !== undefined) renderCurrent(cached, message);
  }
}

export function NfseCertificateStatus() {
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => void syncCertificate());
    };

    const handleCertificateUpdated = (event: Event) => {
      lastUnlinkedAt = 0;
      const companyId = companyIdFromPath();
      const certificate = (event as CustomEvent<{ certificate?: CertificateSummary | null }>).detail?.certificate;
      if (companyId && certificate !== undefined) certificateCache.set(companyId, certificate);
      renderCurrent(certificate || null, 'Certificado enviado e vinculado à empresa.');
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => void syncCertificate());
    };

    const handleClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-action="unlink-certificate"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        const companyId = companyIdFromPath();
        certificateCache.set(companyId, null);
        lastUnlinkedAt = Date.now();
        renderCurrent(null, 'Desvinculando certificado...');
        await api(`/companies/${companyId}/nfse/settings/certificate/unlink`, { method: 'POST' });
        certificateCache.set(companyId, null);
        lastUnlinkedAt = Date.now();
        renderCurrent(null, 'Certificado desvinculado com sucesso.');
      } catch (error) {
        lastUnlinkedAt = 0;
        await syncCertificate(error instanceof Error ? error.message : 'Não foi possível desvincular o certificado.');
      } finally {
        button.disabled = false;
      }
    };

    sync();
    window.addEventListener('nfse:certificate-updated', handleCertificateUpdated);
    document.addEventListener('click', handleClick, true);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('nfse:certificate-updated', handleCertificateUpdated);
      document.removeEventListener('click', handleClick, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
