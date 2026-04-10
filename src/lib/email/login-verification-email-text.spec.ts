/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildLoginVerificationEmailText } from './login-verification-email-text';

describe('buildLoginVerificationEmailText', () => {
  const baseInput = {
    url: 'https://example.com/api/auth/callback/email?token=abc123',
    email: 'fan@example.com',
    isNewUser: false,
  };

  describe('new user', () => {
    it('should include the welcome heading for new users', () => {
      const text = buildLoginVerificationEmailText({ ...baseInput, isNewUser: true });
      expect(text).toContain('Welcome to Fake Four Inc.!');
    });

    it('should include a first-time welcome message for new users', () => {
      const text = buildLoginVerificationEmailText({ ...baseInput, isNewUser: true });
      expect(text).toContain("glad you're here");
    });
  });

  describe('returning user', () => {
    it('should include the welcome-back greeting for returning users', () => {
      const text = buildLoginVerificationEmailText(baseInput);
      expect(text).toContain('Welcome back!');
    });

    it('should not include the first-time welcome message for returning users', () => {
      const text = buildLoginVerificationEmailText(baseInput);
      expect(text).not.toContain("glad you're here");
    });
  });

  describe('content', () => {
    it('should include the sign-in URL', () => {
      const text = buildLoginVerificationEmailText(baseInput);
      expect(text).toContain('https://example.com/api/auth/callback/email?token=abc123');
    });

    it('should include the user email address', () => {
      const text = buildLoginVerificationEmailText(baseInput);
      expect(text).toContain('fan@example.com');
    });

    it('should include the expiry notice', () => {
      const text = buildLoginVerificationEmailText(baseInput);
      expect(text).toContain('expires in 24 hours');
    });

    it('should include the security note about ignoring unexpected emails', () => {
      const text = buildLoginVerificationEmailText(baseInput);
      expect(text).toContain('safely ignore it');
    });

    it('should include the Fake Four Inc. footer', () => {
      const text = buildLoginVerificationEmailText(baseInput);
      expect(text).toContain('fakefourrecords.com');
    });
  });
});
