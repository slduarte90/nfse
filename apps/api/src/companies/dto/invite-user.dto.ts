import { UserRole } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class InviteUserDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos uma empresa.' })
  @IsUUID('4', { each: true })
  companyIds!: string[];

  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  email!: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
