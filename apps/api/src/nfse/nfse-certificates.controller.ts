import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountRole, CertificateStatus, CompanyUserStatus, DigitalCertificate, UserRole } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as forge from 'node-forge';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
import { PrismaService } from '../database/prisma.service';

@UseGuards(AuthGuard)
@Controller('companies/:companyId/nfse/settings/certificate')
export class NfseCertificatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getCurrentCertificate(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string) {
    await this.ensureCompanyAccess(user.id, user.accountRole, companyId, false);
    const settings = await this.prisma.nfseSettings.findUnique({ where: { companyId } });
    const certificate = settings?.certificateId
      ? await this.prisma.digitalCertificate.findFirst({ where: { id: settings.certificateId, companyId } })
      : null;

    if (!certificate) return { certificate: null };

    if (certificate.status === CertificateStatus.REVOKED || certificate.status === CertificateStatus.INVALID) {
      await this.prisma.nfseSettings.updateMany({ where: { companyId }, data: { certificateId: null, lastCertificateValidated: null } });
      return { certificate: null };
    }

    const hydrated = await this.hydrateCertificateMetadata(certificate);
    return { certificate: this.toCertificateSummary(hydrated) };
  }

  @Post()
  async uploadCertificate(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() dto: any) {
    await this.ensureCompanyAccess(user.id, user.accountRole, companyId, true);

    const fileName = String(dto.fileName || '').trim();
    const fileBase64 = String(dto.fileBase64 || '').trim();
    const password = String(dto.password || '');

    if (!fileName) throw new BadRequestException('Nome do arquivo do certificado não informado.');
    if (!/\.(pfx|p12)$/i.test(fileName)) throw new BadRequestException('Envie um certificado A1 no formato .pfx ou .p12.');
    if (!fileBase64) throw new BadRequestException('Conteúdo do certificado não informado.');
    if (!password) throw new BadRequestException('Senha do certificado não informada.');

    const buffer = Buffer.from(fileBase64.replace(/^data:.*;base64,/, ''), 'base64');
    if (!buffer.length) throw new BadRequestException('Certificado inválido ou vazio.');

    const parsed = this.parseCertificate(buffer, password);
    await this.ensureCertificateBelongsToCompany(companyId, parsed.documentNumbers);

    const storageDir = join(process.cwd(), 'storage', 'certificates', companyId);
    mkdirSync(storageDir, { recursive: true });

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedFileName = `${Date.now()}-${safeName}`;
    const storedPath = join(storageDir, storedFileName);
    writeFileSync(storedPath, buffer);

    const currentSettings = await this.prisma.nfseSettings.findUnique({ where: { companyId } });
    if (currentSettings?.certificateId) {
      await this.prisma.digitalCertificate.updateMany({
        where: { id: currentSettings.certificateId, companyId },
        data: { status: CertificateStatus.REVOKED },
      });
    }

    const certificate = await this.prisma.digitalCertificate.create({
      data: {
        companyId,
        originalFileName: fileName,
        encryptedPath: storedPath,
        encryptedPassword: password,
        subjectName: parsed.subjectName,
        issuerName: parsed.issuerName,
        serialNumber: parsed.serialNumber,
        validFrom: parsed.validFrom,
        validUntil: parsed.validUntil,
        status: parsed.validUntil && parsed.validUntil < new Date() ? CertificateStatus.EXPIRED : CertificateStatus.VALID,
      },
    });

    const settings = await this.prisma.nfseSettings.upsert({
      where: { companyId },
      update: { certificateId: certificate.id, lastCertificateValidated: new Date() },
      create: { companyId, certificateId: certificate.id, lastCertificateValidated: new Date() },
    });

    return { certificate: this.toCertificateSummary(certificate), settings };
  }

  private async hydrateCertificateMetadata(certificate: DigitalCertificate): Promise<DigitalCertificate> {
    if (certificate.subjectName && certificate.validUntil) return certificate;
    if (!certificate.encryptedPassword || !existsSync(certificate.encryptedPath)) return certificate;

    try {
      const parsed = this.parseCertificate(readFileSync(certificate.encryptedPath), certificate.encryptedPassword);
      return this.prisma.digitalCertificate.update({
        where: { id: certificate.id },
        data: {
          subjectName: parsed.subjectName,
          issuerName: parsed.issuerName,
          serialNumber: parsed.serialNumber,
          validFrom: parsed.validFrom,
          validUntil: parsed.validUntil,
          status: parsed.validUntil && parsed.validUntil < new Date() ? CertificateStatus.EXPIRED : CertificateStatus.VALID,
        },
      });
    } catch {
      return certificate;
    }
  }

  private parseCertificate(buffer: Buffer, password: string) {
    try {
      const p12Asn1 = forge.asn1.fromDer(buffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
      const cert = certBags.map((bag) => bag.cert).find(Boolean);
      if (!cert) throw new Error('Certificado não encontrado dentro do arquivo.');

      const attributeText = [...cert.subject.attributes, ...cert.issuer.attributes]
        .map((attribute) => String(attribute.value || ''))
        .join(' ');

      return {
        subjectName: this.formatCertificateName(cert.subject.attributes),
        issuerName: this.formatCertificateName(cert.issuer.attributes),
        serialNumber: cert.serialNumber || null,
        validFrom: cert.validity.notBefore || null,
        validUntil: cert.validity.notAfter || null,
        documentNumbers: this.extractDocumentNumbers(attributeText),
      };
    } catch {
      throw new BadRequestException('Não foi possível validar o certificado. Confira se o arquivo e a senha estão corretos.');
    }
  }

  private async ensureCertificateBelongsToCompany(companyId: string, certificateDocuments: string[]) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { cnpj: true } });
    if (!company) throw new NotFoundException('Empresa não encontrada.');

    const companyCnpj = this.onlyDigits(company.cnpj);
    if (!certificateDocuments.includes(companyCnpj)) {
      throw new BadRequestException('Certificado não corresponde ao CNPJ correto!');
    }
  }

  private extractDocumentNumbers(value: string) {
    const digits = this.onlyDigits(value);
    const documents = new Set<string>();
    for (let index = 0; index <= digits.length - 14; index += 1) {
      const candidate = digits.slice(index, index + 14);
      if (/^\d{14}$/.test(candidate)) documents.add(candidate);
    }
    return Array.from(documents);
  }

  private onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }

  private formatCertificateName(attributes: forge.pki.CertificateField[]) {
    const cn = attributes.find((item) => item.shortName === 'CN')?.value;
    const o = attributes.find((item) => item.shortName === 'O')?.value;
    return String(cn || o || '').trim() || null;
  }

  private toCertificateSummary(certificate: DigitalCertificate) {
    return {
      id: certificate.id,
      originalFileName: certificate.originalFileName,
      subjectName: certificate.subjectName,
      issuerName: certificate.issuerName,
      serialNumber: certificate.serialNumber,
      validFrom: certificate.validFrom,
      validUntil: certificate.validUntil,
      status: certificate.status,
      createdAt: certificate.createdAt,
    };
  }

  private async ensureCompanyAccess(userId: string, accountRole: AccountRole, companyId: string, write = false) {
    if (accountRole === AccountRole.ADMIN) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
      if (!company) throw new NotFoundException('Empresa não encontrada.');
      return;
    }

    const link = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { role: true, status: true, company: { select: { isActive: true } } },
    });

    if (!link || !link.company.isActive || link.status !== CompanyUserStatus.ACTIVE) throw new ForbiddenException('Acesso não autorizado à empresa.');
    if (write && link.role === UserRole.VIEWER) throw new ForbiddenException('Perfil sem permissão de alteração.');
  }
}
