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
