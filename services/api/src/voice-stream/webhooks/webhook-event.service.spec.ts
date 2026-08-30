import { WebhookEventType } from '@dialectiva/db';
import { WebhookEventService } from './webhook-event.service';

function setup() {
  const streams = { publish: jest.fn().mockResolvedValue('1-0') };
  const service = new WebhookEventService(streams as never);
  return { service, streams };
}

describe('WebhookEventService.emit', () => {
  it('publishes the correct stream message shape', async () => {
    const { service, streams } = setup();

    await service.emit('org-1', WebhookEventType.DECK_CREATED, { deck_id: 'deck-1' });

    expect(streams.publish).toHaveBeenCalledWith('webhook-deliveries', {
      organization_id: 'org-1',
      event_type: WebhookEventType.DECK_CREATED,
      payload: JSON.stringify({ deck_id: 'deck-1' }),
      attempt: '1',
    });
  });

  it('does not throw when the publish itself fails', async () => {
    const { service, streams } = setup();
    streams.publish.mockRejectedValue(new Error('redis down'));

    await expect(
      service.emit('org-1', WebhookEventType.DECK_CREATED, {}),
    ).resolves.toBeUndefined();
  });
});
