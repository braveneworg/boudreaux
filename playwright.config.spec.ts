/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const BLANKED_CLOUDFRONT_KEYS = [
  'CLOUDFRONT_KEY_PAIR_ID',
  'CLOUDFRONT_PRIVATE_KEY_BASE64',
  'CLOUDFRONT_DISTRIBUTION_ID',
] as const;

/** Re-import the config so it reads the current (stubbed) `CI` value. */
const webServerEnv = async (): Promise<Record<string, string | undefined>> => {
  vi.resetModules();
  const { default: config } = await import('./playwright.config');
  const webServer = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
  return webServer?.env ?? {};
};

describe('playwright.config web server env', () => {
  describe.each([
    { mode: 'local', ci: '', port: '3099' },
    { mode: 'CI', ci: 'true', port: '3000' },
  ])('in $mode mode', ({ ci, port }) => {
    beforeEach(() => {
      vi.stubEnv('CI', ci);
    });

    it(`loads the config for this mode (port ${port})`, async () => {
      const env = await webServerEnv();

      expect(env.PORT).toBe(port);
    });

    // An absent or undefined key lets Next.js fill it from the copied `.env*`;
    // only an empty string keeps the live CloudFront keys out, as in CI.
    it.each(BLANKED_CLOUDFRONT_KEYS)('blanks %s with an empty string', async (key) => {
      const env = await webServerEnv();

      expect(env).toHaveProperty(key, '');
    });
  });
});
