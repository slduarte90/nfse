import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { GetCurrentUser } from '../auth/get-current-user.decorator';
import { UsersService } from './users.service';

@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@GetCurrentUser() user: CurrentUser, @Query('search') search?: string) {
    return this.usersService.findAll(user.accountRole, search);
  }
}
