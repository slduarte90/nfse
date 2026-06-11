import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EKontrollApiService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(apiKeyOverride?: string | null) {
    return Boolean(this.config.get<string>('EKONTROLL_API_BASE_URL') && (apiKeyOverride || this.config.get<string>('EKONTROLL_API_KEY')));
  }

  async callMethod(method: string, params: Record<string, string | number | boolean | undefined | null> = {}, apiKeyOverride?: string | null) {
    const baseUrl = this.config.get<string>('EKONTROLL_API_BASE_URL') || 'https://app.e-kontroll.com.br/api/v1/metodo';
    const apiKey = apiKeyOverride || this.config.get<string>('EKONTROLL_API_KEY');
    if (!apiKey) throw new Error('Integração de indicadores não configurada.');
    const body = new URLSearchParams();
    body.set('metodo', method);
    body.set('api_key', apiKey);
    const companyKey = this.config.get<string>('EKONTROLL_API_KEY_EMPRESA');
    const clientKey = this.config.get<string>('EKONTROLL_API_KEY_CLIENTE');
    if (companyKey) body.set('api_key_empresa', companyKey);
    if (clientKey) body.set('api_key_cliente', clientKey);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
    });
    const response = await fetch(baseUrl, {
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
