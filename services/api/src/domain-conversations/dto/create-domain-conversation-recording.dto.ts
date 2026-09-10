import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateDomainConversationRecordingDto {
  @IsString()
  @IsNotEmpty()
  assignmentId!: string;

  @IsString()
  @IsNotEmpty()
  bucket!: string;

  @IsString()
  @IsNotEmpty()
  audioKey!: string;

  // Static upper bound only -- the real, admin-configurable ceiling is
  // domainConversationMaxDurationSeconds (see PlatformSettingsService),
  // enforced dynamically in DomainConversationsService.createRecording
  // since a class-validator decorator can't read DB-backed settings.
  @IsInt()
  @Min(1)
  @Max(1_900_000)
  durationMs!: number;

  @IsIn(['NOISY', 'FAIR', 'QUIET'])
  noiseRating!: 'NOISY' | 'FAIR' | 'QUIET';
}
