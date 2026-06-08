import { Module } from '@nestjs/common';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';
import { EKontrollApiService } from './ekontroll-api.service';

@Module({
  controllers: [ControlController],
  providers: [ControlService, EKontrollApiService],
})
export class ControlModule {}
