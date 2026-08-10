import { IsOptional, IsUUID, Length } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsUUID()
  dialectId?: string;

  @IsOptional()
  @Length(1, 80)
  firstName?: string;

  @IsOptional()
  @Length(1, 80)
  lastName?: string;
}
