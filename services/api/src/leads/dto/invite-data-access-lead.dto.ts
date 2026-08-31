import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class InviteDataAccessLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organizationName!: string;

  @IsString()
  @IsNotEmpty()
  planId!: string;
}
