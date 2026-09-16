import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export const ALLOWED_P2P_CHAT_ATTACHMENT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type AllowedP2PChatAttachmentContentType =
  (typeof ALLOWED_P2P_CHAT_ATTACHMENT_CONTENT_TYPES)[number];

export class CreateP2PChatUploadUrlDto {
  @IsIn(ALLOWED_P2P_CHAT_ATTACHMENT_CONTENT_TYPES)
  contentType!: AllowedP2PChatAttachmentContentType;
}

export class SendP2PTradeMessageDto {
  // Either body or an attachment (or both) is required -- enforced in the
  // service, not here, since class-validator can't easily express "at
  // least one of these two fields" across both optional fields at once.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsString()
  attachmentKey?: string;

  @ValidateIf((dto: SendP2PTradeMessageDto) => !!dto.attachmentKey)
  @IsIn(ALLOWED_P2P_CHAT_ATTACHMENT_CONTENT_TYPES)
  attachmentContentType?: AllowedP2PChatAttachmentContentType;
}
