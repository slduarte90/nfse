import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class InviteUserDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  email!: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
