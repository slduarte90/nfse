import { BadRequestException, Injectable } from '@nestjs/common';
import { Company, Customer, NfseEnvironment, NfseInvoice, NfseService, NfseSettings } from '@prisma/client';
import * as https from 'node:https';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as forge from 'node-forge';

export type NfseNationalResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json?: unknown;
};

type NationalRequestOptions = {
  method: 'GET' | 'POST';
  path: string;
  body?: string | Buffer;
  contentType?: string;
  settings: NfseSettings;
  baseUrl?: string;
  pfxPath?: string | null;
  pfxPassword?: string | null;
};

type TransmittableInvoice = NfseInvoice & {
  company?: Company | null;
  customer?: Customer | null;
  service?: NfseService | null;
};

@Injectable()
export class NfseNationalApiService {
  getDefaultBaseUrl(environment: NfseEnvironment) {
    return environment === NfseEnvironment.PRODUCTION
      ? 'https://sefin.nfse.gov.br/SefinNacional'
      : 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional';
  }

  getDefaultAdnBaseUrl(environment: NfseEnvironment) {
    return environment === NfseEnvironment.PRODUCTION
      ? 'https://adn.nfse.gov.br/contribuintes'
      : 'https://adn.producaorestrita.nfse.gov.br/contribuintes';
  }

