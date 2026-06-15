import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { CurrentUser } from './current-user';
import { getJwtSecret } from './jwt-secret';
import { readAuthCookie } from './auth-cookie';

type RequestWithUser = Request & { user?: CurrentUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token de autenticacao nao informado.');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(),
      });

      request.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        accountRole: payload.accountRole,
      };
    } catch {
      throw new UnauthorizedException('Token de autenticacao invalido ou expirado.');
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    // Prioriza o cookie httpOnly (navegador); cai no header Authorization para
    // clientes de API (scripts, integrações) que não usam cookie.
    const cookieToken = readAuthCookie(request);
    if (cookieToken) return cookieToken;
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
