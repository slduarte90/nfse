import { AccountRole } from '@prisma/client';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  accountRole: AccountRole;
}
