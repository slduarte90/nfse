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
    // api_key_empresa só é usada para listar empresas. Nos métodos por departamento o
    // e-Kontroll repassa cada campo do corpo como argumento posicional da stored procedure,
    // então qualquer chave extra estoura a contagem de argumentos esperada (erro 1318).
    if (companiesKey && method === 'listar_empresas') body.set('api_key_empresa', companiesKey);
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
    if (!response.ok) {
      throw new Error(`Integração de indicadores respondeu ${response.status}: ${this.summarizeError(text)}`);
    }
    return json ?? { body: text };
  }

  // A API do e-Kontroll responde os erros 500 como uma página HTML de stack trace do Laravel.
  // Extraímos só a classe + mensagem da exceção (ex.: "QueryException: ... Incorrect number of
  // arguments for PROCEDURE") para não vazar o stack trace deles ao front nem poluir a UI.
  private summarizeError(text: string): string {
    const raw = String(text || '').trim();
    if (!raw) return 'sem corpo de resposta.';
    if (!/^\s*<(?:!doctype|html)/i.test(raw)) return raw.slice(0, 300);
    const exception = raw.match(/([A-Za-z\\]*(?:Exception|Error))\s*:?\s*([^<\n]{0,200})/);
    if (exception) {
      const klass = exception[1].split('\\').pop() || exception[1];
      const message = this.decodeEntities(exception[2])
        // Descarta o rastro de arquivo/linha do servidor deles (" in file /var/www/...").
        .split(/\s+in\s+(?:file\s+)?\//i)[0]
        .replace(/\s+/g, ' ')
        .trim();
      return message ? `${klass}: ${message}` : klass;
    }
    return 'erro interno na integração de indicadores.';
  }

  private decodeEntities(value: string): string {
    return value
      .replace(/&#0?39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
}
