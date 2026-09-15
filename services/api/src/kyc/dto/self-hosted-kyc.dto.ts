import { ArrayMaxSize, ArrayMinSize, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const KYC_EVIDENCE_CONTENT_TYPE = 'image/jpeg' as const;
export type KycEvidenceContentType = typeof KYC_EVIDENCE_CONTENT_TYPE;

export class ResumeSelfHostedKycDto {
  @IsString()
  @MaxLength(4000)
  token!: string;
}

export class CreateKycEvidenceUploadUrlDto extends ResumeSelfHostedKycDto {
  @IsIn([KYC_EVIDENCE_CONTENT_TYPE])
  contentType!: KycEvidenceContentType;
}

export class SubmitKycDocumentDto extends ResumeSelfHostedKycDto {
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

export class SubmitKycSelfieDto extends ResumeSelfHostedKycDto {
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  frameKeys!: string[];

  @IsString()
  @MaxLength(200)
  challenge!: string;
}
