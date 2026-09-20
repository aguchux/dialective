import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateConnectRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsIn(['attend', 'speak'])
  interest!: 'attend' | 'speak';

  @IsString()
  @IsNotEmpty()
  @MaxLength(2)
  countryCode!: string;

  @ValidateIf((dto: CreateConnectRegistrationDto) => dto.interest === 'speak')
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  speakerTopic?: string;

  @ValidateIf((dto: CreateConnectRegistrationDto) => dto.interest === 'speak')
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  speakerSummary?: string;

  @IsBoolean()
  consent!: boolean;

  /**
   * True only when the registrant was shown the matched account and
   * answered "yes, that's me". The server still re-checks the email
   * against an active account before linking -- this flag grants
   * permission, it never asserts the match.
   */
  @IsOptional()
  @IsBoolean()
  confirmedMember?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(0)
  website?: string;
}
