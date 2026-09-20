import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SubscriberAuthService } from '../voice-stream/subscriber-auth/subscriber-auth.service';
import { MailService } from '../mail/mail.service';
import { CreateDataAccessLeadDto } from './dto/create-data-access-lead.dto';
import { UpdateDataAccessLeadContactDto } from './dto/update-data-access-lead-contact.dto';
import { InviteDataAccessLeadDto } from './dto/invite-data-access-lead.dto';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { CreateConnectRegistrationDto } from './dto/create-connect-registration.dto';
import { LookupConnectMemberDto } from './dto/lookup-connect-member.dto';
import { UpdateSupportRequestResolutionDto } from './dto/update-support-request-resolution.dto';

/**
 * "Adaeze" -> "A•••". Enough for the owner to recognise, not enough for a
 * stranger probing an address to learn who holds it.
 */
function maskName(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return `${trimmed[0].toUpperCase()}${'•'.repeat(Math.min(Math.max(trimmed.length - 1, 1), 6))}`;
}

/**
 * "adaeze.okafor@gmail.com" -> "a•••••••@gmail.com". The domain stays
 * readable because the caller already typed the whole address -- they
 * learn nothing new from it -- while the local part does not confirm the
 * spelling of an address someone is guessing at.
 */
function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  if (!domain) return '•••';
  const head = local[0] ?? '•';
  return `${head}${'•'.repeat(Math.min(Math.max(local.length - 1, 1), 8))}@${domain}`;
}

