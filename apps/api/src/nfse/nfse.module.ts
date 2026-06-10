import { Module } from '@nestjs/common';
import { NfseCertificatesController } from './nfse-certificates.controller';
import { NfseMailTrackingController } from './nfse-mail-tracking.controller';
import { NfseController } from './nfse.controller';
import { NfseNationalApiService } from './nfse-national-api.service';
import { NfseService } from './nfse.service';
import { MailerService } from '../mail/mailer.service';

@Module({
  controllers: [NfseController, NfseCertificatesController, NfseMailTrackingController],
  providers: [NfseService, NfseNationalApiService, MailerService],
})
export class NfseModule {}
