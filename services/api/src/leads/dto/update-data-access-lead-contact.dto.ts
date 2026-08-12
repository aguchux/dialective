import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDataAccessLeadContactDto {
  @IsBoolean()
  contacted!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
