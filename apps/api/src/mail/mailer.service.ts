import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

type MailAttachment = {
  fileName: string;
  content: Buffer;
  mimeType: string;
};

type InvoiceMailInput = {
  to: string;
  companyName: string;
  customerName: string;
  invoiceNumber: string;
  accessKey: string;
  amount: string;
  issuedAt: string;
  attachments: MailAttachment[];
};

@Injectable()
export class MailerService {
  private transport: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(this.config.get<string>('SMTP_HOST') && this.config.get<string>('SMTP_FROM'));
  }

  async sendInvoiceIssued(input: InvoiceMailInput) {
    const transporter = this.getTransporter();
    const fromName = this.config.get<string>('SMTP_FROM_NAME') || 'ZIP Contabilidade';
    const from = this.config.get<string>('SMTP_FROM') || '';
    const subject = `NFS-e emitida - ${input.companyName} - Nota ${input.invoiceNumber}`;
    const text = [
      `Olá, ${input.customerName}.`,
      '',
      `Informamos que a Nota Fiscal de Serviço eletrônica nº ${input.invoiceNumber}, emitida por ${input.companyName}, foi gerada com sucesso.`,
      '',
      `Valor do serviço: ${input.amount}`,
      `Data de emissão: ${input.issuedAt}`,
      `Chave de acesso: ${input.accessKey}`,
      '',
      'Encaminhamos em anexo o PDF para visualização e o XML oficial da NFS-e.',
      '',
      'Atenciosamente,',
      fromName,
    ].join('\n');
    const html = `
      <p>Olá, ${this.escapeHtml(input.customerName)}.</p>
      <p>Informamos que a <strong>Nota Fiscal de Serviço eletrônica nº ${this.escapeHtml(input.invoiceNumber)}</strong>, emitida por <strong>${this.escapeHtml(input.companyName)}</strong>, foi gerada com sucesso.</p>
      <p>
        <strong>Valor do serviço:</strong> ${this.escapeHtml(input.amount)}<br>
        <strong>Data de emissão:</strong> ${this.escapeHtml(input.issuedAt)}<br>
        <strong>Chave de acesso:</strong> ${this.escapeHtml(input.accessKey)}
      </p>
      <p>Encaminhamos em anexo o PDF para visualização e o XML oficial da NFS-e.</p>
      <p>Atenciosamente,<br>${this.escapeHtml(fromName)}</p>
    `;

    return transporter.sendMail({
      from: `"${fromName}" <${from}>`,
      to: input.to,
      subject,
      text,
      html,
      attachments: input.attachments.map((attachment) => ({
        filename: attachment.fileName,
        content: attachment.content,
        contentType: attachment.mimeType,
      })),
    });
  }

  private getTransporter() {
    if (this.transport) return this.transport;
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('SMTP_FROM');
    if (!host || !from) throw new Error('SMTP nao configurado para envio de e-mail.');
    const port = Number(this.config.get<string>('SMTP_PORT') || 587);
    const secure = ['true', '1', 'yes', 'sim'].includes(String(this.config.get<string>('SMTP_SECURE') || '').toLowerCase());
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    this.transport = createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
    return this.transport;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
