import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

  @Get('lookup/cnpj')
  lookupCnpj(@GetCurrentUser() user: CurrentUser, @Query('cnpj') cnpj: string) {
    return this.companiesService.lookupCnpj(user.accountRole, cnpj);
  }

  @Post('invitations')
  inviteUser(@GetCurrentUser() user: CurrentUser, @Body() dto: InviteUserDto) {
    return this.companiesService.inviteUser(user.id, user.accountRole, dto);
  }

  @Get(':id/users')
  findCompanyUsers(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.companiesService.findCompanyUsers(user.accountRole, id);
  }

  @Patch(':id/users/:userId/block')
  blockCompanyUser(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.companiesService.updateCompanyUserStatus(user.accountRole, id, userId, 'BLOCKED');
  }

  @Patch(':id/users/:userId/disable')
  disableCompanyUser(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.companiesService.updateCompanyUserStatus(user.accountRole, id, userId, 'DISABLED');
  }

  @Patch(':id/users/:userId/activate')
  activateCompanyUser(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.companiesService.updateCompanyUserStatus(user.accountRole, id, userId, 'ACTIVE');
  }

  @Delete(':id/users/:userId')
  removeCompanyUser(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.companiesService.removeCompanyUser(user.accountRole, id, userId);
  }

  @Get(':id')
  findOne(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.companiesService.findOne(user.id, user.accountRole, id);
  }
}
