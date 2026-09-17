import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
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

  // Optional: the Stream app's Request Access form doesn't collect this at
  // all (subscriber orgs licensing the dataset don't self-scope by
  // country/dialect up front -- that's negotiated during admin follow-up).
  // The trainer site's /data-access page still collects and sends it.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DataAccessLeadInterestDto)
  interests?: DataAccessLeadInterestDto[];
}
