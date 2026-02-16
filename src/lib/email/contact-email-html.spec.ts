/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, it, expect } from 'vitest';

import { buildContactEmailHtml } from '@/lib/email/contact-email-html';

describe('buildContactEmailHtml', () => {
  const baseData = {
    reason: 'New opportunity',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    message: 'I have an exciting collaboration proposal.',
    timestamp: 'Saturday, January 15, 2025 at 3:00 PM',
  };

  it('should return valid HTML with DOCTYPE', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('</html>');
  });

  it('should include meta charset and viewport', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain('<meta charset="utf-8"');
    expect(result).toContain('<meta name="viewport"');
  });

  it('should include "Fake Four Inc." branding in header', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain('Fake Four Inc.');
    expect(result).toContain('Contact Form Submission');
  });

  it('should include the reason as a badge', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain('New opportunity');
  });

  it('should include sender name', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain('Jane');
    expect(result).toContain('Doe');
  });

  it('should include sender email as a mailto link', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain('mailto:jane@example.com');
    expect(result).toContain('jane@example.com');
  });

  it('should include phone when provided', () => {
    const result = buildContactEmailHtml({ ...baseData, phone: '+1 555-123-4567' });
    expect(result).toContain('+1 555-123-4567');
    expect(result).not.toContain('Not provided');
  });

  it('should show "Not provided" when phone is omitted', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain('Not provided');
  });

  it('should include the message body', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain(baseData.message);
  });

  it('should include the timestamp in the footer', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain(baseData.timestamp);
  });

  it('should include fakefourrecords.com in footer', () => {
    const result = buildContactEmailHtml(baseData);
    expect(result).toContain('fakefourrecords.com');
  });

  describe('HTML escaping', () => {
    it('should escape HTML entities in the reason', () => {
      const result = buildContactEmailHtml({
        ...baseData,
        reason: '<script>alert("xss")</script>',
      });
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should escape HTML entities in name fields', () => {
      const result = buildContactEmailHtml({
        ...baseData,
        firstName: '<b>Bold</b>',
        lastName: 'O&Brien',
      });
      expect(result).toContain('&lt;b&gt;Bold&lt;/b&gt;');
      expect(result).toContain('O&amp;Brien');
    });

    it('should escape HTML entities in the email', () => {
      const result = buildContactEmailHtml({
        ...baseData,
        email: 'user"@example.com',
      });
      expect(result).toContain('&quot;');
    });

    it('should escape HTML entities in the message', () => {
      const result = buildContactEmailHtml({
        ...baseData,
        message: 'Testing <div>tags</div> & "quotes"',
      });
      expect(result).toContain('&lt;div&gt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&quot;');
    });

    it('should escape single quotes', () => {
      const result = buildContactEmailHtml({
        ...baseData,
        firstName: "O'Connor",
      });
      expect(result).toContain('&#039;');
    });
  });

  describe('message formatting', () => {
    it('should convert newlines in message to <br /> tags', () => {
      const result = buildContactEmailHtml({
        ...baseData,
        message: 'Line one\nLine two\nLine three',
      });
      expect(result).toContain('Line one<br />Line two<br />Line three');
    });

    it('should handle empty lines in message', () => {
      const result = buildContactEmailHtml({
        ...baseData,
        message: 'Paragraph one\n\nParagraph two',
      });
      expect(result).toContain('Paragraph one<br /><br />Paragraph two');
    });
  });

  describe('email structure', () => {
    it('should use table-based layout for email compatibility', () => {
      const result = buildContactEmailHtml(baseData);
      expect(result).toContain('role="presentation"');
      expect(result).toContain('<table');
    });

    it('should have a max-width of 600px', () => {
      const result = buildContactEmailHtml(baseData);
      expect(result).toContain('max-width: 600px');
    });

    it('should use inline styles', () => {
      const result = buildContactEmailHtml(baseData);
      expect(result).toContain('style="');
      expect(result).not.toContain('<style');
    });
  });
});
