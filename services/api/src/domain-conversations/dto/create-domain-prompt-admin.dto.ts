import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Admin-authored scenario -- creates all three gender variants (NEUTRAL/
 * MALE/FEMALE) at once, sharing a single scenarioKey, mirroring how
 * domain-conversation-prompt-job inserts a scenario's variants together.
 * source is stamped 'manual' for every row this creates.
 */
export class CreateDomainPromptAdminDto {
  @IsString()
  @IsNotEmpty()
  domain!: string;

  @IsString()
  @IsNotEmpty()
  scenarioKey!: string;

  @IsString()
  @IsNotEmpty()
  neutralText!: string;

  @IsString()
  @IsNotEmpty()
  maleText!: string;

  @IsString()
  @IsNotEmpty()
  femaleText!: string;
}
