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
  @IsNotEmpty()
  taxRegime!: string;

  @IsString()
  @IsOptional()
  serviceCodeDefault?: string;
}
