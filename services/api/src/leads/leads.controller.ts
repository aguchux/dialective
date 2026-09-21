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
import { randomUUID } from 'crypto';
import { Role } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { generateOpaqueToken, hashToken } from '../auth/token.util';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SubscriberAuthService } from '../voice-stream/subscriber-auth/subscriber-auth.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { CreateDataAccessLeadDto } from './dto/create-data-access-lead.dto';
import { UpdateDataAccessLeadContactDto } from './dto/update-data-access-lead-contact.dto';
import { InviteDataAccessLeadDto } from './dto/invite-data-access-lead.dto';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { CreateConnectRegistrationDto } from './dto/create-connect-registration.dto';
import { LookupConnectMemberDto } from './dto/lookup-connect-member.dto';
import { DecideConnectSpeakerDto } from './dto/decide-connect-speaker.dto';
import { SendConnectRemindersDto } from './dto/send-connect-reminders.dto';
import {
  CompleteConnectPhotoUploadDto,
  CreateConnectPhotoUploadDto,
} from './dto/connect-photo-upload.dto';
import { UpdateSupportRequestResolutionDto } from './dto/update-support-request-resolution.dto';

/** 48 hours, as promised in the approval email. */
const CONNECT_PHOTO_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

/** Content types a speaker headshot may be, mapped to their extension. */
const CONNECT_PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Speaker photos live in the marketing bucket -- they are public event
 * assets, shown on the Connect page, not private user data.
 */
function connectPhotoBucket(): string {
  return process.env.SPACES_MARKETING_BUCKET ?? 'dialectiva-marketing';
}

/**
 * Where the 48-hour link points. The upload page lives on the Connect
 * site, so the link matches the event the speaker applied to.
 */
