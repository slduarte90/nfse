import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  legalName!: string;

  @IsString()
  @IsOptional()
  tradeName?: string;

  @IsString()
  @Length(14, 14, { message: 'CNPJ deve conter 14 digitos.' })
  cnpj!: string;

  @IsString()
  @IsOptional()
  municipalRegistration?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @Length(2, 2, { message: 'UF deve conter 2 caracteres.' })
  state!: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  number?: string;

  @IsString()
  @IsOptional()
  complement?: string;

  @IsString()
  @IsOptional()
  neighborhood?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  registrationStatus?: string;

  @IsString()
  @IsOptional()
  mainActivity?: string;

  @IsString()
  @IsOptional()
  legalNature?: string;

  @IsString()
  @IsOptional()
  taxRegime?: string;

  @IsString()
  @IsOptional()
  serviceCodeDefault?: string;
}
