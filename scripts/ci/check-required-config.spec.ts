/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { join } from 'path';

/**
 * In production the app refuses to boot without its required runtime values
 * (src/lib/config/boot-check.ts). roll-host.yml runs this check first, on the
 * runner, so a missing secret fails the run red before the host is touched
 * instead of leaving a container that will not start. All values here are
 * fakes; the script only tests emptiness and length.
 */

const SCRIPT = join(__dirname, 'check-required-config.sh');

const run = (names: string[], env: Record<string, string>) => {
  const result = spawnSync('bash', [SCRIPT, ...names], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', ...env },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

describe('check-required-config.sh', () => {
  it('passes when every named value is set', () => {
    expect(run(['DATABASE_URL', 'EMAIL_FROM'], { DATABASE_URL: 'x', EMAIL_FROM: 'y' }).status).toBe(
      0
    );
  });

  it('fails, naming every empty or blank value', () => {
    const { status, output } = run(['DATABASE_URL', 'EMAIL_FROM', 'AUTH_URL'], {
      DATABASE_URL: 'x',
      EMAIL_FROM: '  ',
    });

    expect(status).toBe(1);
    expect(output).toContain('::error::');
    expect(output).toContain('EMAIL_FROM');
    expect(output).toContain('AUTH_URL');
    expect(output).not.toContain('DATABASE_URL');
  });

  it('fails when AUTH_SECRET or JOB_CALLBACK_SECRET is shorter than 32 characters', () => {
    const { status, output } = run(['AUTH_SECRET', 'JOB_CALLBACK_SECRET'], {
      AUTH_SECRET: 'a'.repeat(32),
      JOB_CALLBACK_SECRET: 'short-fake',
    });

    expect(status).toBe(1);
    expect(output).toContain('JOB_CALLBACK_SECRET must be at least 32 characters');
    expect(output).not.toContain('AUTH_SECRET must');
  });

  it('never prints a value', () => {
    const { output } = run(['JOB_CALLBACK_SECRET', 'EMAIL_FROM'], {
      JOB_CALLBACK_SECRET: 'short-fake',
      EMAIL_FROM: 'sender-fake@example.com',
    });

    expect(output).not.toContain('short-fake');
    expect(output).not.toContain('sender-fake@example.com');
  });

  it('fails when given no names, so a broken step cannot pass silently', () => {
    expect(run([], {}).status).toBe(1);
  });
});
