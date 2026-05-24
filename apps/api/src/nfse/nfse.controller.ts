import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { StorageKind } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
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

  @Get('settings/homologation-checklist')
  getHomologationChecklist(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string) {
    return this.nfseService.getHomologationChecklist(user.id, user.accountRole, companyId);
  }

  @Get('services')
  listServices(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query('status') status?: string) {
    return this.nfseService.listServices(user.id, user.accountRole, companyId, status);
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

  @Delete('services/:serviceId/permanent')
  removeService(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('serviceId') serviceId: string) {
    return this.nfseService.removeService(user.id, user.accountRole, companyId, serviceId);
  }

  @Get('customers')
  listCustomers(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query('search') search?: string) {
    return this.nfseService.listCustomers(user.id, user.accountRole, companyId, search);
  }

  @Get('customers/lookup/cnpj')
  lookupCustomerCnpj(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query('cnpj') cnpj: string) {
    return this.nfseService.lookupCustomerCnpj(user.id, user.accountRole, companyId, cnpj);
  }

  @Post('customers')
  createCustomer(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() dto: any) {
    return this.nfseService.createCustomer(user.id, user.accountRole, companyId, dto);
  }

  @Patch('customers/:customerId')
  updateCustomer(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('customerId') customerId: string, @Body() dto: any) {
    return this.nfseService.updateCustomer(user.id, user.accountRole, companyId, customerId, dto);
  }

  @Delete('customers/:customerId')
  deleteCustomer(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('customerId') customerId: string) {
    return this.nfseService.removeCustomer(user.id, user.accountRole, companyId, customerId);
  }

  @Get('invoices')
  listInvoices(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query() query: any) {
    return this.nfseService.listInvoices(user.id, user.accountRole, companyId, query);
  }

  @Post('invoices')
  createInvoice(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() dto: any) {
    return this.nfseService.createInvoice(user.id, user.accountRole, companyId, dto);
  }

  @Post('invoices/:invoiceId/transmit')
  transmitInvoice(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('invoiceId') invoiceId: string) {
    return this.nfseService.transmitInvoice(user.id, user.accountRole, companyId, invoiceId);
  }

  @Delete('invoices/:invoiceId')
  deleteInvoice(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('invoiceId') invoiceId: string) {
    return this.nfseService.deleteInvoice(user.id, user.accountRole, companyId, invoiceId);
  }

  @Get('invoices/:invoiceId/sync')
  syncInvoice(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('invoiceId') invoiceId: string) {
    return this.nfseService.syncInvoice(user.id, user.accountRole, companyId, invoiceId);
  }

  @Get('invoices/:invoiceId/xml')
  getInvoiceXml(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('invoiceId') invoiceId: string) {
    return this.nfseService.downloadInvoiceFile(user.id, user.accountRole, companyId, invoiceId, StorageKind.XML);
  }

  @Get('invoices/:invoiceId/pdf')
  getInvoicePdf(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('invoiceId') invoiceId: string) {
    return this.nfseService.downloadInvoiceFile(user.id, user.accountRole, companyId, invoiceId, StorageKind.PDF);
  }
}
