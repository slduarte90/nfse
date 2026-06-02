import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AcessoriasApiService } from './acessorias-api.service';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, AcessoriasApiService],
})
export class AccountingModule {}
