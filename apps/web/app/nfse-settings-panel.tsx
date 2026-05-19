'use client';

import { useEffect } from 'react';

type NfseSettings = Record<string, any>;

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
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || 'Não foi possível salvar as configurações.');
  return data;
}

function value(settings: NfseSettings | null, key: string, fallback = '') {
  return String(settings?.[key] ?? fallback);
}

function checked(settings: NfseSettings | null, key: string) {
  return Boolean(settings?.[key]);
}

function render(panel: HTMLElement, settings: NfseSettings | null, message = '') {
  panel.innerHTML = `
    <section class="nfse-settings-clean nfse-settings-simple">
      <div class="nfse-settings-tabs" role="tablist" aria-label="Configurações da NFS-e">
        <button class="nfse-settings-tabs__item is-active" type="button" role="tab" aria-selected="true">Emissão NFS-e</button>
        <button class="nfse-settings-tabs__item" type="button" role="tab" aria-selected="false" disabled>Certificado/Prefeitura</button>
        <button class="nfse-settings-tabs__item" type="button" role="tab" aria-selected="false" disabled>Impostos</button>
      </div>

      <div class="nfse-settings-clean__header nfse-settings-simple__hero">
        <div>
          <p>Configuração NFS-e</p>
          <h2>Emissão NFS-e</h2>
          <span>Primeira etapa de configuração para emissão. Preencha as informações fornecidas pela prefeitura ou pela contabilidade.</span>
        </div>
      </div>

      ${message ? `<p class="nfse-settings-clean__message">${message}</p>` : ''}

      <div class="nfse-settings-simple__steps">
        <article class="nfse-settings-clean__card nfse-settings-simple__card">
          <div class="nfse-settings-simple__card-title">
            <span class="nfse-settings-simple__step">1</span>
            <div>
              <h3>Município da empresa</h3>
              <p>Busque a cidade para preencher o código IBGE automaticamente e informe a inscrição municipal.</p>
            </div>
          </div>
          <div class="nfse-settings-clean__fields nfse-settings-clean__fields--municipality">
            <label>Código IBGE do município
              <input name="municipalIbgeCode" value="${value(settings, 'municipalIbgeCode')}" placeholder="Será preenchido ao selecionar o município" />
            </label>
            <label>Inscrição Municipal
              <input name="municipalRegistration" value="${value(settings, 'municipalRegistration')}" placeholder="Informe a inscrição municipal" />
            </label>
          </div>
        </article>

        <article class="nfse-settings-clean__card nfse-settings-simple__card">
          <div class="nfse-settings-simple__card-title">
            <span class="nfse-settings-simple__step">2</span>
            <div>
              <h3>Regime da empresa</h3>
              <p>Escolha o regime tributário. Na dúvida, confirme essa informação com a contabilidade.</p>
            </div>
          </div>
          <div class="nfse-settings-clean__fields">
            <label>Regime tributário
              <select name="taxRegime" data-action="tax-regime">
                <option value="SIMPLE_NATIONAL" ${value(settings, 'taxRegime', 'SIMPLE_NATIONAL') === 'SIMPLE_NATIONAL' ? 'selected' : ''}>Simples Nacional</option>
                <option value="MEI" ${value(settings, 'taxRegime') === 'MEI' ? 'selected' : ''}>MEI</option>
                <option value="NORMAL" ${value(settings, 'taxRegime') === 'NORMAL' ? 'selected' : ''}>Lucro Presumido / Normal</option>
                <option value="SPECIAL" ${value(settings, 'taxRegime') === 'SPECIAL' ? 'selected' : ''}>Regime especial</option>
                <option value="NONE" ${value(settings, 'taxRegime') === 'NONE' ? 'selected' : ''}>Não sei informar</option>
              </select>
            </label>
            <label>Regime especial, se houver
              <input name="specialTaxRegime" value="${value(settings, 'specialTaxRegime')}" placeholder="Opcional" />
            </label>
          </div>
          <details class="nfse-settings-simple__tax-options">
            <summary>Opções fiscais adicionais</summary>
            <div class="nfse-settings-clean__checks">
              <label><input name="isSimpleNational" type="checkbox" ${checked(settings, 'isSimpleNational') || value(settings, 'taxRegime', 'SIMPLE_NATIONAL') === 'SIMPLE_NATIONAL' ? 'checked' : ''} /> Empresa do Simples Nacional</label>
              <label><input name="hasFiscalIncentive" type="checkbox" ${checked(settings, 'hasFiscalIncentive') ? 'checked' : ''} /> Possui incentivo fiscal</label>
              <label><input name="defaultIssWithheld" type="checkbox" ${checked(settings, 'defaultIssWithheld') ? 'checked' : ''} /> Reter ISS por padrão</label>
            </div>
          </details>
        </article>

        <article class="nfse-settings-clean__card nfse-settings-simple__card">
          <div class="nfse-settings-simple__card-title">
            <span class="nfse-settings-simple__step">3</span>
            <div>
              <h3>Certificado digital</h3>
              <p>Envie o certificado A1 da empresa para assinar a comunicação com a NFS-e Nacional.</p>
            </div>
          </div>
          <div class="nfse-settings-clean__fields nfse-settings-clean__fields--certificate">
            <label>Certificado A1 (.pfx ou .p12)
              <input name="certificateFile" type="file" accept=".pfx,.p12" />
            </label>
            <label>Senha do certificado
              <input name="certificatePassword" type="password" autocomplete="new-password" placeholder="Senha do A1" />
            </label>
            <button class="companies-button companies-button--ghost" type="button" data-action="upload-certificate">Enviar certificado</button>
          </div>
        </article>
      </div>

      <details class="nfse-settings-simple__advanced">
        <summary>Opções avançadas para suporte técnico</summary>
        <div class="nfse-settings-simple__advanced-grid">
          <article class="nfse-settings-clean__card">
            <h3>Ambiente da API Nacional</h3>
            <p>Use homologação para testes. Produção deve ser usada somente quando a emissão real estiver liberada.</p>
            <div class="nfse-settings-clean__fields">
              <label>Ambiente
                <select name="environment">
                  <option value="PRODUCTION_RESTRICTED" ${value(settings, 'environment', 'PRODUCTION_RESTRICTED') === 'PRODUCTION_RESTRICTED' ? 'selected' : ''}>Homologação / produção restrita</option>
                  <option value="PRODUCTION" ${value(settings, 'environment') === 'PRODUCTION' ? 'selected' : ''}>Produção</option>
                </select>
              </label>
              <label>URL base da API
                <input name="apiBaseUrl" value="${value(settings, 'apiBaseUrl')}" placeholder="Deixe vazio para usar a URL padrão" />
              </label>
              <label>Versão da API
                <input name="apiVersion" value="${value(settings, 'apiVersion')}" placeholder="Opcional" />
              </label>
            </div>
          </article>

          <article class="nfse-settings-clean__card">
            <h3>Serviço padrão</h3>
            <p>Preencha apenas se a empresa usa sempre o mesmo tipo de serviço.</p>
            <div class="nfse-settings-clean__fields">
              <label>Natureza da operação
                <input name="defaultOperationNature" value="${value(settings, 'defaultOperationNature')}" placeholder="Ex.: Tributação no município" />
              </label>
              <label>Série/RPS padrão
                <input name="defaultRpsSeries" value="${value(settings, 'defaultRpsSeries')}" placeholder="Opcional" />
              </label>
            </div>
          </article>
        </div>
      </details>

      <div class="nfse-settings-footer">
        <span>Revise os dados antes de salvar. Estas informações serão usadas na emissão das notas fiscais.</span>
        <button class="companies-button companies-button--primary" type="button" data-action="save-settings">Salvar configurações</button>
      </div>
    </section>`;

  bind(panel, settings);
}

