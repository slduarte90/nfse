import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InvitationsService } from './invitations.service';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get(':token')
  findByToken(@Param('token') token: string) {
    return this.invitationsService.findByToken(token);
  }

  @Post(':token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    return this.invitationsService.accept(token, dto);
  }
}
