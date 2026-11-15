/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * The keepalive went red for six days (2026-11-10 on) saying only "PING
 * request failed (HTTP error or timeout)": the script threw away curl's exit
 * code and the HTTP status, so a deleted database, a rotated token and a
 * spent quota all read the same. These specs pin that each cause is named,
 * that the reason reaches the alert step through `GITHUB_OUTPUT`, and that
 * neither the endpoint nor the token is ever printed. `curl` is a stub; all
 * values are fakes.
 */

const SCRIPT = join(__dirname, 'redis-keepalive.sh');
const FAKE_HOST = 'fake-db-12345.upstash.example';
const FAKE_URL = `https://${FAKE_HOST}`;
const FAKE_TOKEN = 'fake-token-abcdef';

/**
 * Stands in for curl: writes FAKE_BODY to the `-o` file, prints
 * FAKE_HTTP_CODE the way `-w '%{http_code}'` does, names the host on stderr
 * as real curl does on a DNS failure, and exits with FAKE_CURL_EXIT.
 */
const CURL_STUB = `#!/usr/bin/env bash
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
if [ -n "$out" ]; then printf '%s' "\${FAKE_BODY:-}" > "$out"; fi
echo "curl: (\${FAKE_CURL_EXIT:-0}) problem talking to $url" >&2
printf '%s' "\${FAKE_HTTP_CODE:-000}"
exit "\${FAKE_CURL_EXIT:-0}"
`;

interface RunResult {
  status: number | null;
  output: string;
  githubOutput: string;
}

let workDir: string;

const run = (env: Record<string, string>): RunResult => {
  const githubOutputFile = join(workDir, 'github-output');
  writeFileSync(githubOutputFile, '');
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${workDir}:${process.env.PATH ?? ''}`,
      NODE_ENV: 'test',
      UPSTASH_REDIS_REST_URL: FAKE_URL,
      UPSTASH_REDIS_REST_TOKEN: FAKE_TOKEN,
      GITHUB_OUTPUT: githubOutputFile,
      ...env,
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    githubOutput: readFileSync(githubOutputFile, 'utf8'),
  };
};

describe('redis-keepalive.sh', () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'redis-keepalive-spec-'));
    const stub = join(workDir, 'curl');
    writeFileSync(stub, CURL_STUB);
    chmodSync(stub, 0o755);
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('passes on PONG and records no failure reason', () => {
    const { status, output, githubOutput } = run({
      FAKE_HTTP_CODE: '200',
      FAKE_BODY: '{"result":"PONG"}',
    });

    expect(status).toBe(0);
    expect(output).toContain('PONG');
    expect(githubOutput).toBe('');
  });

  it('fails when either credential is missing', () => {
    const { status, output } = run({ UPSTASH_REDIS_REST_TOKEN: '' });

    expect(status).toBe(1);
    expect(output).toContain('must be set');
  });

  it('names a host that no longer resolves as a deleted or moved database', () => {
    const { status, output } = run({ FAKE_CURL_EXIT: '6' });

    expect(status).toBe(1);
    expect(output).toContain('does not resolve');
    expect(output).toContain('curl exit 6');
  });

  it('names a timeout', () => {
    const { status, output } = run({ FAKE_CURL_EXIT: '28' });

    expect(status).toBe(1);
    expect(output).toContain('timed out');
    expect(output).toContain('curl exit 28');
  });

  it('reports any other transport failure with its curl exit code', () => {
    const { status, output } = run({ FAKE_CURL_EXIT: '35' });

    expect(status).toBe(1);
    expect(output).toContain('curl exit 35');
  });

  it('names a rejected token on HTTP 401', () => {
    const { status, output } = run({
      FAKE_HTTP_CODE: '401',
      FAKE_BODY: '{"error":"WRONGPASS invalid or missing auth token"}',
    });

    expect(status).toBe(1);
    expect(output).toContain('HTTP 401');
    expect(output).toContain('rejected the token');
    expect(output).toContain('WRONGPASS invalid or missing auth token');
  });

  it('reports the status and the error Upstash returned on any other HTTP failure', () => {
    const { status, output } = run({
      FAKE_HTTP_CODE: '400',
      FAKE_BODY: '{"error":"ERR max requests limit exceeded. Limit: 500000"}',
    });

    expect(status).toBe(1);
    expect(output).toContain('HTTP 400');
    expect(output).toContain('ERR max requests limit exceeded. Limit: 500000');
  });

  it('reports the status when the error body is not JSON', () => {
    const { status, output } = run({ FAKE_HTTP_CODE: '503', FAKE_BODY: '<html>down</html>' });

    expect(status).toBe(1);
    expect(output).toContain('HTTP 503');
  });

  it('fails on a 200 whose result is not PONG', () => {
    const { status, output } = run({ FAKE_HTTP_CODE: '200', FAKE_BODY: '{"result":"nope"}' });

    expect(status).toBe(1);
    expect(output).toContain('Unexpected reply');
  });

  it('writes the one-line failure reason to GITHUB_OUTPUT for the alert step', () => {
    const { githubOutput } = run({
      FAKE_HTTP_CODE: '401',
      FAKE_BODY: '{"error":"WRONGPASS\\ninvalid"}',
    });

    expect(githubOutput).toMatch(/^reason=.*HTTP 401.*\n$/);
    expect(githubOutput.trimEnd().split('\n')).toHaveLength(1);
  });

  it('never prints the endpoint or the token, even when the reply echoes them', () => {
    const { output, githubOutput } = run({
      FAKE_HTTP_CODE: '400',
      FAKE_BODY: JSON.stringify({ error: `bad request to ${FAKE_HOST} with ${FAKE_TOKEN}` }),
    });
    const transport = run({ FAKE_CURL_EXIT: '6' });

    expect(`${output}${githubOutput}${transport.output}${transport.githubOutput}`).not.toContain(
      FAKE_HOST
    );
    expect(`${output}${githubOutput}`).not.toContain(FAKE_TOKEN);
  });
});
