import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
import { CurrentUser } from '../auth/current-user';
import { NfseService } from './nfse.service';

@UseGuards(AuthGuard)
@Controller('companies/:companyId/nfse')
export class NfseController {
  constructor(private readonly nfseService: NfseService) {}

  @Get('settings')
  getSettings(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string) {
    return this.nfseService.getSettings(user.id, user.accountRole, companyId);
  }

  @Patch('settings')
  updateSettings(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() dto: any) {
    return this.nfseService.updateSettings(user.id, user.accountRole, companyId, dto);
  }

  @Get('services')
  listServices(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string) {
    return this.nfseService.listServices(user.id, user.accountRole, companyId);
  }

  @Post('services')
  createService(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() dto: any) {
    return this.nfseService.createService(user.id, user.accountRole, companyId, dto);
  }

  @Patch('services/:serviceId')
  updateService(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('serviceId') serviceId: string, @Body() dto: any) {
    return this.nfseService.updateService(user.id, user.accountRole, companyId, serviceId, dto);
  }

  @Delete('services/:serviceId')
  deleteService(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('serviceId') serviceId: string) {
    return this.nfseService.deleteService(user.id, user.accountRole, companyId, serviceId);
  }

  @Get('customers')
  listCustomers(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query('search') search?: string) {
    return this.nfseService.listCustomers(user.id, user.accountRole, companyId, search);
  }

  @Post('customers')
  createCustomer(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() dto: any) {
    return this.nfseService.createCustomer(user.id, user.accountRole, companyId, dto);
  }

  @Patch('customers/:customerId')
  updateCustomer(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('customerId') customerId: string, @Body() dto: any) {
    return this.nfseService.updateCustomer(user.id, user.accountRole, companyId, customerId, dto);
  }

  @Get('invoices')
  listInvoices(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query() query: any) {
    return this.nfseService.listInvoices(user.id, user.accountRole, companyId, query);
  }

  @Post('invoices')
  createInvoice(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() dto: any) {
    return this.nfseService.createInvoice(user.id, user.accountRole, companyId, dto);
  }
}
