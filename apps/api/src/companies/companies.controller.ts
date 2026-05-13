import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';

@UseGuards(AuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(@GetCurrentUser() user: CurrentUser, @Body() dto: CreateCompanyDto) {
    return this.companiesService.create(user.id, dto);
  }

  @Get()
  findAll(@GetCurrentUser() user: CurrentUser) {
    return this.companiesService.findAll(user.id);
  }

  @Get(':id')
  findOne(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.companiesService.findOne(user.id, id);
  }
}
