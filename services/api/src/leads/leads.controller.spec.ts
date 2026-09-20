import { BadRequestException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { LeadsController } from './leads.controller';
import { CreateConnectRegistrationDto } from './dto/create-connect-registration.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriberAuthService } from '../voice-stream/subscriber-auth/subscriber-auth.service';
import { MailService } from '../mail/mail.service';

describe('Connect 2026 registration', () => {
  const prisma = {
    country: { findUnique: jest.fn() },
    connectRegistration: {
      count: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  const mail = { sendConnectRegistrationEmail: jest.fn() };
  const controller = new LeadsController(
    prisma as unknown as PrismaService,
    {} as SubscriberAuthService,
    mail as unknown as MailService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.country.findUnique.mockResolvedValue({ id: 'ng' });
    prisma.connectRegistration.upsert.mockResolvedValue({ id: 'registration' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.connectRegistration.findUnique.mockResolvedValue(null);
    mail.sendConnectRegistrationEmail.mockResolvedValue(undefined);
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
    prisma.connectRegistration.findUnique.mockResolvedValue(null);
    mail.sendConnectRegistrationEmail.mockResolvedValue(undefined);
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
    prisma.connectRegistration.findUnique.mockResolvedValue(null);
    mail.sendConnectRegistrationEmail.mockResolvedValue(undefined);

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
});
