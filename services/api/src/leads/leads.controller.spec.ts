import { BadRequestException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { LeadsController } from './leads.controller';
import { CreateConnectRegistrationDto } from './dto/create-connect-registration.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriberAuthService } from '../voice-stream/subscriber-auth/subscriber-auth.service';
import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import { SmsService } from '../sms/sms.service';

describe('Connect 2026 registration', () => {
  const prisma = {
    country: { findUnique: jest.fn() },
    connectRegistration: {
      count: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  const mail = {
    sendConnectRegistrationEmail: jest.fn(),
    sendConnectSpeakerApprovedEmail: jest.fn(),
    sendConnectSpeakerDeclinedEmail: jest.fn(),
    sendConnectPhotoLinkEmail: jest.fn(),
    sendConnectReminderEmail: jest.fn(),
  };
  const storage = {
    createPresignedUploadUrl: jest.fn(),
    getPublicObjectUrl: jest.fn(),
    deleteObject: jest.fn(),
  };
  const sms = { sendTransactional: jest.fn() };
  const controller = new LeadsController(
    prisma as unknown as PrismaService,
    {} as SubscriberAuthService,
    mail as unknown as MailService,
    storage as unknown as StorageService,
    sms as unknown as SmsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.country.findUnique.mockResolvedValue({ id: 'ng' });
    prisma.connectRegistration.upsert.mockResolvedValue({ id: 'registration' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.connectRegistration.findUnique.mockResolvedValue(null);
    mail.sendConnectRegistrationEmail.mockResolvedValue(undefined);
    mail.sendConnectSpeakerApprovedEmail.mockResolvedValue(undefined);
    mail.sendConnectSpeakerDeclinedEmail.mockResolvedValue(undefined);
    mail.sendConnectPhotoLinkEmail.mockResolvedValue(undefined);
    mail.sendConnectReminderEmail.mockResolvedValue(undefined);
    prisma.connectRegistration.update.mockResolvedValue({ id: 'r1', speakerStatus: 'APPROVED' });
    prisma.connectRegistration.findMany.mockResolvedValue([]);
    sms.sendTransactional.mockResolvedValue({ provider: 'termii' });
    storage.deleteObject.mockResolvedValue(undefined);
    prisma.connectRegistration.delete.mockResolvedValue({ id: 'r1' });
  });

  const attendee: CreateConnectRegistrationDto = {
    name: ' Ada Example ',
    email: ' ADA@EXAMPLE.COM ',
    countryCode: 'ng',
    interest: 'attend',
    consent: true,
  };

  it('deduplicates an attendee by normalized event email', async () => {
    await expect(controller.registerForConnect(attendee)).resolves.toMatchObject({
      status: 'received',
    });
    expect(prisma.connectRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventKey_email: { eventKey: 'connect-2026', email: 'ada@example.com' } },
        create: expect.objectContaining({ name: 'Ada Example', countryCode: 'NG', speaking: false }),
        update: expect.not.objectContaining({ speaking: true }),
      }),
    );
  });

  it('upgrades an attendee to a speaker without a second row', async () => {
    await controller.registerForConnect({
      ...attendee,
      interest: 'speak',
      speakerTopic: ' Our languages ',
      speakerSummary: ' A contributor story ',
    });
    expect(prisma.connectRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          speaking: true,
          speakerTopic: 'Our languages',
          speakerSummary: 'A contributor story',
        }),
      }),
    );
  });

  it('requires consent and a supported country', async () => {
    await expect(controller.registerForConnect({ ...attendee, consent: false })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.country.findUnique.mockResolvedValue(null);
    await expect(controller.registerForConnect(attendee)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.connectRegistration.upsert).not.toHaveBeenCalled();
  });

  it('requires a speaker topic and summary at the validation boundary', () => {
    const dto = Object.assign(new CreateConnectRegistrationDto(), { ...attendee, interest: 'speak' });
    const fields = validateSync(dto).map((error) => error.property);
    expect(fields).toContain('speakerTopic');
    expect(fields).toContain('speakerSummary');
  });

  it('reports real registrations and distinct countries', async () => {
    prisma.connectRegistration.count.mockResolvedValueOnce(23).mockResolvedValueOnce(4);
    prisma.connectRegistration.groupBy.mockResolvedValue([{ countryCode: 'NG' }, { countryCode: 'GB' }]);
    await expect(controller.getConnectStats()).resolves.toEqual({
      interested: 23,
      speakerApplicants: 4,
      countries: 2,
    });
  });

  describe('member lookup', () => {
    it('masks the matched member rather than returning their real details', async () => {
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Adaeze',
        lastName: 'Okafor',
        email: 'adaeze.okafor@gmail.com',
        status: 'ACTIVE',
        country: { name: 'Nigeria' },
        dialect: { name: 'Igbo' },
      });

      const result = await controller.lookupConnectMember({ email: 'Adaeze.Okafor@Gmail.com ' });

      expect(result.found).toBe(true);
      // Recognisable to the owner, useless to someone probing the address.
      expect(result).toMatchObject({ firstName: 'A•••••', lastName: 'O•••••' });
      expect(result.email).toBe('a••••••••@gmail.com');
      expect(JSON.stringify(result)).not.toContain('Adaeze');
      expect(JSON.stringify(result)).not.toContain('Okafor');
    });

    it('reports no match for an email with no account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(controller.lookupConnectMember({ email: 'nobody@example.com' })).resolves.toEqual({
        found: false,
      });
    });

    /**
     * A deactivated account should not be offered back as "your record" --
     * the person may have left deliberately.
     */
    it('does not surface a non-active account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Gone',
        lastName: 'Away',
        email: 'gone@example.com',
        status: 'DEACTIVATED',
        country: null,
        dialect: null,
      });
      await expect(controller.lookupConnectMember({ email: 'gone@example.com' })).resolves.toEqual({
        found: false,
      });
    });
  });

  describe('member linking', () => {
    it('links the registration when the person confirmed the match', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });

      await controller.registerForConnect({ ...attendee, confirmedMember: true });

      const call = prisma.connectRegistration.upsert.mock.calls[0][0];
      expect(call.create.userId).toBe('user-1');
      expect(call.create.linkedAt).toBeInstanceOf(Date);
    });

    /**
     * "Not me" has to mean anonymous. Linking on the email alone would
     * attach a member's account to whoever typed their address.
     */
    it('does not link when the person did not confirm', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });

      await controller.registerForConnect({ ...attendee, confirmedMember: false });

      const call = prisma.connectRegistration.upsert.mock.calls[0][0];
      expect(call.create.userId).toBeNull();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('never clears an existing link on re-registration', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await controller.registerForConnect({ ...attendee, confirmedMember: false });

      const call = prisma.connectRegistration.upsert.mock.calls[0][0];
      expect(call.update).not.toHaveProperty('userId');
    });
  });

  describe('duplicate registration', () => {
    it('reports a first-time registration as new', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue(null);
      const result = await controller.registerForConnect(attendee);
      expect(result).toMatchObject({ status: 'received', alreadyRegistered: false });
    });

    it('tells a returning visitor they are already on the list', async () => {
      const registeredAt = new Date('2026-09-01T10:00:00Z');
      prisma.connectRegistration.findUnique.mockResolvedValue({
        id: 'existing',
        createdAt: registeredAt,
        speaking: false,
      });

      const result = await controller.registerForConnect(attendee);

      expect(result).toMatchObject({ status: 'received', alreadyRegistered: true });
      expect(result.registeredAt).toEqual(registeredAt);
    });
  });

  describe('confirmation email', () => {
    it('emails the registrant after a successful reservation', async () => {
      await controller.registerForConnect(attendee);
      expect(mail.sendConnectRegistrationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ada@example.com',
          name: 'Ada Example',
          alreadyRegistered: false,
        }),
      );
    });

    /**
     * The registration row is already committed by this point, so a mail
     * outage must not turn a successful reservation into an error the
     * visitor sees.
     */
    it('still reports success when the email fails to send', async () => {
      mail.sendConnectRegistrationEmail.mockRejectedValue(new Error('resend down'));
      await expect(controller.registerForConnect(attendee)).resolves.toMatchObject({
        status: 'received',
      });
    });

    it('emails a repeat registrant too, flagged as already registered', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue({
        id: 'existing',
        createdAt: new Date(),
        speaking: false,
      });
      await controller.registerForConnect(attendee);
      expect(mail.sendConnectRegistrationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ alreadyRegistered: true }),
      );
    });

    it('does not email a honeypot submission', async () => {
      await controller.registerForConnect({ ...attendee, website: 'http://spam.example' });
      expect(mail.sendConnectRegistrationEmail).not.toHaveBeenCalled();
    });
  });

  describe('speaker decisions', () => {
    const speaker = {
      id: 'r1',
      email: 'speaker@example.com',
      name: 'Ada Speaker',
      speaking: true,
      speakerTopic: 'Why dialects matter',
      speakerStatus: 'PENDING',
    };
    const req = { user: { sub: 'admin-1' } } as never;

    it('approves, mints a photo token, and emails the link', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue(speaker);

      await controller.decideConnectSpeaker(req, 'r1', { decision: 'APPROVE' });

      const update = prisma.connectRegistration.update.mock.calls[0][0];
      expect(update.data.speakerStatus).toBe('APPROVED');
      // Only the hash is persisted -- the raw token lives in the email.
      expect(update.data.photoTokenHash).toEqual(expect.any(String));
      expect(update.data.photoTokenExpiresAt).toBeInstanceOf(Date);

      const emailed = mail.sendConnectSpeakerApprovedEmail.mock.calls[0][0];
      expect(emailed.topic).toBe('Why dialects matter');
      expect(emailed.photoUrl).toContain('/photo?token=');
      // The link, not the stored hash.
      expect(emailed.photoUrl).not.toContain(update.data.photoTokenHash);
    });

    it('sets the 48-hour expiry the approval email promises', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue(speaker);
      const before = Date.now();

      await controller.decideConnectSpeaker(req, 'r1', { decision: 'APPROVE' });

      const expiresAt: Date = prisma.connectRegistration.update.mock.calls[0][0].data
        .photoTokenExpiresAt;
      const hours = (expiresAt.getTime() - before) / (60 * 60 * 1000);
      expect(hours).toBeGreaterThan(47.9);
      expect(hours).toBeLessThan(48.1);
    });

    /** A declined speaker must not keep a live upload link. */
    it('clears any photo token when declining', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue(speaker);

      await controller.decideConnectSpeaker(req, 'r1', { decision: 'DECLINE' });

      const update = prisma.connectRegistration.update.mock.calls[0][0];
      expect(update.data.speakerStatus).toBe('DECLINED');
      expect(update.data.photoTokenHash).toBeNull();
      expect(mail.sendConnectSpeakerDeclinedEmail).toHaveBeenCalled();
      expect(mail.sendConnectSpeakerApprovedEmail).not.toHaveBeenCalled();
    });

    it('refuses to decide on an attendee-only registration', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue({ ...speaker, speaking: false });
      await expect(
        controller.decideConnectSpeaker(req, 'r1', { decision: 'APPROVE' }),
      ).rejects.toThrow(/not a speaker application/);
    });

    it('only re-sends a photo link to an approved speaker', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue(speaker);
      await expect(controller.resendConnectPhotoLink('r1')).rejects.toThrow(/approved speaker/);
    });
  });

  describe('reminders', () => {
    it('writes each speaker their own topic, and only to approved speakers', async () => {
      prisma.connectRegistration.findMany.mockResolvedValue([
        { email: 'a@example.com', name: 'A', speakerTopic: 'Topic A' },
        { email: 'b@example.com', name: 'B', speakerTopic: 'Topic B' },
      ]);

      const result = await controller.sendConnectReminders({ audience: 'speakers' });

      expect(prisma.connectRegistration.findMany.mock.calls[0][0].where).toMatchObject({
        speaking: true,
        speakerStatus: 'APPROVED',
      });
      expect(mail.sendConnectReminderEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ email: 'a@example.com', topic: 'Topic A' }),
      );
      expect(result).toMatchObject({ total: 2, sent: 2, failed: [] });
    });

    /** An attendee has no talk, so no topic line. */
    it('sends no topic to the all-registrations audience', async () => {
      prisma.connectRegistration.findMany.mockResolvedValue([
        { email: 'a@example.com', name: 'A', speakerTopic: 'Leaked topic' },
      ]);

      await controller.sendConnectReminders({ audience: 'all' });

      expect(mail.sendConnectReminderEmail).toHaveBeenCalledWith(
        expect.objectContaining({ topic: null }),
      );
    });

    /** One bad address must not stop the rest of the run. */
    it('keeps going past a failed send and reports it', async () => {
      prisma.connectRegistration.findMany.mockResolvedValue([
        { email: 'bad@example.com', name: 'A', speakerTopic: null },
        { email: 'good@example.com', name: 'B', speakerTopic: null },
      ]);
      mail.sendConnectReminderEmail
        .mockRejectedValueOnce(new Error('bounced'))
        .mockResolvedValueOnce(undefined);

      const result = await controller.sendConnectReminders({ audience: 'all' });

      expect(result).toMatchObject({ total: 2, sent: 1, failed: ['bad@example.com'] });
    });
  });

  describe('reminder SMS', () => {
    const verifiedMember = {
      phoneNumber: '+2348012345678',
      phoneVerifiedAt: new Date(),
      smsNotificationsEnabled: true,
    };

    it('texts a linked member with a verified number, alongside the email', async () => {
      prisma.connectRegistration.findMany.mockResolvedValue([
        { email: 'a@example.com', name: 'Ada Example', speakerTopic: null, user: verifiedMember },
      ]);

      const result = await controller.sendConnectReminders({ audience: 'all' });

      expect(mail.sendConnectReminderEmail).toHaveBeenCalledTimes(1);
      expect(sms.sendTransactional).toHaveBeenCalledWith(
        '+2348012345678',
        expect.stringContaining('Connect 2026'),
      );
      // First name only -- an SMS is charged per segment.
      expect(sms.sendTransactional.mock.calls[0][1]).toContain('Hi Ada,');
      expect(result).toMatchObject({ sent: 1, smsSent: 1 });
    });

    it('puts the speaker topic in the text for the speaker audience', async () => {
      prisma.connectRegistration.findMany.mockResolvedValue([
        { email: 'a@example.com', name: 'Ada', speakerTopic: 'Why dialects matter', user: verifiedMember },
      ]);

      await controller.sendConnectReminders({ audience: 'speakers' });

      expect(sms.sendTransactional.mock.calls[0][1]).toContain('Why dialects matter');
    });

    it('does not text an unlinked registration', async () => {
      prisma.connectRegistration.findMany.mockResolvedValue([
        { email: 'guest@example.com', name: 'Guest', speakerTopic: null, user: null },
      ]);

      const result = await controller.sendConnectReminders({ audience: 'all' });

      expect(sms.sendTransactional).not.toHaveBeenCalled();
      expect(result).toMatchObject({ sent: 1, smsSent: 0 });
    });

    /** An unverified number is not a number we may text. */
    it('does not text a member whose number is unverified', async () => {
      prisma.connectRegistration.findMany.mockResolvedValue([
        {
          email: 'a@example.com',
          name: 'Ada',
          speakerTopic: null,
          user: { ...verifiedMember, phoneVerifiedAt: null },
        },
      ]);

      await controller.sendConnectReminders({ audience: 'all' });

      expect(sms.sendTransactional).not.toHaveBeenCalled();
    });

    it("respects the member's own SMS notifications toggle", async () => {
      prisma.connectRegistration.findMany.mockResolvedValue([
        {
          email: 'a@example.com',
          name: 'Ada',
          speakerTopic: null,
          user: { ...verifiedMember, smsNotificationsEnabled: false },
        },
      ]);

      await controller.sendConnectReminders({ audience: 'all' });

      expect(sms.sendTransactional).not.toHaveBeenCalled();
    });

    /**
     * The email is the channel that matters. A failed text must not be
     * reported as a failed reminder, or an admin will re-send to everyone.
     */
    it('still counts the email as sent when the text fails', async () => {
      prisma.connectRegistration.findMany.mockResolvedValue([
        { email: 'a@example.com', name: 'Ada', speakerTopic: null, user: verifiedMember },
      ]);
      sms.sendTransactional.mockRejectedValue(new Error('carrier down'));

      const result = await controller.sendConnectReminders({ audience: 'all' });

      expect(result).toMatchObject({ sent: 1, smsSent: 0, failed: [] });
    });
  });

  /**
   * Attending and speaking are two things one person does, not competing
   * registrations. Reported as a duplicate, an added speaker application
   * reads as a rejection and hides that it was in fact recorded.
   */
  describe('attendee adds a speaker application', () => {
    const asAttendee = { id: 'existing', createdAt: new Date('2026-09-01'), speaking: false };

    it('confirms the application instead of reporting a duplicate', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue(asAttendee);

      const result = await controller.registerForConnect({
        ...attendee,
        interest: 'speak',
        speakerTopic: 'Why dialects matter',
        speakerSummary: 'A short talk.',
      });

      expect(result).toMatchObject({
        alreadyRegistered: false,
        addedSpeakerApplication: true,
        speaking: true,
      });
    });

    it('records the topic on the existing registration', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue(asAttendee);

      await controller.registerForConnect({
        ...attendee,
        interest: 'speak',
        speakerTopic: 'Why dialects matter',
        speakerSummary: 'A short talk.',
      });

      const update = prisma.connectRegistration.upsert.mock.calls[0][0].update;
      expect(update).toMatchObject({ speaking: true, speakerTopic: 'Why dialects matter' });
    });

    it('emails the application confirmation, not the duplicate notice', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue(asAttendee);

      await controller.registerForConnect({
        ...attendee,
        interest: 'speak',
        speakerTopic: 'Why dialects matter',
        speakerSummary: 'A short talk.',
      });

      expect(mail.sendConnectRegistrationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ alreadyRegistered: false, addedSpeakerApplication: true }),
      );
    });

    /**
     * The reverse direction is a genuine duplicate: a speaker applicant is
     * already attending, so reserving again adds nothing.
     */
    it('still reports a duplicate when a speaker re-reserves a place', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue({
        id: 'existing',
        createdAt: new Date('2026-09-01'),
        speaking: true,
      });

      const result = await controller.registerForConnect(attendee);

      expect(result).toMatchObject({
        alreadyRegistered: true,
        addedSpeakerApplication: false,
      });
    });

    it('still reports a duplicate when a speaker re-applies', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue({
        id: 'existing',
        createdAt: new Date('2026-09-01'),
        speaking: true,
      });

      const result = await controller.registerForConnect({
        ...attendee,
        interest: 'speak',
        speakerTopic: 'Same topic',
        speakerSummary: 'Same summary.',
      });

      expect(result).toMatchObject({ alreadyRegistered: true, addedSpeakerApplication: false });
    });
  });

  describe('removing speakers and registrations', () => {
    /**
     * A speaker row IS the person's registration. Withdrawing the
     * application must not also take away a seat they are entitled to.
     */
    it('withdraws the application but keeps the reservation', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue({
        id: 'r1',
        speaking: true,
        photoKey: null,
      });

      const result = await controller.withdrawConnectSpeaker('r1');

      const update = prisma.connectRegistration.update.mock.calls[0][0];
      expect(update.data).toMatchObject({
        speaking: false,
        speakerTopic: null,
        speakerStatus: 'PENDING',
        // Any live upload link dies with the application.
        photoTokenHash: null,
      });
      expect(prisma.connectRegistration.delete).not.toHaveBeenCalled();
      expect(result).toMatchObject({ withdrawn: true, stillAttending: true });
    });

    it('removes the speaker photo when withdrawing', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue({
        id: 'r1',
        speaking: true,
        photoKey: 'connect-2026/speakers/r1/photo.jpg',
      });

      await controller.withdrawConnectSpeaker('r1');

      expect(storage.deleteObject).toHaveBeenCalledWith(
        expect.any(String),
        'connect-2026/speakers/r1/photo.jpg',
      );
    });

    /** Object storage must never block the withdrawal itself. */
    it('withdraws even when deleting the photo fails', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue({
        id: 'r1',
        speaking: true,
        photoKey: 'connect-2026/speakers/r1/photo.jpg',
      });
      storage.deleteObject.mockRejectedValue(new Error('spaces down'));

      await expect(controller.withdrawConnectSpeaker('r1')).resolves.toMatchObject({
        withdrawn: true,
      });
      expect(prisma.connectRegistration.update).toHaveBeenCalled();
    });

    it('refuses to withdraw a registration that is not a speaker', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue({
        id: 'r1',
        speaking: false,
        photoKey: null,
      });
      await expect(controller.withdrawConnectSpeaker('r1')).rejects.toThrow(
        /not a speaker application/,
      );
    });

    it('deletes a registration outright', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue({
        id: 'r1',
        email: 'gone@example.com',
        photoKey: null,
      });

      const result = await controller.deleteConnectRegistration('r1');

      expect(prisma.connectRegistration.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
      expect(result).toMatchObject({ deleted: true, email: 'gone@example.com' });
    });

    it('404s on an unknown registration', async () => {
      prisma.connectRegistration.findUnique.mockResolvedValue(null);
      await expect(controller.deleteConnectRegistration('nope')).rejects.toThrow(/not found/i);
    });
  });
});
