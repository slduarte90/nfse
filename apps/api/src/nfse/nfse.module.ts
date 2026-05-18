import { Module } from '@nestjs/common';
import { NfseController } from './nfse.controller';
import { NfseNationalApiService } from './nfse-national-api.service';
import { NfseService } from './nfse.service';

@Module({
  controllers: [NfseController],
  providers: [NfseService, NfseNationalApiService],
})
export class NfseModule {}
