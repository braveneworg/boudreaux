/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { sendPurchaseConfirmationEmail } from './send-purchase-confirmation.js';
import { buildPurchaseConfirmationEmailHtml } from './templates/purchase-confirmation-html.js';
import { buildPurchaseConfirmationEmailText } from './templates/purchase-confirmation-text.js';

const mockUpdateMany = vi.fn();
const mockSend = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  getPrisma: () => ({
    releasePurchase: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  }),
}));

vi.mock('./ses-client.js', () => ({
  sesClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

vi.mock('./templates/purchase-confirmation-html.js', () => ({
  buildPurchaseConfirmationEmailHtml: vi.fn(() => '<p>html</p>'),
}));

vi.mock('./templates/purchase-confirmation-text.js', () => ({
  buildPurchaseConfirmationEmailText: vi.fn(() => 'text'),
}));

const input = {
  purchaseId: 'purchase-1',
  customerEmail: 'fan@example.com',
  releaseTitle: 'Test Album',
  amountPaidCents: 1250,
  releaseId: 'a1b2c3d4e5f6a1b2c3d4e5f6',
};

describe('sendPurchaseConfirmationEmail', () => {
  beforeEach(() => {
    vi.stubEnv('EMAIL_FROM', 'shop@example.com');
    vi.stubEnv('BASE_URL', 'https://example.com');
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockSend.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("links the email to the buyer's collection", async () => {
    await sendPurchaseConfirmationEmail(input);

    expect(vi.mocked(buildPurchaseConfirmationEmailHtml)).toHaveBeenCalledWith(
      expect.objectContaining({ downloadUrl: 'https://example.com/collection' })
    );
    expect(vi.mocked(buildPurchaseConfirmationEmailText)).toHaveBeenCalledWith(
      expect.objectContaining({ downloadUrl: 'https://example.com/collection' })
    );
  });

  it('falls back to the production host when no base URL is configured', async () => {
    vi.stubEnv('BASE_URL', undefined);

    await sendPurchaseConfirmationEmail(input);

    expect(vi.mocked(buildPurchaseConfirmationEmailHtml)).toHaveBeenCalledWith(
      expect.objectContaining({ downloadUrl: 'https://fakefourrecords.com/collection' })
    );
  });

  it('sends the email and reports it sent', async () => {
    await expect(sendPurchaseConfirmationEmail(input)).resolves.toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('skips the email when it was already sent', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(sendPurchaseConfirmationEmail(input)).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('skips the email when no sender is configured', async () => {
    vi.stubEnv('EMAIL_FROM', '');

    await expect(sendPurchaseConfirmationEmail(input)).resolves.toBe(false);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('clears the sent flag when SES fails, so a retry can send it', async () => {
    mockSend.mockRejectedValueOnce(new Error('SES down'));

    await expect(sendPurchaseConfirmationEmail(input)).resolves.toBe(false);
    expect(mockUpdateMany).toHaveBeenLastCalledWith({
      where: { id: 'purchase-1' },
      data: { confirmationEmailSentAt: null },
    });
  });
});
