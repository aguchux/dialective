import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePromptAdminDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
