import { IsIn, IsString } from 'class-validator';

export class DecideConnectSpeakerDto {
  @IsString()
  @IsIn(['APPROVE', 'DECLINE'])
  decision!: 'APPROVE' | 'DECLINE';
}
