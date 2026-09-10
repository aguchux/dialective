import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateDomainPromptAdminDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  domain?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  text?: string;
}
