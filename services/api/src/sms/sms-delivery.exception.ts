import { ServiceUnavailableException } from '@nestjs/common';

export class SmsDeliveryException extends ServiceUnavailableException {
  constructor() {
    super('SMS delivery is temporarily unavailable');
  }
}
