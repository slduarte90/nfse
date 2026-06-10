import { Module } from '@nestjs/common';
import { MailerService } from '../mail/mailer.service';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, MailerService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
