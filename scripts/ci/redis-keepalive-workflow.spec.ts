/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Workflow wiring for the Redis keepalive's alert. The two scripts have their
 * own specs; these assertions pin that a failed write still reaches the alert
 * step, with the reason the write step recorded and the secrets the send
 * needs, so a refactor cannot leave the run red and silent again.
 */

const workflow = readFileSync(
  join(__dirname, '..', '..', '.github', 'workflows', 'redis-keepalive.yml'),
  'utf8'
);

/** The text of one step, from its `- name:` line to the next step. */
const stepBlock = (name: string): string => {
  const start = workflow.indexOf(`- name: ${name}`);
  if (start === -1) {
    return '';
  }
  const rest = workflow.slice(start);
  const next = rest.slice(1).search(/\n\s+- name: /);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

describe('redis-keepalive.yml', () => {
  const write = stepBlock('Write the keepalive record');
  const alert = stepBlock('Email the alert address');

  it('gives the write step an id so the alert can read its failure reason', () => {
    expect(write).toContain('id: keepalive');
    expect(write).toContain('bash scripts/ci/redis-keepalive.sh');
  });

  it('runs the alert step only when the job has failed', () => {
    expect(alert).toContain('if: failure()');
  });

  it('checks out the alert script alongside the keepalive script', () => {
    expect(workflow).toContain('scripts/ci/send-alert-email.sh');
    expect(alert).toContain('bash scripts/ci/send-alert-email.sh');
  });

  it('hands the alert step the addresses and SES credentials from secrets', () => {
    for (const name of [
      'ALERT_EMAIL',
      'EMAIL_FROM',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
    ]) {
      expect(alert).toContain(`${name}: \${{ secrets.${name} }}`);
    }
  });

  it('passes the failure reason through env, never interpolated into the script', () => {
    expect(alert).toContain('REASON: ${{ steps.keepalive.outputs.reason }}');
    expect(alert.slice(alert.indexOf('run:'))).not.toContain('${{');
  });
});
