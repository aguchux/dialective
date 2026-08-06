import { IsUUID } from 'class-validator';

export class UpdateProfileDto {
  @IsUUID()
  countryId!: string;

  @IsUUID()
  dialectId!: string;
}