function connectPhotoUploadUrl(token: string): string {
  const base = process.env.CONNECT_FRONTEND_URL ?? 'https://connect.dialectlibrary.com';
  return `${base.replace(/\/$/, '')}/photo?token=${token}`;
}

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
    private readonly storage: StorageService,
    private readonly sms: SmsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * The route paths below stay spelled "connect-2026" deliberately -- they
   * are public URLs the Connect site and the admin dashboard already call,
   * and renaming them next year would break both. What actually scopes a
   * year's data is ConnectRegistration.eventKey, which comes from settings
   * (PlatformSettings.connectEventYear), so hosting Connect 2027 is a
   * settings change rather than a deploy.
   */
  @Get('connect-2026/stats')
  async getConnectStats() {
    const eventKey = await this.platformSettings.getConnectEventKey();
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
    // Same shape as a real success, so a bot cannot tell it was caught by
    // comparing responses.
    if (dto.website) {
      return {
        status: 'received' as const,
        alreadyRegistered: false,
        addedSpeakerApplication: false,
        registeredAt: null,
        speaking: dto.interest === 'speak',
        memberLinked: false,
      };
    }

    const eventKey = await this.platformSettings.getConnectEventKey();
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

    // Read before the upsert so the response can tell the person they
    // were already on the list. The upsert itself cannot distinguish a
    // create from an update, and "you're already registered" is the whole
    // point of the duplicate notice.
    const existing = await this.prisma.connectRegistration.findUnique({
      where: { eventKey_email: { eventKey, email } },
      select: { id: true, createdAt: true, speaking: true },
    });

    const speaking = dto.interest === 'speak';

    // Attending and speaking are two things one person does, not two
    // competing registrations. An attendee who later applies to speak is
    // ADDING something, and telling them "you already registered" both
    // reads as a rejection and hides the fact that their application was
    // in fact recorded. The same holds in reverse: a speaker applicant
    // who later reserves a place is confirming attendance, not
    // duplicating.
    const addedSpeakerApplication = !!existing && speaking && !existing.speaking;
    const isDuplicate = !!existing && !addedSpeakerApplication;
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

    // Best-effort, exactly like every other notification in this file: the
    // registration is already durable, and a Resend outage must not turn a
    // successful reservation into an error the visitor sees.
    //
    // Sent on a repeat registration too. Someone registering again usually
    // does so because they never saw the first email, so suppressing it
    // would withhold the one thing they came back for.
    try {
      await this.mail.sendConnectRegistrationEmail({
        email,
        name,
        speaking,
        alreadyRegistered: isDuplicate,
        addedSpeakerApplication,
      });
    } catch {
      // Swallowed deliberately -- see above.
    }

    return {
      status: 'received' as const,
      alreadyRegistered: isDuplicate,
      // True when an existing attendee has just added a speaker
      // application, so the page can confirm the application rather than
      // report a duplicate.
      addedSpeakerApplication,
      // Lets the dialog say "you registered on 3 October" rather than a
      // bare "you're already on the list".
      registeredAt: existing?.createdAt ?? null,
      speaking,
      memberLinked: !!userId,
    };
  }

  // --- Connect 2026 admin ---------------------------------------------

  /**
   * The admin Connect view: counts, the speaker queue, and the attendee
   * list. One call rather than three, because the page shows all of it at
   * once and the volumes are small (a webinar interest list, not a table
   * that needs paging yet).
   */
  @Get('admin/connect-2026')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminConnectOverview() {
    const eventKey = await this.platformSettings.getConnectEventKey();
    const [registrations, countryGroups] = await Promise.all([
      this.prisma.connectRegistration.findMany({
        where: { eventKey },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, phoneNumber: true, phoneVerifiedAt: true } },
          speakerDecidedBy: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.connectRegistration.groupBy({ by: ['countryCode'], where: { eventKey } }),
    ]);

    const speakers = registrations.filter((row) => row.speaking);
    return {
      stats: {
        interested: registrations.length,
        countries: countryGroups.length,
        speakerApplicants: speakers.length,
        speakersPending: speakers.filter((row) => row.speakerStatus === 'PENDING').length,
        speakersApproved: speakers.filter((row) => row.speakerStatus === 'APPROVED').length,
        speakersDeclined: speakers.filter((row) => row.speakerStatus === 'DECLINED').length,
        // Who a reminder can actually reach by SMS: a linked member with a
        // verified number. Everyone else is email-only.
        smsReachable: registrations.filter((row) => row.user?.phoneVerifiedAt).length,
        withPhoto: speakers.filter((row) => row.photoUrl).length,
      },
      speakers,
      attendees: registrations.filter((row) => !row.speaking),
    };
  }

  /**
   * Approve or decline a speaker application.
   *
   * Approving mints a fresh 48-hour photo-upload token and emails it with
   * the good news; declining sends a short note. Both emails are
   * best-effort -- the decision is already recorded, and a mail failure
   * must not make an admin think the decision did not stick.
   */
  @Post('admin/connect-2026/speakers/:id/decision')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async decideConnectSpeaker(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: DecideConnectSpeakerDto,
  ) {
    const registration = await this.prisma.connectRegistration.findUnique({ where: { id } });
    if (!registration) throw new NotFoundException('Registration not found');
    if (!registration.speaking) {
      throw new BadRequestException('This registration is not a speaker application');
    }

    const approved = dto.decision === 'APPROVE';
    const photo = approved ? this.mintPhotoToken() : null;

    const updated = await this.prisma.connectRegistration.update({
      where: { id },
      data: {
        speakerStatus: approved ? 'APPROVED' : 'DECLINED',
        speakerDecidedAt: new Date(),
        speakerDecidedById: req.user.sub,
        ...(photo
          ? { photoTokenHash: photo.hash, photoTokenExpiresAt: photo.expiresAt }
          : // A declined speaker should not keep a live upload link.
            { photoTokenHash: null, photoTokenExpiresAt: null }),
      },
    });

    try {
      if (approved && photo) {
        await this.mail.sendConnectSpeakerApprovedEmail({
          email: registration.email,
          name: registration.name,
          topic: registration.speakerTopic ?? '',
          photoUrl: connectPhotoUploadUrl(photo.token),
          expiresAt: photo.expiresAt,
        });
      } else {
        await this.mail.sendConnectSpeakerDeclinedEmail({
          email: registration.email,
          name: registration.name,
        });
      }
    } catch {
      // Best-effort -- see above.
    }

    return { id: updated.id, speakerStatus: updated.speakerStatus };
  }

  /**
   * Re-send the photo-upload link to an already-approved speaker, for when
   * the first one expired or never arrived. Mints a new token, which
   * invalidates the previous one.
   */
  @Post('admin/connect-2026/speakers/:id/photo-link')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resendConnectPhotoLink(@Param('id') id: string) {
    const registration = await this.prisma.connectRegistration.findUnique({ where: { id } });
    if (!registration) throw new NotFoundException('Registration not found');
    if (registration.speakerStatus !== 'APPROVED') {
      throw new BadRequestException('Only an approved speaker can be sent a photo link');
    }

    const photo = this.mintPhotoToken();
    await this.prisma.connectRegistration.update({
      where: { id },
      data: { photoTokenHash: photo.hash, photoTokenExpiresAt: photo.expiresAt },
    });

    await this.mail.sendConnectPhotoLinkEmail({
      email: registration.email,
      name: registration.name,
      topic: registration.speakerTopic ?? '',
      photoUrl: connectPhotoUploadUrl(photo.token),
      expiresAt: photo.expiresAt,
    });

    return { sent: true, expiresAt: photo.expiresAt };
  }

  /**
   * Withdraw a speaker application, keeping the person's reservation.
   *
   * A speaker row IS their registration -- one record, two roles -- so
   * deleting it would also take away a seat they are entitled to. This
   * clears only the speaking half: they leave the speaker queue and
   * reappear under Attendees. Use the attendee delete to remove someone
   * from the event entirely.
   */
  @Delete('admin/connect-2026/speakers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async withdrawConnectSpeaker(@Param('id') id: string) {
    const registration = await this.prisma.connectRegistration.findUnique({
      where: { id },
      select: { id: true, speaking: true, photoKey: true },
    });
    if (!registration) throw new NotFoundException('Registration not found');
    if (!registration.speaking) {
      throw new BadRequestException('This registration is not a speaker application');
    }

    // The photo was collected for the event page; once the application is
    // gone there is no reason to keep serving it.
    if (registration.photoKey) {
      try {
        await this.storage.deleteObject(connectPhotoBucket(), registration.photoKey);
      } catch {
        // A stranded object is untidy, not harmful -- never block the
        // withdrawal on object storage.
      }
    }

    await this.prisma.connectRegistration.update({
      where: { id },
      data: {
        speaking: false,
        speakerTopic: null,
        speakerSummary: null,
        speakerStatus: 'PENDING',
        speakerDecidedAt: null,
        speakerDecidedById: null,
        photoUrl: null,
        photoKey: null,
        photoUploadedAt: null,
        // Kills any live upload link -- the application it belonged to no
        // longer exists.
        photoTokenHash: null,
        photoTokenExpiresAt: null,
      },
    });

    return { withdrawn: true, stillAttending: true };
  }

  /**
   * Remove a registration entirely. Used for spam, a duplicate under a
   * second address, or someone asking to be taken off the list.
   *
   * Deletes the row rather than flagging it: this is an event interest
   * list, not a financial record, and "take me off your list" should mean
   * exactly that.
   */
  @Delete('admin/connect-2026/registrations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteConnectRegistration(@Param('id') id: string) {
    const registration = await this.prisma.connectRegistration.findUnique({
      where: { id },
      select: { id: true, email: true, photoKey: true },
    });
    if (!registration) throw new NotFoundException('Registration not found');

    if (registration.photoKey) {
      try {
        await this.storage.deleteObject(connectPhotoBucket(), registration.photoKey);
      } catch {
        // See above -- a stranded object must not block the removal.
      }
    }

    await this.prisma.connectRegistration.delete({ where: { id } });
    return { deleted: true, email: registration.email };
  }

  /**
   * Reminder blast. `audience: 'speakers'` writes each speaker's own topic
   * into their email; `'all'` goes to every registration.
   *
   * Sent one at a time and counted rather than fired in parallel: the
   * volumes are small, and one bad address should not take down the rest
   * of the run. The response reports what actually went out.
   */
  @Post('admin/connect-2026/reminders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async sendConnectReminders(@Body() dto: SendConnectRemindersDto) {
    const eventKey = await this.platformSettings.getConnectEventKey();
    const speakersOnly = dto.audience === 'speakers';
    const recipients = await this.prisma.connectRegistration.findMany({
      where: {
        eventKey,
        ...(speakersOnly
          ? // Only approved speakers -- reminding a declined or undecided
            // applicant about "your talk" would be wrong.
            { speaking: true, speakerStatus: 'APPROVED' }
          : {}),
      },
      select: {
        email: true,
        name: true,
        speakerTopic: true,
        // Only a linked member can be texted: an anonymous registration has
        // no verified number, and the typed email is not one.
        user: {
          select: {
            phoneNumber: true,
            phoneVerifiedAt: true,
            smsNotificationsEnabled: true,
          },
        },
      },
    });

    let sent = 0;
    let smsSent = 0;
    const failed: string[] = [];
    for (const recipient of recipients) {
      const topic = speakersOnly ? (recipient.speakerTopic ?? null) : null;
      try {
        await this.mail.sendConnectReminderEmail({
          email: recipient.email,
          name: recipient.name,
          message: dto.message?.trim() || null,
          topic,
        });
        sent += 1;
      } catch {
        failed.push(recipient.email);
      }

      // SMS rides alongside the email rather than replacing it: it reaches
      // only linked members with a verified number who have not turned
      // notifications off, so it can never be the sole channel. Failures
      // are swallowed and simply not counted -- a text that does not send
      // must not make an admin think the email did not either.
      if (await this.sendConnectReminderSms(recipient.user, recipient.name, topic)) {
        smsSent += 1;
      }
    }

    return { audience: dto.audience, total: recipients.length, sent, smsSent, failed };
  }

  /**
   * Same three gates every other SMS in this codebase respects (see
   * P2PService.notify): a phone number, a verified one, and the user's own
   * smsNotificationsEnabled toggle. Returns whether a text actually went.
   */
  private async sendConnectReminderSms(
    user: {
      phoneNumber: string | null;
      phoneVerifiedAt: Date | null;
      smsNotificationsEnabled: boolean;
    } | null,
    name: string,
    topic: string | null,
  ): Promise<boolean> {
    if (!user?.phoneNumber || !user.phoneVerifiedAt || !user.smsNotificationsEnabled) {
      return false;
    }
    // Deliberately short. An SMS is charged per segment and read on a lock
    // screen, so it carries the reminder and points at the email for the
    // detail rather than repeating it.
    const firstName = name.trim().split(/\s+/)[0] ?? name;
    const body = topic
      ? `Hi ${firstName}, a reminder: you are speaking at Dialect Library Connect 2026 on "${topic}". October 2026, online. Details are in your email.`
      : `Hi ${firstName}, a reminder about Dialect Library Connect 2026 -- October 2026, online. Details are in your email.`;
    try {
      await this.sms.sendTransactional(user.phoneNumber, body);
      return true;
    } catch {
      // Already logged inside SmsFallbackChain. The email is the channel
      // that matters; a failed text is not worth failing the run over.
      return false;
    }
  }

  // --- Connect 2026 speaker photo upload (public, token-gated) ---------

  /**
   * A 48-hour opaque token, stored hashed. Mirrors the password-reset and
   * magic-link pattern: the raw value exists only in the email, so a
   * database read cannot be turned into an upload.
   */
  private mintPhotoToken() {
    const { token, hash } = generateOpaqueToken();
    return {
      token,
      hash,
      expiresAt: new Date(Date.now() + CONNECT_PHOTO_TOKEN_TTL_MS),
    };
  }

  private async speakerForPhotoToken(token: string) {
    const registration = await this.prisma.connectRegistration.findUnique({
      where: { photoTokenHash: hashToken(token) },
    });
    if (
      !registration ||
      !registration.photoTokenExpiresAt ||
      registration.photoTokenExpiresAt < new Date()
    ) {
      // One message for "wrong token" and "expired token" alike -- the
      // difference is not useful to the speaker and is useful to someone
      // guessing.
      throw new NotFoundException('This photo link is no longer valid. Ask us for a new one.');
    }
    return registration;
  }

  /** What the upload page shows before the speaker picks a file. */
  @Get('connect-2026/photo/:token')
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  async getConnectPhotoTarget(@Param('token') token: string) {
    const registration = await this.speakerForPhotoToken(token);
    return {
      name: registration.name,
      topic: registration.speakerTopic,
      expiresAt: registration.photoTokenExpiresAt,
      currentPhotoUrl: registration.photoUrl,
    };
  }

  /**
   * Exchanges the long-lived link token for a short presigned PUT. The
   * 48-hour window is the link's, not the upload URL's -- a presigned URL
   * valid for two days would be a far weaker credential than one valid for
   * fifteen minutes.
   */
  @Post('connect-2026/photo/:token')
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  async createConnectPhotoUpload(
    @Param('token') token: string,
    @Body() dto: CreateConnectPhotoUploadDto,
  ) {
    const registration = await this.speakerForPhotoToken(token);
    const extension = CONNECT_PHOTO_TYPES[dto.contentType];
    if (!extension) throw new BadRequestException('Upload a JPEG, PNG or WebP image');

    const bucket = connectPhotoBucket();
    // Prefixed by the registration's own eventKey rather than current
    // settings, so a link issued for last year's event still writes into
    // last year's folder after the admin rolls the year forward.
    const key = `${registration.eventKey}/speakers/${registration.id}/${randomUUID()}.${extension}`;
    const upload = await this.storage.createPresignedUploadUrl(bucket, key, dto.contentType, true);

    return { uploadUrl: upload.url, key, expiresInSeconds: upload.expiresInSeconds };
  }

  /**
   * Called once the browser's PUT succeeded. Consumes the token: a photo
   * link is for one upload, and leaving it live afterwards would let
   * anyone with the email replace the picture later.
   */
  @Post('connect-2026/photo/:token/complete')
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  async completeConnectPhotoUpload(
    @Param('token') token: string,
    @Body() dto: CompleteConnectPhotoUploadDto,
  ) {
    const registration = await this.speakerForPhotoToken(token);
    if (!dto.key.startsWith(`${registration.eventKey}/speakers/${registration.id}/`)) {
      throw new BadRequestException('That upload does not belong to this link');
    }

    const bucket = connectPhotoBucket();
    await this.prisma.connectRegistration.update({
      where: { id: registration.id },
      data: {
        photoKey: dto.key,
        photoUrl: this.storage.getPublicObjectUrl(bucket, dto.key),
        photoUploadedAt: new Date(),
        photoTokenHash: null,
        photoTokenExpiresAt: null,
      },
    });

    return { uploaded: true };
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
