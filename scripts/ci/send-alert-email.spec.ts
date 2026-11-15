/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * A red scheduled run only helps if somebody hears about it. GitHub's own
 * notice depends on one account's notification settings, so the keepalive
 * also mails the alert address itself through SES. `aws` is a stub that
 * records what it was asked to send; all values are fakes.
 */

const SCRIPT = join(__dirname, 'send-alert-email.sh');
const FAKE_TO = 'alerts-fake@example.com';
const FAKE_FROM = 'noreply-fake@example.com';

/** Records its arguments and a copy of the `file://` payload, then exits with FAKE_AWS_EXIT. */
const AWS_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$STUB_DIR/aws-args"
for arg in "$@"; do
  case "$arg" in
    file://*) cp "\${arg#file://}" "$STUB_DIR/aws-payload" ;;
  esac
done
exit "\${FAKE_AWS_EXIT:-0}"
`;

interface RunResult {
  status: number | null;
  output: string;
}

let workDir: string;

const run = (args: string[], env: Record<string, string> = {}): RunResult => {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${workDir}:${process.env.PATH ?? ''}`,
      NODE_ENV: 'test',
      STUB_DIR: workDir,
      ALERT_EMAIL: FAKE_TO,
      EMAIL_FROM: FAKE_FROM,
      ...env,
    },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const sentArgs = (): string[] => readFileSync(join(workDir, 'aws-args'), 'utf8').split('\n');

/** The MIME message the stubbed `aws` was handed, decoded from its base64 payload. */
const sentMessage = (): string => {
  const payload: unknown = JSON.parse(readFileSync(join(workDir, 'aws-payload'), 'utf8'));
  const data =
    typeof payload === 'object' && payload !== null && 'Data' in payload ? payload.Data : '';
  return Buffer.from(String(data), 'base64').toString('utf8');
};

describe('send-alert-email.sh', () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'send-alert-email-spec-'));
    const stub = join(workDir, 'aws');
    writeFileSync(stub, AWS_STUB);
    chmodSync(stub, 0o755);
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('sends one raw SES email from EMAIL_FROM to ALERT_EMAIL', () => {
    const { status } = run(['Redis keepalive failed', 'The host does not resolve.']);

    expect(status).toBe(0);
    expect(sentArgs().slice(0, 2)).toEqual(['ses', 'send-raw-email']);

    const message = sentMessage();
    expect(message).toContain(`From: ${FAKE_FROM}`);
    expect(message).toContain(`To: ${FAKE_TO}`);
    expect(message).toContain('Subject: Redis keepalive failed');
    expect(message).toContain('\n\nThe host does not resolve.');
  });

  it('passes the payload as base64 whatever the runner has configured', () => {
    run(['Subject', 'Body']);

    const args = sentArgs();
    expect(args[args.indexOf('--cli-binary-format') + 1]).toBe('base64');
  });

  it('keeps a multi-line body intact', () => {
    run(['Subject', 'line one\nline two\n\nline four']);

    expect(sentMessage()).toContain('line one\nline two\n\nline four');
  });

  it('folds a multi-line subject onto one line so it cannot inject headers', () => {
    run(['Subject\nBcc: someone-fake@example.com', 'Body']);

    const headers = sentMessage().split('\n\n')[0];
    expect(headers).not.toMatch(/^Bcc:/m);
  });

  it('fails without sending when ALERT_EMAIL is empty', () => {
    const { status, output } = run(['Subject', 'Body'], { ALERT_EMAIL: '' });

    expect(status).toBe(1);
    expect(output).toContain('::error::');
    expect(output).toContain('ALERT_EMAIL');
    expect(existsSync(join(workDir, 'aws-args'))).toBe(false);
  });

  it('fails without sending when EMAIL_FROM is empty', () => {
    const { status, output } = run(['Subject', 'Body'], { EMAIL_FROM: '' });

    expect(status).toBe(1);
    expect(output).toContain('EMAIL_FROM');
    expect(existsSync(join(workDir, 'aws-args'))).toBe(false);
  });

  it('fails when the subject or the body is missing', () => {
    expect(run(['Subject only']).status).toBe(1);
  });

  it('fails loudly when SES refuses the send', () => {
    const { status, output } = run(['Subject', 'Body'], { FAKE_AWS_EXIT: '254' });

    expect(status).toBe(1);
    expect(output).toContain('::error::');
  });

  it('never prints either address', () => {
    const sent = run(['Subject', 'Body']);
    const refused = run(['Subject', 'Body'], { FAKE_AWS_EXIT: '254' });

    expect(`${sent.output}${refused.output}`).not.toContain(FAKE_TO);
    expect(`${sent.output}${refused.output}`).not.toContain(FAKE_FROM);
  });
});
