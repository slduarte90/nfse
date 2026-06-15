import { Module } from '@nestjs/common';
import { ControlController } from './control.controller';
import { ControlWebhookController } from './control-webhook.controller';
import { ControlService } from './control.service';
import { EKontrollApiService } from './ekontroll-api.service';
import { CryptoService } from '../common/crypto.service';

@Module({
  controllers: [ControlController, ControlWebhookController],
  providers: [ControlService, EKontrollApiService, CryptoService],
})
export class ControlModule {}
