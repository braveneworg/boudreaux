/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

import { FEATURE_GROUPS, featureGroupMembers } from '../../src/lib/config/env-manifest';
import { SOCIAL_PROVIDER_IDS } from '../../src/lib/config/social-providers';

/**
 * The repo cannot see which GitHub secrets exist, so the operator states which
 * social providers they intend to offer (the ENABLED_SOCIAL_PROVIDERS
 * repository variable). roll-host.yml runs this check before it writes the
 * host's env file: an intended provider whose credentials are empty fails the
 * run red while production keeps serving the version it already runs.
 * All values here are fakes; the script only tests them for emptiness.
 */

const SCRIPT = join(__dirname, 'check-social-provider-intent.sh');

const COMPLETE = {
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
  FACEBOOK_CLIENT_ID: 'fb-id',
  FACEBOOK_CLIENT_SECRET: 'fb-secret',
  TWITTER_CLIENT_ID: 'x-id',
  TWITTER_CLIENT_SECRET: 'x-secret',
  APPLE_CLIENT_ID: 'apple-id',
  APPLE_TEAM_ID: 'TEAM',
  APPLE_KEY_ID: 'KEY',
  APPLE_PRIVATE_KEY_BASE64: 'cGVt',
};

interface CheckResult {
  status: number | null;
  stdout: string;
}

const check = (env: Record<string, string>): CheckResult => {
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', ...env },
  });
  return { status: result.status, stdout: `${result.stdout}${result.stderr}` };
};

describe('check-social-provider-intent.sh', () => {
  it('passes when every intended provider is configured', () => {
    expect(check({ ...COMPLETE, ENABLED_SOCIAL_PROVIDERS: 'google,apple,facebook' }).status).toBe(
      0
    );
  });

  it('fails, naming the empty secrets, when an intended pair is empty', () => {
    const { status, stdout } = check({
      ...COMPLETE,
      FACEBOOK_CLIENT_ID: '',
      FACEBOOK_CLIENT_SECRET: '',
      ENABLED_SOCIAL_PROVIDERS: 'google,apple,facebook',
    });

    expect(status).toBe(1);
    expect(stdout).toContain('::error::');
    expect(stdout).toContain('facebook');
    expect(stdout).toContain('FACEBOOK_CLIENT_ID');
    expect(stdout).toContain('FACEBOOK_CLIENT_SECRET');
  });

  it('fails when only half of an intended pair is set', () => {
    const { status, stdout } = check({
      ...COMPLETE,
      GOOGLE_CLIENT_SECRET: '',
      ENABLED_SOCIAL_PROVIDERS: 'google',
    });

    expect(status).toBe(1);
    expect(stdout).toContain('GOOGLE_CLIENT_SECRET');
    expect(stdout).not.toContain('GOOGLE_CLIENT_ID,');
  });

  it('never prints a value', () => {
    const { stdout } = check({
      ...COMPLETE,
      FACEBOOK_CLIENT_SECRET: '',
      ENABLED_SOCIAL_PROVIDERS: 'google,facebook',
    });

    for (const value of Object.values(COMPLETE)) {
      expect(stdout).not.toContain(value);
    }
  });

  it('accepts Apple with a static client secret instead of key material', () => {
    expect(
      check({
        APPLE_CLIENT_ID: 'apple-id',
        APPLE_CLIENT_SECRET: 'static',
        ENABLED_SOCIAL_PROVIDERS: 'apple',
      }).status
    ).toBe(0);
  });

  it('fails Apple with incomplete key material and no static secret', () => {
    const { status, stdout } = check({
      APPLE_CLIENT_ID: 'apple-id',
      APPLE_TEAM_ID: 'TEAM',
      ENABLED_SOCIAL_PROVIDERS: 'apple',
    });

    expect(status).toBe(1);
    expect(stdout).toContain('APPLE_KEY_ID');
  });

  it('ignores a provider that is not intended, even with no credentials', () => {
    expect(
      check({
        GOOGLE_CLIENT_ID: 'g-id',
        GOOGLE_CLIENT_SECRET: 'g',
        ENABLED_SOCIAL_PROVIDERS: 'google',
      }).status
    ).toBe(0);
  });

  it('tolerates spaces and case in the list', () => {
    expect(check({ ...COMPLETE, ENABLED_SOCIAL_PROVIDERS: ' Google , APPLE ' }).status).toBe(0);
  });

  it('accepts "none" as an intent to offer no social provider', () => {
    expect(check({ ENABLED_SOCIAL_PROVIDERS: 'none' }).status).toBe(0);
  });

  it('fails on a provider name it does not know', () => {
    const { status, stdout } = check({ ...COMPLETE, ENABLED_SOCIAL_PROVIDERS: 'google,myspace' });

    expect(status).toBe(1);
    expect(stdout).toContain('myspace');
  });

  it('fails when the intent variable is not set at all', () => {
    expect(check(COMPLETE).status).toBe(1);
  });

  it('knows every credential name of every social feature group', () => {
    const script = readFileSync(SCRIPT, 'utf8');
    const names = FEATURE_GROUPS.filter(({ id }) =>
      (SOCIAL_PROVIDER_IDS as readonly string[]).includes(id)
    ).flatMap(featureGroupMembers);

    expect(names.filter((name) => !script.includes(name))).toEqual([]);
  });
});
