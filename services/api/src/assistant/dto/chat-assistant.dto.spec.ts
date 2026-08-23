import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatAssistantDto } from './chat-assistant.dto';

async function validateMessage(message: unknown) {
  const dto = plainToInstance(ChatAssistantDto, { message });
  return validate(dto);
}

describe('ChatAssistantDto', () => {
  it('rejects an empty message', async () => {
    const errors = await validateMessage('');
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a whitespace-only message', async () => {
    const errors = await validateMessage('   ');
    expect(errors).not.toHaveLength(0);
  });

  it('trims a valid message before validation', async () => {
    const dto = plainToInstance(ChatAssistantDto, { message: '  How do I train?  ' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.message).toBe('How do I train?');
  });
});
