import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
import { UsersService } from './users.service';

@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@GetCurrentUser() user: CurrentUser, @Query('search') search?: string, @Query('status') status?: string) {
    return this.usersService.findAll(user.accountRole, search, status);
  }

  @Patch(':id')
  updateUser(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: unknown) {
    return this.usersService.updateUser(user.accountRole, id, body);
  }

  @Patch(':id/block')
  blockUser(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.usersService.setUserActiveStatus(user.accountRole, id, false);
  }

  @Patch(':id/activate')
  activateUser(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.usersService.setUserActiveStatus(user.accountRole, id, true);
  }

  @Patch(':id/deactivate')
  deactivateUser(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.usersService.deactivateUser(user.accountRole, id);
  }

  @Post(':id/password-reset')
  sendPasswordReset(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.usersService.sendPasswordReset(user.accountRole, id);
  }
}
