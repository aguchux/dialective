import { IsEmail, IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateDataAccessLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organization!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  @IsUrl({ require_tld: false }, { message: 'website must be a valid URL' })
  website!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  countriesInterested!: string;
}
