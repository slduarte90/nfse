import { BadRequestException, Body, Controller, Param, Post, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountRole, CertificateStatus, CompanyUserStatus, UserRole } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
import { PrismaService } from '../database/prisma.service';

@UseGuards(AuthGuard)
@Controller('companies/:companyId/nfse/settings/certificate')
export class NfseCertificatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async uploadCertificate(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() dto: any) {
    await this.ensureCompanyAccess(user.id, user.accountRole, companyId);

    const fileName = String(dto.fileName || '').trim();
    const fileBase64 = String(dto.fileBase64 || '').trim();
    const password = String(dto.password || '');

    if (!fileName) throw new BadRequestException('Nome do arquivo do certificado não informado.');
    if (!/\.(pfx|p12)$/i.test(fileName)) throw new BadRequestException('Envie um certificado A1 no formato .pfx ou .p12.');
    if (!fileBase64) throw new BadRequestException('Conteúdo do certificado não informado.');
    if (!password) throw new BadRequestException('Senha do certificado não informada.');

    const storageDir = join(process.cwd(), 'storage', 'certificates', companyId);
    mkdirSync(storageDir, { recursive: true });

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedFileName = `${Date.now()}-${safeName}`;
    const storedPath = join(storageDir, storedFileName);
    const buffer = Buffer.from(fileBase64.replace(/^data:.*;base64,/, ''), 'base64');

    if (!buffer.length) throw new BadRequestException('Certificado inválido ou vazio.');

    writeFileSync(storedPath, buffer);

    const certificate = await this.prisma.digitalCertificate.create({
      data: {
        companyId,
        originalFileName: fileName,
        encryptedPath: storedPath,
        encryptedPassword: password,
        status: CertificateStatus.PENDING,
      },
    });

    const settings = await this.prisma.nfseSettings.upsert({
      where: { companyId },
      update: { certificateId: certificate.id, lastCertificateValidated: new Date() },
      create: { companyId, certificateId: certificate.id, lastCertificateValidated: new Date() },
    });

    return { certificate, settings };
  }

  private async ensureCompanyAccess(userId: string, accountRole: AccountRole, companyId: string) {
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
    if (link.role === UserRole.VIEWER) throw new ForbiddenException('Perfil sem permissão de alteração.');
  }
}
