'use client';

import { useEffect } from 'react';

const apiBase = 'http://localhost:3333';

type ServiceItem = {
  id: string;
  name: string;
  nationalTaxCode: string;
  municipalServiceCode?: string | null;
  issRate?: string | number | null;
  description?: string | null;
  isDefault?: boolean;
};

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
  if (!response.ok) throw new Error(data?.message || 'Não foi possível salvar o serviço.');
  return data;
}

function findSettingsPanel() {
  return document.querySelector<HTMLElement>('.nfse-settings-simple__steps');
}

function messageMarkup(message = '', tone: 'success' | 'error' = 'success') {
  return message ? `<p class="nfse-settings-clean__message" data-tone="${tone}">${message}</p>` : '';
}

function renderRows(services: ServiceItem[]) {
  if (!services.length) {
    return '<tr><td colspan="6" class="nfse-services-empty">Nenhum serviço cadastrado ainda.</td></tr>';
  }

  return services.map((service) => `
    <tr>
      <td>
        <label class="nfse-service-default-choice" title="Marcar este serviço como padrão">
          <input type="radio" name="defaultService" value="${service.id}" ${service.isDefault ? 'checked' : ''} />
          <span>${service.isDefault ? 'Padrão' : 'Definir'}</span>
        </label>
      </td>
      <td>${service.name || '-'}</td>
      <td>${service.nationalTaxCode || '-'}</td>
      <td>${service.municipalServiceCode || '-'}</td>
      <td>${service.issRate ?? '-'}</td>
      <td>${service.description || '-'}</td>
    </tr>`).join('');
}

function render(container: HTMLElement, services: ServiceItem[], message = '', tone: 'success' | 'error' = 'success') {
  let wrapper = document.querySelector<HTMLElement>('.nfse-services-manager');
  if (!wrapper) {
    wrapper = document.createElement('article');
    wrapper.className = 'nfse-settings-clean__card nfse-settings-simple__card nfse-services-manager';
    container.appendChild(wrapper);
  }

  wrapper.innerHTML = `
    <div class="nfse-services-header">
      <div class="nfse-settings-simple__card-title">
        <span class="nfse-settings-simple__step">4</span>
        <div>
          <h3>Serviços</h3>
          <p>Cadastre os serviços usados na emissão. Depois escolha na tabela qual será o serviço padrão.</p>
        </div>
      </div>
    </div>
    ${messageMarkup(message, tone)}
    <form class="nfse-service-form">
      <label class="nfse-service-field--wide">Nome do serviço
        <input name="name" placeholder="Ex.: Honorários contábeis" />
      </label>
      <label>Código nacional
        <input name="nationalTaxCode" placeholder="Ex.: 1701" />
      </label>
      <label>Código municipal
        <input name="municipalServiceCode" placeholder="Opcional" />
      </label>
      <label>Alíquota ISS
        <input name="issRate" placeholder="Ex.: 2,00" />
      </label>
      <label class="nfse-service-field--wide">Descrição
        <input name="description" placeholder="Descrição que será usada na nota" />
      </label>
      <button class="companies-button companies-button--primary" type="submit">Adicionar serviço</button>
    </form>
    <div class="nfse-services-table-wrap">
      <table class="nfse-services-table">
        <thead>
          <tr>
            <th>Padrão</th>
            <th>Serviço</th>
            <th>Código nacional</th>
            <th>Código municipal</th>
            <th>ISS</th>
            <th>Descrição</th>
          </tr>
        </thead>
        <tbody>${renderRows(services)}</tbody>
      </table>
    </div>`;

  wrapper.querySelector<HTMLFormElement>('.nfse-service-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);
    try {
      const companyId = companyIdFromPath();
      await api(`/companies/${companyId}/nfse/services`, {
        method: 'POST',
        body: JSON.stringify({
          name: field('name')?.value || '',
          nationalTaxCode: field('nationalTaxCode')?.value || '',
          municipalServiceCode: field('municipalServiceCode')?.value || '',
          issRate: field('issRate')?.value || '',
          description: field('description')?.value || '',
          isDefault: services.length === 0,
        }),
      });
      form.reset();
      await load('Serviço cadastrado com sucesso.', 'success');
    } catch (error) {
      render(container, services, error instanceof Error ? error.message : 'Não foi possível cadastrar o serviço.', 'error');
    }
  });

  wrapper.querySelectorAll<HTMLInputElement>('input[name="defaultService"]').forEach((input) => {
    input.addEventListener('change', async () => {
      if (!input.checked) return;
      try {
        const companyId = companyIdFromPath();
        await api(`/companies/${companyId}/nfse/services/${input.value}`, {
          method: 'PATCH',
          body: JSON.stringify({ isDefault: true }),
        });
        await load('Serviço padrão atualizado.', 'success');
      } catch (error) {
        render(container, services, error instanceof Error ? error.message : 'Não foi possível atualizar o serviço padrão.', 'error');
      }
    });
  });
}

async function load(message = '', tone: 'success' | 'error' = 'success') {
  const container = findSettingsPanel();
  const companyId = companyIdFromPath();
  if (!container || !companyId) return;
  try {
    const services = await api(`/companies/${companyId}/nfse/services`);
    render(container, Array.isArray(services) ? services : [], message, tone);
  } catch (error) {
    render(container, [], error instanceof Error ? error.message : 'Não foi possível carregar os serviços.', 'error');
  }
}

export function NfseServicesManager() {
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => void load());
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}
