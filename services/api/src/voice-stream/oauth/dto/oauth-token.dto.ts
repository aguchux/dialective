import { IsIn, IsString } from 'class-validator';

export class OAuthTokenDto {
  @IsIn(['client_credentials'])
  grant_type!: 'client_credentials';

  @IsString()
  client_id!: string;

  @IsString()
  client_secret!: string;
}
