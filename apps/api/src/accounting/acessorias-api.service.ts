import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type AcessoriasQuery = Record<string, string | number | boolean | undefined | null>;

type AcessoriasAttachment = { fileName: string; mimeType: string; buffer: Buffer };

@Injectable()
export class AcessoriasApiService {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('ACESSORIAS_API_BASE_URL') || 'https://api.acessorias.com').replace(/\/$/, '');
  }

  listDeliveries(identifier: string, query: AcessoriasQuery) {
    return this.request<unknown[]>(`/deliveries/${encodeURIComponent(identifier)}/`, query);
  }

  getCompany(identifier: string, query: AcessoriasQuery) {
    return this.request<unknown>(`/companies/${encodeURIComponent(identifier)}/`, query);
  }

  listRequests(query: AcessoriasQuery) {
    return this.request<unknown[]>('/requests/ListAll', query);
  }

  getRequest(id: string) {
    return this.request<unknown>(`/requests/${encodeURIComponent(id)}`);
  }

  listProcesses(query: AcessoriasQuery) {
    return this.request<unknown[]>('/processes/ListAll', query);
  }

  getProcess(id: string) {
    return this.request<unknown>(`/processes/${encodeURIComponent(id)}`);
  }

  async createRequest(payload: { assunto: string; empresa: string; departamento: string; prioridade: string; descricao: string; tipo?: string; data_prazo?: string }, attachments: AcessoriasAttachment[] = []) {
    const form = new FormData();
    form.set('assunto', payload.assunto);
    form.set('empresa', payload.empresa);
    form.set('departamento', payload.departamento);
    form.set('prioridade', payload.prioridade);
    form.set('descricao', payload.descricao);
    form.set('tipo', payload.tipo || 'E');
    if (payload.data_prazo) form.set('data_prazo', payload.data_prazo);

    this.appendAttachments(form, attachments);

    return this.request<unknown>('/requests', {}, { method: 'POST', body: form });
  }

  async updateRequest(id: string, payload: { statusSol?: string; descricao?: string; assunto?: string; tipo?: string; departamento?: string; data_prazo?: string; reabrir?: string; descPrivate?: string }, attachments: AcessoriasAttachment[] = []) {
    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') form.set(key, value);
    });
    this.appendAttachments(form, attachments);
    return this.request<unknown>(`/requests/${encodeURIComponent(id)}`, {}, { method: 'POST', body: form });
  }

  async downloadFile(url: string) {
    const token = this.requiredToken();
    const safeUrl = this.safeDownloadUrl(url);
    const response = await fetch(safeUrl, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new BadRequestException('Nao foi possivel baixar o arquivo da Acessorias.');
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  private async request<T>(path: string, query: AcessoriasQuery = {}, options: RequestInit = {}): Promise<T> {
    const token = this.requiredToken();

    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method || 'GET',
        body: options.body,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new BadRequestException('Nao foi possivel comunicar com a API Acessorias agora.');
    }

    if (response.status === 204) return [] as T;

    const body = await response.text();
    const payload = this.parseJson(body);
    if (!response.ok) {
      const message = this.extractErrorMessage(payload, body) || `Falha na API Acessorias. Status ${response.status}.`;
      throw new BadRequestException(message.slice(0, 500));
    }
    return (payload ?? (body ? { rawBody: body } : [])) as T;
  }

  private requiredToken() {
    const token = this.config.get<string>('ACESSORIAS_API_TOKEN')?.trim();
    if (!token) throw new BadRequestException('Token da API Acessorias nao configurado no backend.');
    return token;
  }

  private safeDownloadUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value, this.baseUrl);
    } catch {
      throw new BadRequestException('URL de arquivo da Acessorias invalida.');
    }
    const allowedHost = this.allowedDownloadHosts().some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (url.protocol !== 'https:' || !allowedHost) throw new BadRequestException('URL de arquivo da Acessorias fora do dominio permitido.');
    return url;
  }

  private appendAttachments(form: FormData, attachments: AcessoriasAttachment[]) {
    const attachmentField = this.config.get<string>('ACESSORIAS_ATTACHMENT_FIELD')?.trim() || 'arquivo[]';
    attachments.forEach((attachment) => {
      const blob = new Blob([new Uint8Array(attachment.buffer)], { type: attachment.mimeType || 'application/octet-stream' });
      form.append(attachmentField, blob, attachment.fileName);
    });
  }

  private allowedDownloadHosts() {
    const base = new URL(this.baseUrl);
    const configured = (this.config.get<string>('ACESSORIAS_FILE_ALLOWED_HOSTS') || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    const defaults = base.hostname.endsWith('.acessorias.com') ? ['acessorias.com'] : [base.hostname];
    return Array.from(new Set([...defaults, ...configured]));
  }

  private parseJson(body: string) {
    try {
      return body ? JSON.parse(body) : null;
    } catch {
      return null;
    }
  }

  private extractErrorMessage(payload: unknown, body: string) {
    if (payload && typeof payload === 'object') {
      const candidate = payload as Record<string, unknown>;
      const value = candidate.Erro || candidate.erro || candidate.error || candidate.message || candidate.msg;
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return body?.trim();
  }
}
