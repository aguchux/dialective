import { IsString, MaxLength } from 'class-validator';

export class CreateConnectPhotoUploadDto {
  @IsString()
  @MaxLength(100)
  contentType!: string;
}

export class CompleteConnectPhotoUploadDto {
  /**
   * The key the presigned PUT was issued for. The controller re-checks it
   * is under this speaker's own prefix, so a token cannot be used to claim
   * an object uploaded for someone else.
   */
  @IsString()
  @MaxLength(500)
  key!: string;
}
