import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

type MailAttachment = {
  fileName: string;
  content: Buffer;
  mimeType: string;
};

export type SmtpTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string | null;
  pass?: string | null;
  from: string;
  fromName?: string | null;
};

type InvoiceMailInput = {
  to: string;
  companyName: string;
  customerName: string;
  invoiceNumber: string;
  accessKey: string;
  amount: string;
  issuedAt: string;
  cancelledAt?: string;
  attachments: MailAttachment[];
  trackingUrl?: string;
};

type PasswordResetMailInput = {
  to: string;
  name: string;
  resetUrl: string;
  expiresMinutes: number;
};

type InvitationMailInput = {
  to: string;
  name: string;
  inviteUrl: string;
  companies: string[];
  expiresAt: Date;
  alreadyLinkedUser?: boolean;
};

@Injectable()
export class MailerService {
  private transport: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(smtp?: SmtpTransportConfig | null) {
    if (smtp) return Boolean(smtp.host && smtp.from);
    return Boolean(this.config.get<string>('SMTP_HOST') && this.config.get<string>('SMTP_FROM'));
  }

  formatDeliveryError(error: unknown) {
    const raw = error instanceof Error ? error.message : 'Falha ao enviar e-mail.';
    const meta = error && typeof error === 'object' ? error as { code?: string; responseCode?: number } : {};
    const smtpPass = String(this.config.get<string>('SMTP_PASS') || '');
    const smtpUser = String(this.config.get<string>('SMTP_USER') || '');
    let sanitized = raw;
    if (smtpPass) sanitized = sanitized.replace(smtpPass, '[senha protegida]');
    if (smtpUser) sanitized = sanitized.replace(smtpUser, '[usuario protegido]');
    sanitized = sanitized.replace(/pass(word)?=[^&\s]+/gi, 'pass=***').slice(0, 500);

    if (meta.responseCode === 534 || /Application-specific password required|InvalidSecondFactor/i.test(sanitized)) {
      return 'SMTP recusou a autenticação. Para Gmail, gere e use uma senha de app em vez da senha normal da conta.';
    }
    if (meta.code === 'EAUTH' || /Invalid login|authentication failed|auth/i.test(sanitized)) {
      return 'SMTP recusou a autenticação. Verifique usuário, senha, porta e criptografia configurados.';
    }
    if (meta.code === 'ETIMEDOUT' || meta.code === 'ECONNECTION' || /timeout|ENOTFOUND|ECONNREFUSED|connect/i.test(sanitized)) {
      return 'Não foi possível conectar ao servidor SMTP. Verifique host, porta, criptografia e liberação de rede.';
    }
    return sanitized || 'Falha ao enviar e-mail.';
  }
  async sendInvoiceIssued(input: InvoiceMailInput, smtp?: SmtpTransportConfig | null) {
    const transporter = this.getTransporter(smtp);
    const fromName = smtp?.fromName || this.config.get<string>('SMTP_FROM_NAME') || 'ZIP Contabilidade';
    const from = smtp?.from || this.config.get<string>('SMTP_FROM') || '';
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
      ${input.trackingUrl ? `<img src="${this.escapeHtml(input.trackingUrl)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;opacity:0;">` : ''}
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

  async sendInvoiceCancelled(input: InvoiceMailInput, smtp?: SmtpTransportConfig | null) {
    const transporter = this.getTransporter(smtp);
    const fromName = smtp?.fromName || this.config.get<string>('SMTP_FROM_NAME') || 'ZIP Contabilidade';
    const from = smtp?.from || this.config.get<string>('SMTP_FROM') || '';
    const subject = `NFS-e cancelada - ${input.companyName} - Nota ${input.invoiceNumber}`;
    const text = [
      `Olá, ${input.customerName}.`,
      '',
      `Informamos que a Nota Fiscal de Serviço eletrônica nº ${input.invoiceNumber}, emitida por ${input.companyName}, foi cancelada.`,
      '',
      `Valor do serviço: ${input.amount}`,
      `Data de emissão: ${input.issuedAt}`,
      input.cancelledAt ? `Data de cancelamento: ${input.cancelledAt}` : '',
      `Chave de acesso: ${input.accessKey}`,
      '',
      'Encaminhamos em anexo o PDF atualizado e o XML disponível para conferência.',
      '',
      'Atenciosamente,',
      fromName,
    ].filter((line) => line !== '').join('\n');
    const html = `
      <p>Olá, ${this.escapeHtml(input.customerName)}.</p>
      <p>Informamos que a <strong>Nota Fiscal de Serviço eletrônica nº ${this.escapeHtml(input.invoiceNumber)}</strong>, emitida por <strong>${this.escapeHtml(input.companyName)}</strong>, foi <strong>cancelada</strong>.</p>
      <p>
        <strong>Valor do serviço:</strong> ${this.escapeHtml(input.amount)}<br>
        <strong>Data de emissão:</strong> ${this.escapeHtml(input.issuedAt)}<br>
        ${input.cancelledAt ? `<strong>Data de cancelamento:</strong> ${this.escapeHtml(input.cancelledAt)}<br>` : ''}
        <strong>Chave de acesso:</strong> ${this.escapeHtml(input.accessKey)}
      </p>
      <p>Encaminhamos em anexo o PDF atualizado e o XML disponível para conferência.</p>
      <p>Atenciosamente,<br>${this.escapeHtml(fromName)}</p>
      ${input.trackingUrl ? `<img src="${this.escapeHtml(input.trackingUrl)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;opacity:0;">` : ''}
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
  async sendPasswordReset(input: PasswordResetMailInput) {
    const transporter = this.getTransporter();
    const fromName = this.config.get<string>('SMTP_FROM_NAME') || 'ZIP Contabilidade';
    const from = this.config.get<string>('SMTP_FROM') || '';
    const subject = 'Recuperação de senha - Portal do Cliente';
    const text = [
      `Olá, ${input.name}.`,
      '',
      'Recebemos uma solicitação para redefinir sua senha no Portal do Cliente.',
      `Use o link abaixo em até ${input.expiresMinutes} minutos:`,
      '',
      input.resetUrl,
      '',
      'Se você não solicitou essa alteração, ignore este e-mail.',
      '',
      'Atenciosamente,',
      fromName,
    ].join('\n');
    const html = `
      <p>Olá, ${this.escapeHtml(input.name)}.</p>
      <p>Recebemos uma solicitação para redefinir sua senha no Portal do Cliente.</p>
      <p><a href="${this.escapeHtml(input.resetUrl)}" target="_blank" rel="noreferrer">Redefinir minha senha</a></p>
      <p>Este link expira em ${input.expiresMinutes} minutos.</p>
      <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
      <p>Atenciosamente,<br>${this.escapeHtml(fromName)}</p>
    `;
    return transporter.sendMail({
      from: `"${fromName}" <${from}>`,
      to: input.to,
      subject,
      text,
      html,
    });
  }

  async sendInvitation(input: InvitationMailInput) {
    const transporter = this.getTransporter();
    const fromName = this.config.get<string>('SMTP_FROM_NAME') || 'ZIP Contabilidade';
    const from = this.config.get<string>('SMTP_FROM') || '';
    const subject = 'Seu acesso ao Portal do Cliente ZIP';
    const companyListText = input.companies.map((company) => `- ${company}`).join('\n');
    const companyListHtml = input.companies.map((company) => `<li>${this.escapeHtml(company)}</li>`).join('');
    const expiresAt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(input.expiresAt);
    const actionText = input.alreadyLinkedUser
      ? 'Seu usuário já existe. O link abaixo confirma o convite e leva você para o acesso ao portal.'
      : 'Use o link abaixo para criar sua senha e ativar seu acesso.';
    const text = [
      `Olá, ${input.name}.`,
      '',
      'Você recebeu acesso ao Portal do Cliente ZIP Contabilidade.',
      input.companies.length ? 'Empresas liberadas:' : '',
      companyListText,
      '',
      actionText,
      '',
      input.inviteUrl,
      '',
      `O convite expira em ${expiresAt}.`,
      '',
      'Atenciosamente,',
      fromName,
    ].filter((line) => line !== '').join('\n');
    const html = `
      <p>Olá, ${this.escapeHtml(input.name)}.</p>
      <p>Você recebeu acesso ao <strong>Portal do Cliente ZIP Contabilidade</strong>.</p>
      ${companyListHtml ? `<p>Empresas liberadas:</p><ul>${companyListHtml}</ul>` : ''}
      <p>${this.escapeHtml(actionText)}</p>
      <p><a href="${this.escapeHtml(input.inviteUrl)}" target="_blank" rel="noreferrer">Acessar convite</a></p>
      <p>O convite expira em ${this.escapeHtml(expiresAt)}.</p>
      <p>Atenciosamente,<br>${this.escapeHtml(fromName)}</p>
    `;
    return transporter.sendMail({
      from: `"${fromName}" <${from}>`,
      to: input.to,
      subject,
      text,
      html,
    });
  }

  private getTransporter(smtp?: SmtpTransportConfig | null) {
    if (smtp) {
      if (!smtp.host || !smtp.from) throw new Error('SMTP nao configurado para envio de e-mail.');
      return createTransport({
        host: smtp.host,
        port: smtp.port || 587,
        secure: smtp.secure,
        auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
      });
    }

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
