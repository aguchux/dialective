import { IsEmail, MaxLength } from 'class-validator';

export class LookupConnectMemberDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