  generateDpsXml(settings: NfseSettings, invoice: TransmittableInvoice) {
    const company = invoice.company;
    if (!company) throw new BadRequestException('Dados da empresa nao carregados para gerar a DPS.');
    if (!invoice.customer) throw new BadRequestException('Tomador nao carregado para gerar a DPS.');

    const competenceDate = invoice.competenceDate?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10);
    const apiVersion = settings.apiVersion || '1.01';
    const environment = settings.environment === NfseEnvironment.PRODUCTION ? '1' : '2';
    const issuerCityCode = settings.municipalIbgeCode || invoice.municipalIbgeCode || '';
    const serviceCityCode = invoice.municipalIbgeCode || issuerCityCode;
    const municipalTaxCode = invoice.municipalServiceCode || invoice.serviceCode || invoice.service?.municipalServiceCode || '';
    const series = this.normalizeSeries(invoice.rpsSeries || invoice.series || settings.defaultRpsSeries || '1');
    const number = this.normalizeDpsNumber(invoice.rpsNumber || invoice.number || '1');
    const dpsId = this.buildDpsId(issuerCityCode, company.cnpj, series, number);
    const nationalTaxCode = this.onlyDigits(invoice.nationalTaxCode || invoice.service?.nationalTaxCode || '');
    const amount = this.formatDecimal(invoice.amount);
    const discounts = this.formatOptionalDecimal(invoice.discounts);
    const deductions = this.formatOptionalDecimal(invoice.deductions);
    const issRate = this.formatOptionalDecimal(invoice.issRate);
    const opSimpNac = this.simpleNationalOption(settings);
    const regApTribSN = this.simpleNationalCalculationRegime(opSimpNac);
    const regEspTrib = this.specialTaxRegime(settings);
    const totalTaxLines = this.totalTaxXml(opSimpNac);
    const customerDocument = this.personDocumentXml(invoice.customer.document, 'tomador');
    const issuerDocument = this.personDocumentXml(company.cnpj, 'prestador');
    const additionalInformation = invoice.additionalInformation?.trim();

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<DPS versao="${this.escapeXml(apiVersion)}" xmlns="http://www.sped.fazenda.gov.br/nfse">`,
      `  <infDPS xmlns="http://www.sped.fazenda.gov.br/nfse" Id="${this.escapeXml(invoice.dpsId || dpsId)}">`,
      `    <tpAmb>${environment}</tpAmb>`,
      // A Sefin rejeita dhEmi posterior ao processamento; a margem evita falha por poucos segundos de diferenca de relogio.
      `    <dhEmi>${this.formatDateTimeWithOffset(new Date(Date.now() - 60_000))}</dhEmi>`,
      '    <verAplic>ZIP-NFSe-0.1</verAplic>',
      `    <serie>${series}</serie>`,
      `    <nDPS>${number}</nDPS>`,
      `    <dCompet>${competenceDate}</dCompet>`,
      '    <tpEmit>1</tpEmit>',
      `    <cLocEmi>${this.escapeXml(issuerCityCode)}</cLocEmi>`,
      '    <prest>',
      `      ${issuerDocument}`,
      settings.municipalRegistration || company.municipalRegistration ? `      <IM>${this.escapeXml(settings.municipalRegistration || company.municipalRegistration || '')}</IM>` : '',
      '      <regTrib>',
      `        <opSimpNac>${opSimpNac}</opSimpNac>`,
      regApTribSN ? `        <regApTribSN>${regApTribSN}</regApTribSN>` : '',
      `        <regEspTrib>${regEspTrib}</regEspTrib>`,
      '      </regTrib>',
      '    </prest>',
      '    <toma>',
      `      ${customerDocument}`,
      invoice.customer.municipalRegistration ? `      <IM>${this.escapeXml(invoice.customer.municipalRegistration)}</IM>` : '',
      `      <xNome>${this.escapeXml(invoice.customer.name)}</xNome>`,
      invoice.customer.phone ? `      <fone>${this.escapeXml(this.onlyDigits(invoice.customer.phone))}</fone>` : '',
      invoice.customer.email ? `      <email>${this.escapeXml(invoice.customer.email)}</email>` : '',
      '    </toma>',
      '    <serv>',
      '      <locPrest>',
      `        <cLocPrestacao>${this.escapeXml(serviceCityCode)}</cLocPrestacao>`,
      '      </locPrest>',
      '      <cServ>',
      `        <cTribNac>${this.escapeXml(nationalTaxCode)}</cTribNac>`,
      municipalTaxCode ? `        <cTribMun>${this.escapeXml(municipalTaxCode)}</cTribMun>` : '',
      `        <xDescServ>${this.escapeXml(invoice.serviceDescription)}</xDescServ>`,
      invoice.service?.nbsCode ? `        <cNBS>${this.escapeXml(this.onlyDigits(invoice.service.nbsCode))}</cNBS>` : '',
      '      </cServ>',
      additionalInformation ? '      <infoCompl>' : '',
      additionalInformation ? `        <xInfComp>${this.escapeXml(additionalInformation)}</xInfComp>` : '',
      additionalInformation ? '      </infoCompl>' : '',
      '    </serv>',
      '    <valores>',
      '      <vServPrest>',
      `        <vServ>${amount}</vServ>`,
      '      </vServPrest>',
      discounts ? '      <vDescCondIncond>' : '',
      discounts ? `        <vDescIncond>${discounts}</vDescIncond>` : '',
      discounts ? '      </vDescCondIncond>' : '',
      deductions ? '      <vDedRed>' : '',
      deductions ? `        <vDR>${deductions}</vDR>` : '',
      deductions ? '      </vDedRed>' : '',
      '      <trib>',
      '        <tribMun>',
      '          <tribISSQN>1</tribISSQN>',
      `          <tpRetISSQN>${invoice.issWithheld ? '2' : '1'}</tpRetISSQN>`,
      issRate ? `          <pAliq>${issRate}</pAliq>` : '',
      '        </tribMun>',
      '        <totTrib>',
      ...totalTaxLines,
      '        </totTrib>',
      '      </trib>',
      '    </valores>',
      '  </infDPS>',
      '</DPS>',
    ].filter(Boolean).join('\n');
  }

  prepareDpsXml(settings: NfseSettings, invoice: TransmittableInvoice, pfxPath?: string | null, pfxPassword?: string | null) {
    const xml = this.generateDpsXml(settings, invoice);
    return pfxPath ? this.signDpsXml(xml, pfxPath, pfxPassword || '') : xml;
  }

  async transmitDps(settings: NfseSettings, invoice: TransmittableInvoice, pfxPath?: string | null, pfxPassword?: string | null, preparedXml?: string) {
    const xml = preparedXml || this.prepareDpsXml(settings, invoice, pfxPath, pfxPassword);
    const body = JSON.stringify({ dpsXmlGZipB64: gzipSync(Buffer.from(xml, 'utf8')).toString('base64') });
    return this.request({ method: 'POST', path: '/nfse', body, contentType: 'application/json; charset=utf-8', settings, pfxPath, pfxPassword });
  }

  async consultByAccessKey(settings: NfseSettings, accessKey: string, pfxPath?: string | null, pfxPassword?: string | null) {
    if (!accessKey) throw new BadRequestException('Chave de acesso da NFS-e não informada.');
    return this.request({ method: 'GET', path: `/nfse/${encodeURIComponent(accessKey)}`, settings, pfxPath, pfxPassword });
  }

  async consultEventsByAccessKey(settings: NfseSettings, accessKey: string, pfxPath?: string | null, pfxPassword?: string | null) {
    if (!accessKey) throw new BadRequestException('Chave de acesso da NFS-e nÃ£o informada.');
    return this.request({
      method: 'GET',
      path: `/NFSe/${encodeURIComponent(accessKey)}/Eventos`,
      settings,
      baseUrl: this.getDefaultAdnBaseUrl(settings.environment),
      pfxPath,
      pfxPassword,
    });
  }

  private request(options: NationalRequestOptions) {
    const baseUrl = this.normalizeBaseUrl(options.baseUrl || options.settings.apiBaseUrl || this.getDefaultBaseUrl(options.settings.environment));
    const url = new URL(`${baseUrl.replace(/\/$/, '')}${options.path}`);
    const payload = typeof options.body === 'string' ? Buffer.from(options.body, 'utf8') : options.body;

    const requestOptions: https.RequestOptions = {
      method: options.method,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : 443,
      path: `${url.pathname}${url.search}`,
      headers: {
        Accept: 'application/json, application/xml, text/xml, */*',
        'User-Agent': 'Zip-NFSe/0.1',
        ...(payload ? { 'Content-Type': options.contentType || 'application/json; charset=utf-8', 'Content-Length': payload.length } : {}),
      },
    };

    if (options.pfxPath) {
      const tlsCredentials = this.extractCertificateBundle(options.pfxPath, options.pfxPassword || '');
      requestOptions.key = forge.pki.privateKeyToPem(tlsCredentials.privateKey);
      requestOptions.cert = tlsCredentials.certificates.map((certificate) => forge.pki.certificateToPem(certificate)).join('\n');
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
      req.setTimeout(30000, () => req.destroy(new Error('Tempo limite ao comunicar com a API nacional de NFS-e.')));
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

  decodeGzipBase64(value: unknown) {
    if (!value || typeof value !== 'string') return null;
    try {
      return gunzipSync(Buffer.from(value, 'base64')).toString('utf8');
    } catch {
      return null;
    }
  }

  private buildDpsId(cityCode: string, document: string, series: string, number: string) {
    const digits = this.onlyDigits(document);
    const docType = digits.length <= 11 ? '1' : '2';
    const federalDocument = digits.length <= 11 ? digits.padStart(14, '0') : digits.padStart(14, '0').slice(-14);
    return `DPS${this.onlyDigits(cityCode).padStart(7, '0').slice(-7)}${docType}${federalDocument}${series.padStart(5, '0')}${number.padStart(15, '0')}`;
  }

  private normalizeSeries(value: string) {
    const digits = this.onlyDigits(value).replace(/^0+(?=\d)/, '');
    return (digits || '1').slice(0, 5);
  }

  private normalizeDpsNumber(value: string) {
    const digits = this.onlyDigits(value).replace(/^0+(?=\d)/, '');
    return (digits || '1').slice(0, 15);
  }

  private personDocumentXml(document: string, label: string) {
    const digits = this.onlyDigits(document);
    if (digits.length === 14) return `<CNPJ>${digits}</CNPJ>`;
    if (digits.length === 11) return `<CPF>${digits}</CPF>`;
    throw new BadRequestException(`Documento do ${label} deve ser CPF ou CNPJ valido para emissao nacional.`);
  }

  private simpleNationalOption(settings: NfseSettings) {
    if (settings.taxRegime === 'MEI') return '2';
    if (settings.taxRegime === 'SIMPLE_NATIONAL' || settings.isSimpleNational) return '3';
    return '1';
  }

  private specialTaxRegime(settings: NfseSettings) {
    const value = this.onlyDigits(settings.specialTaxRegime || '');
    return ['0', '1', '2', '3', '4', '5', '6', '9'].includes(value) ? value : '0';
  }

  private simpleNationalCalculationRegime(opSimpNac: string) {
    return opSimpNac === '3' ? '1' : '';
  }

  private totalTaxXml(opSimpNac: string) {
    if (opSimpNac === '3') {
      return ['          <pTotTribSN>0</pTotTribSN>'];
    }
    if (opSimpNac === '1') {
      return [
        '          <vTotTrib>',
        '            <vTotTribFed>0.00</vTotTribFed>',
        '            <vTotTribEst>0.00</vTotTribEst>',
        '            <vTotTribMun>0.00</vTotTribMun>',
        '          </vTotTrib>',
      ];
    }
    return ['          <indTotTrib>0</indTotTrib>'];
  }

  private formatDecimal(value: { toString(): string } | number | string) {
    const number = Number(this.normalizeDecimal(value));
    if (!Number.isFinite(number)) return '0.00';
    return number.toFixed(2);
  }

  private formatOptionalDecimal(value: { toString(): string } | number | string | null) {
    if (value === null || value === undefined) return '';
    const formatted = this.formatDecimal(value);
    return Number(formatted) > 0 ? formatted : '';
  }

  private formatDateTimeWithOffset(date: Date) {
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const offset = `${sign}${String(Math.floor(absOffset / 60)).padStart(2, '0')}:${String(absOffset % 60).padStart(2, '0')}`;
    const local = new Date(date.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19);
    return `${local}${offset}`;
  }

  private onlyDigits(value: string) {
    return String(value || '').replace(/\D/g, '');
  }

  private normalizeDecimal(value: { toString(): string } | number | string) {
    const text = String(value ?? '').trim().replace(/\s/g, '').replace(/[^\d,.]/g, '');
    if (!text) return '';
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    let separatorIndex = Math.max(lastComma, lastDot);
    if (separatorIndex >= 0 && lastComma < 0 && lastDot >= 0) {
      const fractionCandidate = this.onlyDigits(text.slice(lastDot + 1));
      if (fractionCandidate.length > 2) separatorIndex = -1;
    }
    const integerDigits = this.onlyDigits(separatorIndex >= 0 ? text.slice(0, separatorIndex) : text);
    const fractionDigits = separatorIndex >= 0 ? this.onlyDigits(text.slice(separatorIndex + 1)).slice(0, 2) : '';
    return fractionDigits ? `${integerDigits || '0'}.${fractionDigits}` : integerDigits || '0';
  }

  private normalizeBaseUrl(value: string) {
    return String(value || '').trim().replace(/\/API\/SefinNacional\/?$/i, '/SefinNacional');
  }

  private signDpsXml(xml: string, pfxPath: string, password: string) {
    const credentials = this.extractCertificateBundle(pfxPath, password);
    const infDpsMatch = xml.match(/<infDPS\b[\s\S]*<\/infDPS>/);
    const idMatch = xml.match(/<infDPS\b[^>]*\bId="([^"]+)"/);
    if (!infDpsMatch || !idMatch) throw new BadRequestException('Nao foi possivel identificar a infDPS para assinatura.');

    const digestValue = this.sha256Base64(infDpsMatch[0]);
    const signedInfo = [
      '    <SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">',
      '      <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>',
      '      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>',
      `      <Reference URI="#${this.escapeXml(idMatch[1])}">`,
      '        <Transforms>',
      '          <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>',
      '          <Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>',
      '        </Transforms>',
      '        <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>',
      `        <DigestValue>${digestValue}</DigestValue>`,
      '      </Reference>',
      '    </SignedInfo>',
    ].join('\n');
    const md = forge.md.sha256.create();
    md.update(signedInfo.replace(/^\s+/, ''), 'utf8');
    const signatureValue = forge.util.encode64(credentials.privateKey.sign(md));
    const certificateValue = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(credentials.certificates[0])).getBytes());
    const signature = [
      '  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">',
      signedInfo,
      `    <SignatureValue>${signatureValue}</SignatureValue>`,
      '    <KeyInfo>',
      '      <X509Data>',
      `        <X509Certificate>${certificateValue}</X509Certificate>`,
      '      </X509Data>',
      '    </KeyInfo>',
      '  </Signature>',
    ].join('\n');
    return xml.replace('\n</DPS>', `\n${signature}\n</DPS>`);
  }

  private extractCertificateBundle(pfxPath: string, password: string) {
    try {
      const p12Asn1 = forge.asn1.fromDer(readFileSync(pfxPath).toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
      let privateKey: forge.pki.PrivateKey | null = null;
      const certificates: forge.pki.Certificate[] = [];

      for (const safeContent of p12.safeContents) {
        for (const safeBag of safeContent.safeBags) {
          if ((safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag) && safeBag.key) privateKey = safeBag.key;
          if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) certificates.push(safeBag.cert);
        }
      }

      if (!privateKey || certificates.length === 0) throw new Error('Certificado sem chave privada ou cadeia valida.');
      return { privateKey, certificates };
    } catch {
      throw new BadRequestException('Nao foi possivel preparar o certificado A1. Confira o arquivo e a senha informada.');
    }
  }

  private sha256Base64(value: string) {
    const md = forge.md.sha256.create();
    md.update(value, 'utf8');
    return forge.util.encode64(md.digest().getBytes());
  }
}
