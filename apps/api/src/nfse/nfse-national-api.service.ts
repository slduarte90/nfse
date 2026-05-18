import { BadRequestException, Injectable } from '@nestjs/common';
import { NfseEnvironment, NfseInvoice, NfseSettings } from '@prisma/client';
import * as https from 'node:https';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

export type NfseNationalResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json?: unknown;
};

type NationalRequestOptions = {
  method: 'GET' | 'POST';
  path: string;
  body?: string;
  settings: NfseSettings;
  pfxPath?: string | null;
  pfxPassword?: string | null;
};

@Injectable()
export class NfseNationalApiService {
  getDefaultBaseUrl(environment: NfseEnvironment) {
    return environment === NfseEnvironment.PRODUCTION
      ? 'https://adn.nfse.gov.br/contribuintes'
      : 'https://adn.producaorestrita.nfse.gov.br/contribuintes';
  }

  generateDpsXml(invoice: NfseInvoice) {
    const competenceDate = invoice.competenceDate?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10);
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<DPS>',
      `  <infDPS Id="${this.escapeXml(invoice.dpsId || `DPS${invoice.id}`)}">`,
      `    <dhEmi>${new Date().toISOString()}</dhEmi>`,
      `    <dCompet>${competenceDate}</dCompet>`,
      `    <cLocIncid>${this.escapeXml(invoice.municipalIbgeCode || '')}</cLocIncid>`,
      '    <serv>',
      `      <cTribNac>${this.escapeXml(invoice.nationalTaxCode || '')}</cTribNac>`,
      `      <cTribMun>${this.escapeXml(invoice.municipalServiceCode || invoice.serviceCode || '')}</cTribMun>`,
      `      <xDescServ>${this.escapeXml(invoice.serviceDescription)}</xDescServ>`,
      '    </serv>',
      '    <valores>',
      `      <vServ>${invoice.amount.toFixed(2)}</vServ>`,
      invoice.deductions ? `      <vDed>${invoice.deductions.toFixed(2)}</vDed>` : '',
      invoice.discounts ? `      <vDescIncond>${invoice.discounts.toFixed(2)}</vDescIncond>` : '',
      '    </valores>',
      '  </infDPS>',
      '</DPS>',
    ].filter(Boolean).join('\n');
  }

  async transmitDps(settings: NfseSettings, invoice: NfseInvoice, pfxPath?: string | null, pfxPassword?: string | null) {
    const xml = this.generateDpsXml(invoice);
    return this.request({ method: 'POST', path: '/nfse', body: xml, settings, pfxPath, pfxPassword });
  }

  async consultByAccessKey(settings: NfseSettings, accessKey: string, pfxPath?: string | null, pfxPassword?: string | null) {
    if (!accessKey) throw new BadRequestException('Chave de acesso da NFS-e não informada.');
    return this.request({ method: 'GET', path: `/nfse/${encodeURIComponent(accessKey)}`, settings, pfxPath, pfxPassword });
  }

  private request(options: NationalRequestOptions) {
    const baseUrl = options.settings.apiBaseUrl || this.getDefaultBaseUrl(options.settings.environment);
    const url = new URL(`${baseUrl.replace(/\/$/, '')}${options.path}`);
    const payload = options.body ? Buffer.from(options.body, 'utf8') : undefined;

    const requestOptions: https.RequestOptions = {
      method: options.method,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : 443,
      path: `${url.pathname}${url.search}`,
      headers: {
        Accept: 'application/json, application/xml, text/xml, */*',
        ...(payload ? { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Length': payload.length } : {}),
      },
    };

    if (options.pfxPath) {
      requestOptions.pfx = readFileSync(options.pfxPath);
      if (options.pfxPassword) requestOptions.passphrase = options.pfxPassword;
    }

    return new Promise<NfseNationalResponse>((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          let json: unknown;
          try { json = body ? JSON.parse(body) : undefined; } catch { json = undefined; }
          resolve({ statusCode: res.statusCode || 0, headers: res.headers, body, json });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  private escapeXml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
