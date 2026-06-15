import type { CookieOptions, Response } from 'express';

// Nome do cookie httpOnly que carrega o JWT. O token nunca é exposto ao JavaScript do
// navegador (mitiga roubo via XSS); o front apenas envia o cookie com credentials: 'include'.
export const AUTH_COOKIE_NAME = 'nfse_access_token';

// Mantido em sincronia com signOptions.expiresIn do JwtModule (8h).
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

function baseCookieOptions(): CookieOptions {
  // Secure liga sozinho em produção; pode ser forçado por COOKIE_SECURE.
  const secure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
  // 'lax' cobre o cenário front+api no mesmo site (inclui portas diferentes em localhost
  // e subdomínios). Para front e api em sites realmente distintos, use 'none' + COOKIE_SECURE=true.
  const sameSite = (process.env.COOKIE_SAMESITE as CookieOptions['sameSite']) || 'lax';
  return { httpOnly: true, secure, sameSite, path: '/' };
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, { ...baseCookieOptions(), maxAge: EIGHT_HOURS_MS });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, baseCookieOptions());
}

// Lê o cookie direto do header bruto para não exigir o middleware cookie-parser.
export function readAuthCookie(req: { headers: { cookie?: string } }): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === AUTH_COOKIE_NAME) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}
