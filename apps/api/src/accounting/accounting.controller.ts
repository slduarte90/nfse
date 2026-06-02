import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
import { AccountingService } from './accounting.service';

@UseGuards(AuthGuard)
@Controller('companies/:companyId/accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('documents')
  listDocuments(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query() query: any) {
    return this.accountingService.listDocuments(user.id, user.accountRole, companyId, query);
  }

  @Get('taxes')
  listTaxes(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query() query: any) {
    return this.accountingService.listTaxes(user.id, user.accountRole, companyId, query);
  }

  @Get('requests')
  listRequests(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query() query: any) {
    return this.accountingService.listRequests(user.id, user.accountRole, companyId, query);
  }

  @Get('processes')
  listProcesses(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query() query: any) {
    return this.accountingService.listProcesses(user.id, user.accountRole, companyId, query);
  }
}
