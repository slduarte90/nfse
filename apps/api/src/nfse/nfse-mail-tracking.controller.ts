import { Controller, Get, Headers, Ip, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { NfseService } from './nfse.service';

const transparentGif = Buffer.from('R0lGODlhAQABAIABAP///wAAACH5BAEAAAEALAAAAAABAAEAAAICRAEAOw==', 'base64');

@Controller('nfse/mail')
export class NfseMailTrackingController {
  constructor(private readonly nfseService: NfseService) {}

  @Get(':mailLogId/open.gif')
  async open(
    @Param('mailLogId') mailLogId: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Ip() ip: string | undefined,
    @Res() response: Response,
  ) {
    await this.nfseService.recordMailView(mailLogId, {
      ipAddress: forwardedFor?.split(',')[0]?.trim() || ip,
      userAgent,
    });
    response.setHeader('Content-Type', 'image/gif');
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.end(transparentGif);
  }
}
