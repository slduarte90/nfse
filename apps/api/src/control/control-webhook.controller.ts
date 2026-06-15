import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ControlService } from './control.service';

// Receptor público do callback assíncrono do e-Kontroll (entrega via "URL de resposta").
// Não usa AuthGuard: a chamada vem servidor-a-servidor. A autorização é feita por um token
// no path (EKONTROLL_WEBHOOK_TOKEN) + verificação do api_key no corpo dentro do service.
@Controller('webhooks/control/ekontroll')
export class ControlWebhookController {
  constructor(private readonly controlService: ControlService) {}

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post(':token')
  receive(@Param('token') token: string, @Body() body: unknown) {
    return this.controlService.recordWebhook(token, body);
  }
}
