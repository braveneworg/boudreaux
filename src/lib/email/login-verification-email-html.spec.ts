/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { LOGO_URL } from './constants';
import { buildLoginVerificationEmailHtml } from './login-verification-email-html';

describe('buildLoginVerificationEmailHtml', () => {
  const baseInput = {
    url: 'https://example.com/api/auth/callback/email?token=abc123',
    email: 'fan@example.com',
    isNewUser: false,
  };

  describe('new user', () => {
    const newUserInput = { ...baseInput, isNewUser: true };

    it('should include the welcome heading for new users', () => {
      const html = buildLoginVerificationEmailHtml(newUserInput);
      expect(html).toContain('Welcome to Fake Four Inc.!');
    });

    it('should include a first-time welcome message for new users', () => {
      const html = buildLoginVerificationEmailHtml(newUserInput);
      expect(html).toContain('glad you&#039;re here');
    });
  });

  describe('returning user', () => {
    it('should include the welcome-back heading for returning users', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain('Welcome back!');
    });

    it('should not include the first-time welcome message for returning users', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).not.toContain("glad you're here");
    });
  });

  describe('sign-in CTA', () => {
    it('should include the sign-in URL as an href', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain('href="https://example.com/api/auth/callback/email?token=abc123"');
    });

    it('should render the CTA button with a black background and white text', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain('background-color: #18181b');
      expect(html).toContain('color: #ffffff');
    });

    it('should label the CTA button "Sign In"', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain('>Sign In<');
    });
  });

  describe('account row', () => {
    it('should include the user email in the account row', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain('fan@example.com');
    });

    it('should escape HTML special characters in the email address', () => {
      const html = buildLoginVerificationEmailHtml({
        ...baseInput,
        email: 'test+<tag>@example.com',
      });
      expect(html).toContain('test+&lt;tag&gt;@example.com');
      expect(html).not.toContain('<tag>');
    });
  });

  describe('logo', () => {
    it('should include the shared logo URL in the img src', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain(`src="${LOGO_URL}"`);
    });

    it('should include an alt attribute for the logo image', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain('alt="Fake Four Inc."');
    });
  });

  describe('structure', () => {
    it('should be a valid HTML document with doctype', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toMatch(/^<!DOCTYPE html>/i);
    });

    it('should include a security note about ignoring unexpected emails', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain('you can safely ignore it');
    });

    it('should include the expiry notice', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain('expires in 24 hours');
    });

    it('should include the Fake Four Inc. footer', () => {
      const html = buildLoginVerificationEmailHtml(baseInput);
      expect(html).toContain('fakefourrecords.com');
    });
  });
});
