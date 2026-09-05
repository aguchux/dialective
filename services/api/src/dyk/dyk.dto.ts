import { ArrayMinSize, ArrayUnique, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export const DYK_CONDITIONS = ['CLICKED', 'VISITED', 'PHONE', 'KYC', 'PWA', 'REFERRAL_SHARE', 'TRAINING', 'COURSE', 'TESTIMONY', 'QRAC'] as const;

export class DykSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(1) @Max(43200) intervalMinutes!: number;
  @IsInt() @Min(1) @Max(100) maxDisplays!: number;
}

export class DykNoticeDto {
  @IsString() @MinLength(1) @MaxLength(220) content!: string;
  @IsString() @Matches(/^dyk\/[0-9a-f-]+\.(jpg|png|webp)$/) imageKey!: string;
  @IsString() @MaxLength(100) imageBucket!: string;
  @IsString() @MinLength(1) @MaxLength(500) href!: string;
  // OR logic -- the notice stops for a trainer once any one of these is met.
  @ArrayMinSize(1) @ArrayUnique() @IsIn(DYK_CONDITIONS, { each: true }) stopConditions!: string[];
  @IsOptional() @IsString() @MaxLength(100) targetId?: string;
  @IsBoolean() active!: boolean;
  @IsInt() @Min(0) @Max(10000) sortOrder!: number;
}

export class DykUploadDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp']) contentType!: string;
}

export class DykImpressionDto {
  @IsOptional() @IsBoolean() navigation?: boolean;
}

/** Confirms arrival at an internal-route notice's own destination -- href must match the notice's own href exactly, checked server-side, so a trainer can't mark an unrelated notice "visited" by guessing its id. */
export class DykVisitDto {
  @IsString() @MinLength(1) @MaxLength(500) href!: string;
}
