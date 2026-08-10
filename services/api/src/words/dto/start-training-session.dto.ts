import { Equals } from 'class-validator';

export class StartTrainingSessionDto {
  @Equals(true, { message: 'You must accept the voice training terms to continue' })
  acceptedVoiceTerms!: true;
}
