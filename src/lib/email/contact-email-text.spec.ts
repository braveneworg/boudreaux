/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, it, expect } from 'vitest';

import { buildContactEmailText } from '@/lib/email/contact-email-text';

describe('buildContactEmailText', () => {
  const baseData = {
    reason: 'New opportunity',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    message: 'I have an exciting collaboration proposal.',
    timestamp: 'Saturday, January 15, 2025 at 3:00 PM',
  };

  it('should include the header', () => {
    const result = buildContactEmailText(baseData);
    expect(result).toContain('CONTACT FORM SUBMISSION');
    expect(result).toContain('=======================');
  });

  it('should include the reason', () => {
    const result = buildContactEmailText(baseData);
    expect(result).toContain('Reason: New opportunity');
  });

  it('should include sender name', () => {
    const result = buildContactEmailText(baseData);
    expect(result).toContain('From: Jane Doe');
  });

  it('should include sender email', () => {
    const result = buildContactEmailText(baseData);
    expect(result).toContain('Email: jane@example.com');
  });

  it('should include phone when provided', () => {
    const result = buildContactEmailText({ ...baseData, phone: '+1 555-123-4567' });
    expect(result).toContain('Phone: +1 555-123-4567');
  });

  it('should show "Not provided" when phone is omitted', () => {
    const result = buildContactEmailText(baseData);
    expect(result).toContain('Phone: Not provided');
  });

  it('should show "Not provided" when phone is undefined', () => {
    const result = buildContactEmailText({ ...baseData, phone: undefined });
    expect(result).toContain('Phone: Not provided');
  });

  it('should include the message body', () => {
    const result = buildContactEmailText(baseData);
    expect(result).toContain(baseData.message);
  });

  it('should include the timestamp in the footer', () => {
    const result = buildContactEmailText(baseData);
    expect(result).toContain(baseData.timestamp);
  });

  it('should include the site name in footer', () => {
    const result = buildContactEmailText(baseData);
    expect(result).toContain('fakefourrecords.com');
  });

  it('should preserve multiline messages', () => {
    const multilineMessage = 'Line one\nLine two\nLine three';
    const result = buildContactEmailText({ ...baseData, message: multilineMessage });
    expect(result).toContain('Line one\nLine two\nLine three');
  });

  it('should handle special characters in fields', () => {
    const result = buildContactEmailText({
      ...baseData,
      firstName: "O'Brien",
      lastName: 'Müller',
      message: 'Test with <html> & "quotes"',
    });
    expect(result).toContain("O'Brien");
    expect(result).toContain('Müller');
    expect(result).toContain('<html> & "quotes"');
  });
});
