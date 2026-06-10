import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';
const DEV_FALLBACK = 'change-me-32-bytes-minimum';

/**
 * Cifra simétrica para segredos sensíveis em repouso (ex.: senha do certificado A1).
 * Usa AES-256-GCM com IV aleatório por operação e tag de autenticação.
 * O valor cifrado é empacotado como `enc:v1:<iv>:<tag>:<ciphertext>` (base64),
 * o que permite distinguir um segredo cifrado de um legado em texto puro.
 */
@Injectable()
export class CryptoService {
  constructor(private readonly config: ConfigService) {}

  isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(stored: string): string {
    // Compatibilidade: valores antigos (pré-criptografia) ficam em texto puro.
    if (!this.isEncrypted(stored)) return stored;
    const [, , ivB64, tagB64, ctB64] = stored.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  }

  private key(): Buffer {
    const secret = this.config.get<string>('CERTIFICATE_ENCRYPTION_KEY')?.trim();
    if (!secret || secret === DEV_FALLBACK) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('CERTIFICATE_ENCRYPTION_KEY precisa ser configurada em producao.');
      }
      return createHash('sha256').update(DEV_FALLBACK).digest();
    }
    return createHash('sha256').update(secret).digest();
  }
}
