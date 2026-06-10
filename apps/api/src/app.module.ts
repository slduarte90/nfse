import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { InvitationsModule } from './invitations/invitations.module';
import { UsersModule } from './users/users.module';
import { NfseModule } from './nfse/nfse.module';
import { AccountingModule } from './accounting/accounting.module';
import { ControlModule } from './control/control.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Baseline de proteção contra abuso/força bruta (limite por IP).
    // Endpoints sensíveis (login, recuperação de senha) têm limites menores via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    DatabaseModule,
    AuthModule,
    CompaniesModule,
    InvitationsModule,
    UsersModule,
    NfseModule,
    AccountingModule,
    ControlModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
