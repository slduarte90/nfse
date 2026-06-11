import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
import { ControlService } from './control.service';

@UseGuards(AuthGuard)
@Controller('companies/:companyId/control')
export class ControlController {
  constructor(private readonly controlService: ControlService) {}

  @Get('overview')
  getOverview(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string) {
    return this.controlService.getOverview(user.id, user.accountRole, companyId);
  }

  @Get('settings')
  getSettings(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string) {
    return this.controlService.getSettings(user.id, user.accountRole, companyId);
  }

  @Patch('settings')
  updateSettings(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.controlService.updateSettings(user.id, user.accountRole, companyId, body);
  }

  @Get('indicators')
  getDepartment(@GetCurrentUser() user: CurrentUser, @Param('companyId') companyId: string, @Query('department') department = 'accounting') {
    return this.controlService.getDepartment(user.id, user.accountRole, companyId, department);
  }
}
