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

  @IsOptional()
  @IsString()
  @MaxLength(0)
  website?: string;
}