function collect(panel: HTMLElement) {
  const form = panel.querySelector('.nfse-settings-clean') as HTMLElement;
  const field = (name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  const taxRegime = field('taxRegime')?.value || 'SIMPLE_NATIONAL';
  return {
    environment: field('environment')?.value || 'PRODUCTION_RESTRICTED',
    apiBaseUrl: field('apiBaseUrl')?.value || '',
    apiVersion: field('apiVersion')?.value || '',
    municipalIbgeCode: field('municipalIbgeCode')?.value || '',
    municipalRegistration: field('municipalRegistration')?.value || '',
    taxRegime,
    specialTaxRegime: field('specialTaxRegime')?.value || '',
    isSimpleNational: Boolean((field('isSimpleNational') as HTMLInputElement | null)?.checked) || taxRegime === 'SIMPLE_NATIONAL' || taxRegime === 'MEI',
    hasFiscalIncentive: Boolean((field('hasFiscalIncentive') as HTMLInputElement | null)?.checked),
    defaultIssWithheld: Boolean((field('defaultIssWithheld') as HTMLInputElement | null)?.checked),
    defaultOperationNature: field('defaultOperationNature')?.value || '',
    defaultRpsSeries: field('defaultRpsSeries')?.value || '',
  };
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:.*;base64,/, ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bind(panel: HTMLElement, settings: NfseSettings | null) {
  panel.querySelector<HTMLSelectElement>('[data-action="tax-regime"]')?.addEventListener('change', (event) => {
    const simple = panel.querySelector<HTMLInputElement>('[name="isSimpleNational"]');
    const selected = event.currentTarget.value;
    if (simple) simple.checked = selected === 'SIMPLE_NATIONAL' || selected === 'MEI';
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-action="save-settings"]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const companyId = companyIdFromPath();
        const updated = await api(`/companies/${companyId}/nfse/settings`, { method: 'PATCH', body: JSON.stringify(collect(panel)) });
        render(panel, updated, 'Configurações salvas com sucesso.');
      } catch (error) {
        render(panel, settings, error instanceof Error ? error.message : 'Não foi possível salvar as configurações.');
      }
    });
  });

  panel.querySelector<HTMLButtonElement>('[data-action="upload-certificate"]')?.addEventListener('click', async () => {
    try {
      const companyId = companyIdFromPath();
      const file = panel.querySelector<HTMLInputElement>('[name="certificateFile"]')?.files?.[0];
      const password = panel.querySelector<HTMLInputElement>('[name="certificatePassword"]')?.value || '';
      if (!file) throw new Error('Selecione o certificado .pfx ou .p12.');
      if (!password) throw new Error('Informe a senha do certificado.');
      const fileBase64 = await fileToBase64(file);
      const result = await api(`/companies/${companyId}/nfse/settings/certificate`, {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, fileBase64, password }),
      });
      render(panel, result.settings, 'Certificado enviado e vinculado à empresa.');
      window.dispatchEvent(new CustomEvent('nfse:certificate-updated', { detail: { certificate: result.certificate || null } }));
    } catch (error) {
      render(panel, settings, error instanceof Error ? error.message : 'Não foi possível enviar o certificado.');
    }
  });
}

function findSettingsContainer() {
  return Array.from(document.querySelectorAll<HTMLElement>('.nfse-section')).find((section) => section.textContent?.includes('Configurações de emissão de NFS-e')) || null;
}

export function NfseSettingsPanel() {
  useEffect(() => {
    let loading = false;
    const enhance = async () => {
      const container = findSettingsContainer();
      const companyId = companyIdFromPath();
      if (!container || !companyId || container.dataset.settingsReady === 'true' || loading) return;
      loading = true;
      container.dataset.settingsReady = 'true';
      container.innerHTML = '<p class="company-module-empty">Carregando configurações...</p>';
      try {
        const settings = await api(`/companies/${companyId}/nfse/settings`);
        render(container, settings);
      } catch (error) {
        render(container, null, error instanceof Error ? error.message : 'Não foi possível carregar as configurações.');
      } finally {
        loading = false;
      }
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
