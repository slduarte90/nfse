import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  @Post('requests')
  createRequest(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() dto: any) {
    return this.accountingService.createRequest(user.id, user.accountRole, companyId, dto);
  }

  @Post('requests/:requestId/comments')
  commentRequest(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('requestId') requestId: string, @Body() dto: any) {
    return this.accountingService.commentRequest(user.id, user.accountRole, companyId, requestId, dto);
  }

  @Post('requests/:requestId/evaluation')
  evaluateRequest(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('requestId') requestId: string, @Body() dto: any) {
    return this.accountingService.evaluateRequest(user.id, user.accountRole, companyId, requestId, dto);
  }

  @Get('processes')
  listProcesses(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query() query: any) {
    return this.accountingService.listProcesses(user.id, user.accountRole, companyId, query);
  }

  @Get('departments')
  listDepartments(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string) {
    return this.accountingService.listDepartments(user.id, user.accountRole, companyId);
  }

  @Get('files/:fileId')
  downloadFile(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('fileId') fileId: string) {
    return this.accountingService.downloadFile(user.id, user.accountRole, companyId, fileId);
  }

  @Get('records/:area/:recordId')
  getRecordDetail(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Param('area') area: string, @Param('recordId') recordId: string) {
    return this.accountingService.getRecordDetail(user.id, user.accountRole, companyId, area, recordId);
  }
}
