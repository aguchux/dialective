import { validate } from 'class-validator';
import { UpdatePlatformSettingsDto } from './update-platform-settings.dto';

const DL_COST_FIELDS = [
  'taskTokenCost',
  'domainConversationTaskTokenCost',
  'manualPhoneVerificationFeeTokens',
  'withdrawalFeeTokenAmount',
] as const;

describe('UpdatePlatformSettingsDto DL cost precision', () => {
  it.each(DL_COST_FIELDS)('accepts three decimal places for %s', async (field) => {
    const dto = Object.assign(new UpdatePlatformSettingsDto(), { [field]: 0.001 });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(DL_COST_FIELDS)('rejects more than three decimal places for %s', async (field) => {
    const dto = Object.assign(new UpdatePlatformSettingsDto(), { [field]: 0.0001 });
    const errors = await validate(dto);

    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: field })]));
  });
});

/**
 * The global ValidationPipe runs with `whitelist: true` and
 * `forbidNonWhitelisted: true`. A settings column with no DTO property is
 * therefore not "ignored" -- the request is rejected, or the field is stripped
 * and the save looks like it worked while changing nothing. That silent no-op
 * has already happened twice on this DTO (royaltiesEnabled/royaltyShadowMode),
 * so every Stream/VDCL gate the admin UI writes is asserted here.
 */
describe('UpdatePlatformSettingsDto Stream/VDCL gates are writable', () => {
  const STREAM_GATES = [
    'vdclEnabled',
    'vdclEnforcementEnabled',
    'vdclCatalogueCoverageFilterEnabled',
    'vdclRetentionExemptionEnabled',
    'streamSelfServeSignupEnabled',
  ] as const;

  it.each(STREAM_GATES)('accepts %s', async (field) => {
    const dto = new UpdatePlatformSettingsDto();
    (dto as Record<string, unknown>)[field] = true;

    await expect(validate(dto)).resolves.toEqual([]);
    // Present on the instance, so the pipe's whitelist keeps it rather than
    // stripping it into a silent no-op.
    expect((dto as Record<string, unknown>)[field]).toBe(true);
  });

  it.each(STREAM_GATES)('rejects a non-boolean for %s', async (field) => {
    const dto = new UpdatePlatformSettingsDto();
    (dto as Record<string, unknown>)[field] = 'yes';

    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain(field);
  });

  it('deliberately does NOT accept vdclPayoutSuppressionEnabled', async () => {
    // That gate suppresses contributor payouts, so it has its own OTP-gated
    // step-up route (TrainingEconomyStepUpService). Adding it here would let a
    // plain settings PATCH bypass that step-up -- its absence is the control,
    // not an oversight, and this test fails if someone "fixes" it.
    const dto = new UpdatePlatformSettingsDto();
    (dto as Record<string, unknown>).vdclPayoutSuppressionEnabled = true;

    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).not.toContain('vdclPayoutSuppressionEnabled');
    // Not a declared property, so the ValidationPipe's whitelist strips it
    // rather than persisting it.
    expect(Object.keys(new UpdatePlatformSettingsDto())).not.toContain(
      'vdclPayoutSuppressionEnabled',
    );
  });
});
