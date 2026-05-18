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
    <section class="nfse-settings-clean">
      <div class="nfse-settings-clean__header">
        <div>
          <p>Parametrização</p>
          <h2>Configuração para testes reais da NFS-e</h2>
          <span>Defina ambiente, dados municipais, serviço padrão e certificado A1 da empresa selecionada.</span>
        </div>
        <button class="companies-button companies-button--primary" type="button" data-action="save-settings">Salvar parametrização</button>
      </div>

      ${message ? `<p class="nfse-settings-clean__message">${message}</p>` : ''}

      <div class="nfse-settings-clean__grid">
        <article class="nfse-settings-clean__card is-wide">
          <h3>Ambiente da API Nacional</h3>
          <p>Use produção restrita para homologação inicial. Preencha a URL apenas se precisar sobrescrever o endpoint padrão.</p>
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
          <h3>Prestador e município</h3>
          <p>Dados usados na geração da DPS e validação municipal.</p>
          <div class="nfse-settings-clean__fields">
            <label>Código IBGE do município
              <input name="municipalIbgeCode" value="${value(settings, 'municipalIbgeCode')}" placeholder="Ex.: 3148103" />
            </label>
            <label>Inscrição Municipal
              <input name="municipalRegistration" value="${value(settings, 'municipalRegistration')}" />
            </label>
            <label>Regime tributário
              <select name="taxRegime">
                <option value="NORMAL" ${value(settings, 'taxRegime', 'NORMAL') === 'NORMAL' ? 'selected' : ''}>Normal</option>
                <option value="SIMPLE_NATIONAL" ${value(settings, 'taxRegime') === 'SIMPLE_NATIONAL' ? 'selected' : ''}>Simples Nacional</option>
                <option value="MEI" ${value(settings, 'taxRegime') === 'MEI' ? 'selected' : ''}>MEI</option>
                <option value="SPECIAL" ${value(settings, 'taxRegime') === 'SPECIAL' ? 'selected' : ''}>Regime especial</option>
                <option value="NONE" ${value(settings, 'taxRegime') === 'NONE' ? 'selected' : ''}>Não informado</option>
              </select>
            </label>
            <label>Regime especial
              <input name="specialTaxRegime" value="${value(settings, 'specialTaxRegime')}" placeholder="Opcional" />
            </label>
          </div>
          <div class="nfse-settings-clean__checks">
            <label><input name="isSimpleNational" type="checkbox" ${checked(settings, 'isSimpleNational') ? 'checked' : ''} /> Simples Nacional</label>
            <label><input name="hasFiscalIncentive" type="checkbox" ${checked(settings, 'hasFiscalIncentive') ? 'checked' : ''} /> Incentivo fiscal</label>
            <label><input name="defaultIssWithheld" type="checkbox" ${checked(settings, 'defaultIssWithheld') ? 'checked' : ''} /> Retenção ISS padrão</label>
          </div>
        </article>

        <article class="nfse-settings-clean__card">
          <h3>Serviço padrão</h3>
          <p>Parâmetros iniciais utilizados na emissão da NFS-e.</p>
          <div class="nfse-settings-clean__fields">
            <label>Natureza da operação
              <input name="defaultOperationNature" value="${value(settings, 'defaultOperationNature')}" placeholder="Ex.: Tributação no município" />
            </label>
            <label>Série/RPS padrão
              <input name="defaultRpsSeries" value="${value(settings, 'defaultRpsSeries')}" placeholder="Opcional" />
            </label>
          </div>
        </article>

        <article class="nfse-settings-clean__card is-wide">
          <h3>Certificado digital A1</h3>
          <p>Envie o certificado .pfx/.p12 e informe a senha. O certificado ficará vinculado somente a esta empresa.</p>
          <div class="nfse-settings-clean__fields nfse-settings-clean__fields--certificate">
            <label>Arquivo .pfx/.p12
              <input name="certificateFile" type="file" accept=".pfx,.p12" />
            </label>
            <label>Senha do certificado
              <input name="certificatePassword" type="password" autocomplete="new-password" />
            </label>
            <button class="companies-button companies-button--ghost" type="button" data-action="upload-certificate">Enviar certificado</button>
          </div>
          <small>${settings?.certificateId ? `Certificado vinculado: ${settings.certificateId}` : 'Nenhum certificado vinculado ainda.'}</small>
        </article>
      </div>
    </section>`;

  bind(panel, settings);
}

function collect(panel: HTMLElement) {
  const form = panel.querySelector('.nfse-settings-clean') as HTMLElement;
  const field = (name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  return {
    environment: field('environment')?.value || 'PRODUCTION_RESTRICTED',
    apiBaseUrl: field('apiBaseUrl')?.value || '',
    apiVersion: field('apiVersion')?.value || '',
    municipalIbgeCode: field('municipalIbgeCode')?.value || '',
    municipalRegistration: field('municipalRegistration')?.value || '',
    taxRegime: field('taxRegime')?.value || 'NORMAL',
    specialTaxRegime: field('specialTaxRegime')?.value || '',
    isSimpleNational: Boolean((field('isSimpleNational') as HTMLInputElement | null)?.checked),
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
  panel.querySelector<HTMLButtonElement>('[data-action="save-settings"]')?.addEventListener('click', async () => {
    try {
      const companyId = companyIdFromPath();
      const updated = await api(`/companies/${companyId}/nfse/settings`, { method: 'PATCH', body: JSON.stringify(collect(panel)) });
      render(panel, updated, 'Parametrização salva com sucesso.');
    } catch (error) {
      render(panel, settings, error instanceof Error ? error.message : 'Não foi possível salvar a parametrização.');
    }
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
      container.innerHTML = '<p class="company-module-empty">Carregando parametrização...</p>';
      try {
        const settings = await api(`/companies/${companyId}/nfse/settings`);
        render(container, settings);
      } catch (error) {
        render(container, null, error instanceof Error ? error.message : 'Não foi possível carregar a parametrização.');
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