/**
 * Interest capture for the "Subscribe to voice data" landing-page CTA --
 * enterprises/researchers wanting to license the collected voice/dialect
 * dataset. No self-serve subscription or payment flow yet; this stores the
 * lead in Postgres for manual follow-up from the admin dashboard. Public, no auth
 * -- submitted before any account exists.
 */
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriberAuth: SubscriberAuthService,
    private readonly mail: MailService,
  ) {}

  @Get('connect-2026/stats')
  async getConnectStats() {
    const eventKey = 'connect-2026';
    const [interested, speakerApplicants, countryGroups] = await Promise.all([
      this.prisma.connectRegistration.count({ where: { eventKey } }),
      this.prisma.connectRegistration.count({ where: { eventKey, speaking: true } }),
      this.prisma.connectRegistration.groupBy({
        by: ['countryCode'],
        where: { eventKey },
      }),
    ]);
    return { interested, speakerApplicants, countries: countryGroups.length };
  }

  /**
   * "Are you already a Dialect Library member?" for the Connect signup
   * form, so a member can confirm their own account and have event
   * reminders reach the email/phone they already verified with us.
   *
   * Deliberately masked. Everywhere else in this codebase an unauthenticated
   * caller cannot learn whether an email has an account -- see
   * AuthService.requestPasswordReset's "Don't reveal whether the email
   * exists". This route has to reveal existence for the feature to work at
   * all, so it gives up the minimum that still lets the real owner
   * recognise themselves: first initials and a masked address, never the
   * full name, never the phone number. Someone probing an address they do
   * not own learns that it is registered and nothing they could use.
   *
   * Rate-limited well below the global 60/min for the same reason -- the
   * masking limits what one lookup yields, the throttle limits how many a
   * scraper can make.
   */
  @Post('connect-2026/lookup')
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  async lookupConnectMember(@Body() dto: LookupConnectMemberDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        country: { select: { name: true } },
        dialect: { select: { name: true } },
      },
    });

    // A deactivated account should not be offered as "your record" -- the
    // person may have left deliberately.
    if (!user || user.status !== 'ACTIVE') return { found: false as const };

    return {
      found: true as const,
      firstName: maskName(user.firstName),
      lastName: maskName(user.lastName),
      email: maskEmail(user.email),
      country: user.country?.name ?? null,
      dialect: user.dialect?.name ?? null,
    };
  }

  @Post('connect-2026')
  @HttpCode(HttpStatus.CREATED)
  async registerForConnect(@Body() dto: CreateConnectRegistrationDto) {
    if (!dto.consent) throw new BadRequestException('Consent is required');
    if (dto.website) return { status: 'received' };

    const eventKey = 'connect-2026';
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const countryCode = dto.countryCode.trim().toUpperCase();
    if (!name || !/^[A-Z]{2}$/.test(countryCode)) {
      throw new BadRequestException('Enter a name and a valid country');
    }
    const country = await this.prisma.country.findUnique({
      where: { code: countryCode },
      select: { id: true },
    });
    if (!country) throw new BadRequestException('Select a supported country');

    // Link to the member's account only when they actively confirmed the
    // match ("yes, that's me"). Matching on the email alone would attach
    // an account to whoever typed that address, and answering "not me"
    // has to mean the registration stays anonymous -- that is the whole
    // point of asking.
    const member = dto.confirmedMember
      ? await this.prisma.user.findUnique({
          where: { email },
          select: { id: true, status: true },
        })
      : null;
    const userId = member && member.status === 'ACTIVE' ? member.id : null;
    const linkedAt = userId ? new Date() : null;

    const speaking = dto.interest === 'speak';
    await this.prisma.connectRegistration.upsert({
      where: { eventKey_email: { eventKey, email } },
      create: {
        eventKey,
        name,
        email,
        countryCode,
        speaking,
        speakerTopic: speaking ? dto.speakerTopic?.trim() : null,
        speakerSummary: speaking ? dto.speakerSummary?.trim() : null,
        consentedAt: new Date(),
        userId,
        linkedAt,
      },
      update: {
        name,
        countryCode,
        attending: true,
        ...(speaking
          ? {
              speaking: true,
              speakerTopic: dto.speakerTopic?.trim(),
              speakerSummary: dto.speakerSummary?.trim(),
            }
          : {}),
        // Only ever sets a link, never clears one. Re-registering without
        // confirming (or from the dialog, where the prompt may not have
        // been shown) should not silently unlink an account the person
        // already claimed.
        ...(userId ? { userId, linkedAt } : {}),
        consentedAt: new Date(),
      },
    });
    return { status: 'received' };
  }

  @Post('data-access')
  @HttpCode(HttpStatus.CREATED)
  async createDataAccessLead(@Body() dto: CreateDataAccessLeadDto) {
    const lead = await this.prisma.dataAccessLead.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        name: `${dto.firstName} ${dto.lastName}`,
        email: dto.email,
        organization: dto.organization,
        website: dto.website,
        ...(dto.interests && dto.interests.length > 0
          ? {
              interests: {
                create: dto.interests.map((interest) => ({
                  countryId: interest.countryId,
                  dialectTags: interest.dialectTags,
                  subdialectTags: interest.subdialectTags,
                })),
              },
            }
          : {}),
      },
    });

    return { id: lead.id, status: 'received' };
  }

  @Get('admin/data-access')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listDataAccessLeads(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
  ) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.dataAccessLead.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
        include: {
          contactedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          interests: {
            include: { country: { select: { id: true, code: true, name: true } } },
          },
          invitedOrganization: { select: { id: true, name: true } },
        },
      }),
      this.prisma.dataAccessLead.count(),
    ]);

    return {
      items,
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };
  }

  @Patch('admin/data-access/:id/contact')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateDataAccessLeadContact(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDataAccessLeadContactDto,
  ) {
    const lead = await this.prisma.dataAccessLead.update({
      where: { id },
      data: {
        contactedAt: dto.contacted ? new Date() : null,
        contactNote: dto.note?.trim() || null,
        contactedByUserId: dto.contacted ? req.user.sub : null,
      },
      include: {
        contactedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return lead;
  }

  /**
   * Approves a lead: provisions a brand-new SubscriberOrganization +
   * Subscription (on the chosen plan) and emails the lead an owner-role
   * invite (SubscriberAuthService.provisionOrganizationFromLead) -- same
   * "click link, choose password, redirected to dashboard" acceptance flow
   * already used for ordinary member invites.
   */
  @Post('admin/data-access/:id/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async inviteDataAccessLead(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: InviteDataAccessLeadDto,
  ) {
    const lead = await this.prisma.dataAccessLead.findUniqueOrThrow({ where: { id } });

    const { organizationId } = await this.subscriberAuth.provisionOrganizationFromLead({
      organizationName: dto.organizationName,
      planId: dto.planId,
      inviteeEmail: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      invitedByUserId: req.user.sub,
    });

    await this.prisma.dataAccessLead.update({
      where: { id },
      data: { invitedOrganizationId: organizationId },
    });

    return { organizationId };
  }

  /**
   * Resends this lead's pending Voice Stream invite -- for when the original
   * invite email never arrived or was missed. Looks up the most recent
   * unaccepted SubscriberInvite for the org this lead was already invited
   * into (provisionOrganizationFromLead above) and rotates/re-sends it via
   * SubscriberAuthService.resendInvite; 404s if the lead was never invited,
   * or if every invite on that org has already been accepted.
   */
  @Post('admin/data-access/:id/resend-invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resendDataAccessLeadInvite(@Param('id') id: string): Promise<void> {
    const lead = await this.prisma.dataAccessLead.findUnique({
      where: { id },
      select: { invitedOrganizationId: true },
    });
    if (!lead || !lead.invitedOrganizationId) {
      throw new NotFoundException('This request has not been invited yet');
    }

    const invite = await this.prisma.subscriberInvite.findFirst({
      where: { organizationId: lead.invitedOrganizationId, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!invite) {
      throw new NotFoundException('No pending invite found for this request');
    }

    await this.subscriberAuth.resendInvite(invite.id);
  }

  /**
   * Deletes a data-access request. Refuses once the lead has an
   * invitedOrganizationId (an admin already provisioned an org/invite from
   * it) -- deleting the request there would orphan the relationship without
   * touching the organization itself, and there's no undo for a lead that
   * actually led to a real account. Interests cascade automatically
   * (DataAccessLeadInterest.onDelete: Cascade).
   */
  @Delete('admin/data-access/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteDataAccessLead(@Param('id') id: string) {
    const lead = await this.prisma.dataAccessLead.findUnique({
      where: { id },
      select: { id: true, invitedOrganizationId: true },
    });
    if (!lead) throw new NotFoundException('Data-access request not found');
    if (lead.invitedOrganizationId) {
      throw new ConflictException(
        'This request already has an organization account and cannot be deleted',
      );
    }
    await this.prisma.dataAccessLead.delete({ where: { id } });
    return { id, status: 'deleted' };
  }

  /**
   * General Contact Us submission (/contact-us) -- public, no auth. Distinct
   * from data-access leads: no interest capture, just a name/email/subject/
   * message support ticket. Unlike DataAccessLead's notification (defined
   * but never called), this one actually emails the leads-notification
   * address so support requests get timely attention.
   */
  @Post('support')
  @HttpCode(HttpStatus.CREATED)
  async createSupportRequest(@Body() dto: CreateSupportRequestDto) {
    const request = await this.prisma.supportRequest.create({
      data: {
        name: dto.name,
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
      },
    });

    await this.mail
      .sendSupportRequestNotification({
        id: request.id,
        name: request.name,
        email: request.email,
        subject: request.subject,
        message: request.message,
      })
      .catch(() => undefined);

    return { id: request.id, status: 'received' };
  }

  @Get('admin/support')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listSupportRequests(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
  ) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.supportRequest.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
        include: {
          resolvedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.supportRequest.count(),
    ]);

    return {
      items,
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };
  }

  @Patch('admin/support/:id/resolution')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateSupportRequestResolution(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSupportRequestResolutionDto,
  ) {
    const request = await this.prisma.supportRequest.update({
      where: { id },
      data: {
        resolvedAt: dto.resolved ? new Date() : null,
        resolutionNote: dto.note?.trim() || null,
        resolvedByUserId: dto.resolved ? req.user.sub : null,
      },
      include: {
        resolvedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    return request;
  }
}
