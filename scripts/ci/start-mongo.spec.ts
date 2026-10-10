/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * The script needs a Docker daemon, so these specs run it against a stub
 * `docker` placed first on PATH. The stub records every invocation and
 * answers each subcommand from the environment: how many pulls fail, whether
 * mongod answers a ping, whether the container is still running, what its
 * logs hold. That is enough to prove the order of a clean start and what the
 * script prints when a start fails.
 */

const SCRIPT = join(__dirname, 'start-mongo.sh');
const REPO_ROOT = join(__dirname, '..', '..');
const START_MONGO_ACTION = join(REPO_ROOT, '.github', 'actions', 'start-mongo', 'action.yml');

interface StubOptions {
  /** How many `docker pull` calls fail before one succeeds. */
  pullFailures?: number;
  runStatus?: number;
  /** Exit status of the readiness ping (`docker exec … ping`). */
  pingStatus?: number;
  initiateStatus?: number;
  /** What `rs.isMaster().ismaster` prints. */
  primary?: string;
}

const DEFAULT_STUB: Required<StubOptions> = {
  initiateStatus: 0,
  pingStatus: 0,
  primary: 'true',
  pullFailures: 0,
  runStatus: 0,
};

/** The stub's environment for one run: the defaults, then what the test overrides. */
const stubEnv = (options: StubOptions): Record<string, string> => {
  const stub = { ...DEFAULT_STUB, ...options };
  return {
    STUB_INITIATE_STATUS: String(stub.initiateStatus),
    STUB_PING_STATUS: String(stub.pingStatus),
    STUB_PRIMARY: stub.primary,
    STUB_PULL_FAILURES: String(stub.pullFailures),
    STUB_RUN_STATUS: String(stub.runStatus),
  };
};

interface RunResult {
  /** Every `docker …` command line the script issued, in order. */
  invocations: string[];
  output: string;
  status: number;
}

/**
 * Logs each call on one line (the `rs.initiate` script spans several), then
 * answers by subcommand.
 */
const DOCKER_STUB = `#!/bin/sh
printf 'docker %s\\n' "$(printf '%s' "$*" | tr '\\n' ' ')" >> "$STUB_LOG"
case "$1" in
  pull)
    pulls=$(cat "$STUB_PULLS" 2>/dev/null || echo 0)
    pulls=$((pulls + 1))
    echo "$pulls" > "$STUB_PULLS"
    if [ "$pulls" -le "\${STUB_PULL_FAILURES:-0}" ]; then exit 1; fi
    exit 0
    ;;
  run) exit "\${STUB_RUN_STATUS:-0}" ;;
  exec)
    case "$*" in
      *ping*) exit "\${STUB_PING_STATUS:-0}" ;;
      *rs.initiate*) exit "\${STUB_INITIATE_STATUS:-0}" ;;
      *isMaster*) echo "\${STUB_PRIMARY:-true}"; exit 0 ;;
    esac
    exit 0
    ;;
  *) exit 0 ;;
esac
`;

const runScript = (options: StubOptions = {}): RunResult => {
  const root = mkdtempSync(join(tmpdir(), 'start-mongo-'));
  const bin = join(root, '.stub-bin');
  const log = join(root, '.stub-log');

  try {
    mkdirSync(bin);
    const docker = join(bin, 'docker');
    writeFileSync(docker, DOCKER_STUB);
    chmodSync(docker, 0o755);
    writeFileSync(log, '');

    const result = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MONGO_START_POLL_DELAY: '0',
        MONGO_START_PULL_RETRY_DELAY: '0',
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        ...stubEnv(options),
        STUB_LOG: log,
        STUB_PULLS: join(root, '.stub-pulls'),
      },
    });

    return {
      invocations: readFileSync(log, 'utf8').split('\n').filter(Boolean),
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
      status: result.status ?? -1,
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
};

/** The docker subcommand of each invocation, in order. */
const subcommands = ({ invocations }: RunResult): string[] =>
  invocations.map((line) => line.split(' ')[1] ?? '');

const linesOf = ({ invocations }: RunResult, prefix: string): string[] =>
  invocations.filter((line) => line.startsWith(prefix));

describe('start-mongo.sh', () => {
  it('pulls, runs, waits for mongod, initiates the set and waits for a primary', () => {
    const result = runScript();

    expect(subcommands(result)).toEqual(['pull', 'run', 'exec', 'exec', 'exec']);
    expect(result.output).toContain('Replica set primary elected');
    expect(result.status).toBe(0);
  });

  it('runs mongod as the rs0 replica set on port 27018 in the mongo-e2e container', () => {
    const [run] = linesOf(runScript(), 'docker run ');

    expect(run).toMatch(/^docker run -d --name mongo-e2e /);
    expect(run).toMatch(/ -p 27018:27018 /);
    expect(run).toMatch(/ mongo:7 mongod --replSet rs0 --bind_ip_all --port 27018$/);
  });

  it('initiates rs0 with the member the E2E database URL names', () => {
    const [, initiate] = linesOf(runScript(), 'docker exec ');

    expect(initiate).toContain(
      "rs.initiate({_id:'rs0', members:[{_id:0, host:'localhost:27018'}]})"
    );
  });

  it('retries the image pull against transient registry failures', () => {
    const result = runScript({ pullFailures: 2 });

    expect(linesOf(result, 'docker pull ')).toHaveLength(3);
    expect(result.status).toBe(0);
  });

  it('gives up after five failed pulls and never starts a container', () => {
    const result = runScript({ pullFailures: 5 });

    expect(linesOf(result, 'docker pull ')).toHaveLength(5);
    expect(linesOf(result, 'docker run ')).toEqual([]);
    expect(result.status).toBe(1);
  });
});

describe('start-mongo action wiring', () => {
  it('runs the script', () => {
    const action = readFileSync(START_MONGO_ACTION, 'utf8');

    expect(action).toMatch(/run: bash scripts\/ci\/start-mongo\.sh/);
  });
});
