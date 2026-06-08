import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
})
export class AppModule {}
