import { ArrayMaxSize, ArrayMinSize, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const DOCUMENT_UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type DocumentUploadContentType = (typeof DOCUMENT_UPLOAD_CONTENT_TYPES)[number];

export class ResumeSelfHostedKycDto {
  @IsString()
  @MaxLength(4000)
  token!: string;
}

export class CreateKycEvidenceUploadUrlDto {
  @IsIn(DOCUMENT_UPLOAD_CONTENT_TYPES)
  contentType!: DocumentUploadContentType;
}

export class SubmitKycDocumentDto {
  @IsString()
  @MaxLength(100)
  documentType!: string;

  @IsString()
  @MaxLength(500)
  frontKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  backKey?: string;
}

export class SubmitKycSelfieDto {
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  frameKeys!: string[];

  @IsString()
  @MaxLength(200)
  challenge!: string;
}
