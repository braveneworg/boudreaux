/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NoOpSmsService } from './noop-sms-service';

vi.mock('server-only', () => ({}));

describe('NoOpSmsService', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  it('returns ok:true with a synthetic messageId', async () => {
    const service = new NoOpSmsService();
    const result = await service.send('+15551234567', 'hello');
    expect(result.ok).toBe(true);
    const messageId = result.ok ? result.messageId : null;
    expect(messageId).toMatch(/^noop-\d+-1$/);
  });

  it('captures each send for later assertion', async () => {
    const service = new NoOpSmsService();
    await service.send('+15551234567', 'first');
    await service.send('+15557654321', 'second', { transactional: false });

    const captured = service.getCaptured();
    expect(captured).toHaveLength(2);
    expect(captured[0]?.body).toBe('first');
    expect(captured[0]?.transactional).toBe(true);
    expect(captured[1]?.transactional).toBe(false);
  });

  it('redacts the phone number in the log line', async () => {
    const service = new NoOpSmsService();
    await service.send('+15551234567', 'hello');
    const message = consoleInfoSpy.mock.calls[0]?.[0];
    expect(message).toContain('+1***67');
    expect(message).not.toContain('5551234567');
  });

  it('clears captured records on reset', async () => {
    const service = new NoOpSmsService();
    await service.send('+15551234567', 'hello');
    service.reset();
    expect(service.getCaptured()).toHaveLength(0);
  });

  it('fully masks a short recipient that has nothing safe to show', async () => {
    const service = new NoOpSmsService();
    await service.send('123', 'hello');
    const message = consoleInfoSpy.mock.calls[0]?.[0];
    expect(message).toContain('****');
    expect(message).not.toContain('123');
  });
});
