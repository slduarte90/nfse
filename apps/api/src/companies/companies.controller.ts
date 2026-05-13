import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InviteUserDto } from './dto/invite-user.dto';

@UseGuards(AuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(@GetCurrentUser() user: CurrentUser, @Body() dto: CreateCompanyDto) {
    return this.companiesService.create(user.id, user.accountRole, dto);
  }

  @Get()
  findAll(@GetCurrentUser() user: CurrentUser, @Query('search') search?: string) {
    return this.companiesService.findAll(user.id, user.accountRole, search);
  }

  @Post('invitations')
  inviteUser(@GetCurrentUser() user: CurrentUser, @Body() dto: InviteUserDto) {
    return this.companiesService.inviteUser(user.id, user.accountRole, dto);
  }

  @Get(':id')
  findOne(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.companiesService.findOne(user.id, user.accountRole, id);
  }
}
