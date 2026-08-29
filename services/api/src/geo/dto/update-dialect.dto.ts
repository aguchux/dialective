import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateDialectDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsBoolean()
  llmGenerationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  keyboardLayout?: string;
}
