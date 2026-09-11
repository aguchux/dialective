import { IsBoolean, IsInt, IsOptional, IsUrl, Matches, Max, MaxLength, Min } from 'class-validator';

// Adsterra/Monetag serve each ad unit's script from a per-account/per-unit
// subdomain that varies (and can rotate) -- there's no fixed hostname to
// pin an allowlist to. Require https + a .js path instead, which is the
// actual shape of every <script src> both networks hand out. The write
// path is admin-only (JwtAuthGuard + Roles(ADMIN) on the controller), so
// this is a sanity check against pasting the wrong thing, not a security
// boundary against untrusted input.
const AD_SCRIPT_URL_OPTIONS = { require_protocol: true, protocols: ['https'] };
const AD_SCRIPT_URL_MESSAGE = 'must be an https:// URL ending in .js';

export class UpdateCommunitySettingsDto {
  @IsOptional()
  @IsBoolean()
  postingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  repliesEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  attachmentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  reactionsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080) // 1 week
  newMemberPostingDelayMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requireApprovalForNewMembers?: boolean;

  @IsOptional()
  @IsBoolean()
  adsterraEnabled?: boolean;

  @IsOptional()
  @IsUrl(AD_SCRIPT_URL_OPTIONS, { message: `adsterraScriptUrl ${AD_SCRIPT_URL_MESSAGE}` })
  @Matches(/\.js(\?.*)?$/i, { message: `adsterraScriptUrl ${AD_SCRIPT_URL_MESSAGE}` })
  @MaxLength(500)
  adsterraScriptUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  monetagEnabled?: boolean;

  @IsOptional()
  @IsUrl(AD_SCRIPT_URL_OPTIONS, { message: `monetagScriptUrl ${AD_SCRIPT_URL_MESSAGE}` })
  @Matches(/\.js(\?.*)?$/i, { message: `monetagScriptUrl ${AD_SCRIPT_URL_MESSAGE}` })
  @MaxLength(500)
  monetagScriptUrl?: string | null;
}
