import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EKontrollApiService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(companyKeyOverride?: string | null) {
    // Precisa da app key (escritório) e da chave da empresa (api_key_cliente).
    return Boolean(
      this.config.get<string>('EKONTROLL_API_BASE_URL') &&
      this.config.get<string>('EKONTROLL_API_KEY') &&
      (companyKeyOverride || this.config.get<string>('EKONTROLL_API_KEY_CLIENTE')),
    );
  }

  async callMethod(method: string, params: Record<string, string | number | boolean | undefined | null> = {}, companyKeyOverride?: string | null) {
    const baseUrl = this.config.get<string>('EKONTROLL_API_BASE_URL') || 'https://app.e-kontroll.com.br/api/v1/metodo';
    // api_key é sempre a chave do escritório (app key). A chave da empresa vai em api_key_cliente.
    const apiKey = this.config.get<string>('EKONTROLL_API_KEY');
    if (!apiKey) throw new Error('Integração de indicadores não configurada.');
    const body = new URLSearchParams();
    body.set('api_key', apiKey);
    const companiesKey = this.config.get<string>('EKONTROLL_API_KEY_EMPRESA');
    const clientKey = companyKeyOverride || this.config.get<string>('EKONTROLL_API_KEY_CLIENTE');
    if (companiesKey) body.set('api_key_empresa', companiesKey);
    if (clientKey) body.set('api_key_cliente', clientKey);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
    });
    // O nome do método vai no PATH: /api/v1/metodo/{metodo} (não como parâmetro do corpo).
    const methodUrl = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(method)}`;
    const response = await fetch(methodUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) throw new Error(`Integração de indicadores respondeu ${response.status}: ${text.slice(0, 300)}`);
    return json ?? { body: text };
  }
}
