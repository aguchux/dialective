import { ArrayNotEmpty, IsArray, IsEmail, IsNotEmpty, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DataAccessLeadInterestDto {
  @IsString()
  @IsNotEmpty()
  countryId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  dialectTags!: string[];

  @IsArray()
  @IsString({ each: true })
  subdialectTags!: string[];
}

export class CreateDataAccessLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

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

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DataAccessLeadInterestDto)
  interests!: DataAccessLeadInterestDto[];
}
