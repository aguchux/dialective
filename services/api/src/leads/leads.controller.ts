import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateDataAccessLeadDto } from './dto/create-data-access-lead.dto';

/**
 * Interest capture for the "Subscribe to voice data" landing-page CTA --
 * enterprises/researchers wanting to license the collected voice/dialect
 * dataset. No self-serve subscription or payment flow yet; this stores the
 * lead and notifies an admin address for manual follow-up. Public, no auth
 * -- submitted before any account exists.
 */
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Post('data-access')
  @HttpCode(HttpStatus.CREATED)
  async createDataAccessLead(@Body() dto: CreateDataAccessLeadDto) {
    const lead = await this.prisma.dataAccessLead.create({
      data: {
        name: dto.name,
        email: dto.email,
        organization: dto.organization,
        useCase: dto.useCase,
      },
    });

    await this.mail.sendDataAccessLeadNotification(lead);

    return { id: lead.id, status: 'received' };
  }
}
