import { ServiceUnavailableException } from '@nestjs/common';

export class WhatsappDeliveryException extends ServiceUnavailableException {
  constructor() {
    super('WhatsApp delivery is temporarily unavailable');
  }
}
