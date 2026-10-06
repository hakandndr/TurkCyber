import { describe, expect, it } from 'vitest';
import { handleOutbound } from '../worker/outbound/outbound-source.js';
const aliases = ['source.example', 'www.source.example'];
function request(extra: Record<string, string | undefined> = {}) {
  return new Request('https://source.example/__analytics/outbound', {
    method: 'POST',
    headers: {
      origin: 'https://source.example',
      referer: 'https://source.example/',
      'cf-connecting-ip': '203.0.113.42',
    },
    body: JSON.stringify({
      eventId: '11111111-2222-4333-8444-555555555555',
      path: '/',
      destination: 'https://external.example/docs?token=secret#secret',
      ...extra,
    }),
  });
}
describe('outbound trusted source boundary', () => {
  it('refuses spoofing, internal aliases, secret paths and incorrect source attribution', async () => {
    for (const extra of [
      { site_id: 'spoof' },
      { producer_id: 'spoof' },
      { path: '/wrong' },
      { destination: 'https://www.source.example/' },
      { destination: 'https://external.example/session/secret' },
    ])
      expect(
        (
          await handleOutbound(
            request(extra),
            {},
            {
              waitUntil() {
                throw Error('invalid input scheduled');
              },
            },
            { aliases },
          )
        ).status,
      ).toBe(400);
  });
  it('does not forward when local authority is missing', async () => {
    expect(
      (
        await handleOutbound(
          request(),
          {},
          {
            waitUntil() {
              throw Error('missing local write');
            },
          },
          { aliases, local: true },
        )
      ).status,
    ).toBe(503);
  });
  it('isolates collector exceptions and strips query/fragment before delivery', async () => {
    const pending: Promise<unknown>[] = [];
    const events: string[] = [];
    const response = await handleOutbound(
      request(),
      {
        DNDR_COLLECTOR: {
          async recordActivity(event) {
            events.push(event.outboundUrl);
            throw Error('unavailable');
          },
        },
      },
      { waitUntil: (p) => pending.push(p) },
      { aliases },
    );
    expect(response.status).toBe(204);
    await Promise.all(pending);
    expect(events).toEqual(['https://external.example/docs', 'https://external.example/docs']);
  });
});
