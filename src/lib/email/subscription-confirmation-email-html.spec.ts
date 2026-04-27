/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildSubscriptionConfirmationEmailHtml } from '@/lib/email/subscription-confirmation-email-html';

describe('buildSubscriptionConfirmationEmailHtml', () => {
  const baseData = {
    email: 'subscriber@example.com',
    tierLabel: 'Extra',
    amount: '$24.44',
    interval: 'month',
  };

  it('should return valid HTML with DOCTYPE', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('</html>');
  });

  it('should include meta charset and viewport', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('<meta charset="utf-8"');
    expect(result).toContain('<meta name="viewport"');
  });

  it('should include "Fake Four Inc." branding in header', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('Fake Four Inc.');
    expect(result).toContain('Subscription Confirmed');
  });

  it('should include a welcome heading', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('Welcome to the Family!');
  });

  it('should mention access to all music', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('all music');
    expect(result).toContain('Fake Four Inc. record label');
  });

  it('should include the tier label', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('Extra');
  });

  it('should include the amount and interval', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('$24.44/month');
  });

  it('should include the subscriber email', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('subscriber@example.com');
  });

  it('should include fakefourrecords.com in footer', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('fakefourrecords.com');
  });

  it('should include a link to the site', () => {
    const result = buildSubscriptionConfirmationEmailHtml(baseData);
    expect(result).toContain('href="https://fakefourrecords.com"');
  });

  describe('HTML escaping', () => {
    it('should escape HTML entities in the tier label', () => {
      const result = buildSubscriptionConfirmationEmailHtml({
        ...baseData,
        tierLabel: '<script>alert("xss")</script>',
      });
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should escape HTML entities in the email', () => {
      const result = buildSubscriptionConfirmationEmailHtml({
        ...baseData,
        email: 'user"@example.com',
      });
      expect(result).toContain('&quot;');
    });

    it('should escape HTML entities in the amount', () => {
      const result = buildSubscriptionConfirmationEmailHtml({
        ...baseData,
        amount: '<b>$24.44</b>',
      });
      expect(result).toContain('&lt;b&gt;');
    });

    it('should escape single quotes', () => {
      const result = buildSubscriptionConfirmationEmailHtml({
        ...baseData,
        tierLabel: "O'Connor Plan",
      });
      expect(result).toContain('&#039;');
    });
  });

  describe('email structure', () => {
    it('should use table-based layout for email compatibility', () => {
      const result = buildSubscriptionConfirmationEmailHtml(baseData);
      expect(result).toContain('role="presentation"');
      expect(result).toContain('<table');
    });

    it('should have a max-width of 600px', () => {
      const result = buildSubscriptionConfirmationEmailHtml(baseData);
      expect(result).toContain('max-width: 600px');
    });

    it('should use inline styles', () => {
      const result = buildSubscriptionConfirmationEmailHtml(baseData);
      expect(result).toContain('style="');
      expect(result).not.toContain('<style');
    });
  });
});
