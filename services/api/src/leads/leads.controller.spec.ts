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
    connectRegistration: { count: jest.fn(), groupBy: jest.fn(), upsert: jest.fn() },
  };
  const controller = new LeadsController(
    prisma as unknown as PrismaService,
    {} as SubscriberAuthService,
    {} as MailService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.country.findUnique.mockResolvedValue({ id: 'ng' });
    prisma.connectRegistration.upsert.mockResolvedValue({ id: 'registration' });
  });

  const attendee: CreateConnectRegistrationDto = {
    name: ' Ada Example ',
    email: ' ADA@EXAMPLE.COM ',
    countryCode: 'ng',
    interest: 'attend',
    consent: true,
  };

  it('deduplicates an attendee by normalized event email', async () => {
    await expect(controller.registerForConnect(attendee)).resolves.toEqual({ status: 'received' });
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
});
