/*
 * Migração única: re-cifra as senhas de certificado A1 que estavam em texto puro.
 * Usa a mesma derivação de chave e empacotamento do CryptoService
 * (AES-256-GCM, formato `enc:v1:<iv>:<tag>:<ciphertext>` em base64).
 *
 * Executar a partir de apps/api:
 *   npx dotenv -e ../../.env -- node scripts/reencrypt-certificate-passwords.js
 */
const { PrismaClient } = require('@prisma/client');
const { createCipheriv, createHash, randomBytes } = require('node:crypto');

const PREFIX = 'enc:v1:';
const DEV_FALLBACK = 'change-me-32-bytes-minimum';

function key() {
  const secret = (process.env.CERTIFICATE_ENCRYPTION_KEY || '').trim();
  if (!secret || secret === DEV_FALLBACK) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CERTIFICATE_ENCRYPTION_KEY precisa ser configurada em producao.');
    }
    return createHash('sha256').update(DEV_FALLBACK).digest();
  }
  return createHash('sha256').update(secret).digest();
}

function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.digitalCertificate.findMany({
      where: { encryptedPassword: { not: null } },
      select: { id: true, encryptedPassword: true },
    });

    let migrated = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row.encryptedPassword || row.encryptedPassword.startsWith(PREFIX)) {
        skipped += 1;
        continue;
      }
      await prisma.digitalCertificate.update({
        where: { id: row.id },
        data: { encryptedPassword: encrypt(row.encryptedPassword) },
      });
      migrated += 1;
    }

    console.log(`Certificados verificados: ${rows.length}`);
    console.log(`Re-cifrados agora:        ${migrated}`);
    console.log(`Já cifrados (ignorados):  ${skipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao re-cifrar senhas de certificado:', error);
  process.exit(1);
});
