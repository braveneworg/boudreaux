/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/**
 * The gate itself needs a Docker daemon, so these specs run the script against
 * stub `docker` and `openssl` binaries placed first on PATH. The stubs record
 * every invocation and fail on demand, which is enough to prove the harness
 * wires `nginx -t` the only way it can pass outside the compose network: a
 * `website` host alias plus a throwaway certificate pair mounted where
 * nginx.conf expects the real one.
 */

const SCRIPT = join(__dirname, 'nginx-config-test.sh');
const REPO_ROOT = join(__dirname, '..', '..');
const CI_WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');

interface StubOptions {
  buildStatus?: number;
  runStatus?: number;
  runOutput?: string;
}

interface RunResult {
  /** Every `docker …` / `openssl …` command line the script issued, in order. */
  invocations: string[];
  output: string;
  status: number;
}

/** A throwaway repo tree: relative path -> file contents. */
type Tree = Record<string, string>;

const NGINX_TREE: Tree = {
  'nginx/Dockerfile': 'FROM nginx:alpine\nCOPY ./nginx/nginx.conf /etc/nginx/conf.d/default.conf\n',
  'nginx/nginx.conf': 'server { listen 80; }\n',
};

const DOCKER_STUB = `#!/bin/sh
printf 'docker %s\\n' "$*" >> "$STUB_LOG"
case "$1" in
  build) exit "\${STUB_DOCKER_BUILD_STATUS:-0}" ;;
  run)
    if [ -n "\${STUB_DOCKER_RUN_OUTPUT:-}" ]; then echo "$STUB_DOCKER_RUN_OUTPUT" >&2; fi
    exit "\${STUB_DOCKER_RUN_STATUS:-0}"
    ;;
  *) exit 0 ;;
esac
`;

/** Writes empty files wherever the real openssl would write the cert and key. */
const OPENSSL_STUB = `#!/bin/sh
printf 'openssl %s\\n' "$*" >> "$STUB_LOG"
while [ $# -gt 0 ]; do
  case "$1" in
    -out|-keyout) : > "$2"; shift ;;
  esac
  shift
done
exit 0
`;

const writeTree = (root: string, tree: Tree): void => {
  for (const [relativePath, contents] of Object.entries(tree)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
};

const writeExecutable = (path: string, contents: string): void => {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
};

const runGate = (tree: Tree, options: StubOptions = {}): RunResult => {
  const root = mkdtempSync(join(tmpdir(), 'nginx-config-test-'));
  const bin = join(root, '.stub-bin');
  const log = join(root, '.stub-log');
  const repo = join(root, 'repo');

  try {
    mkdirSync(bin);
    mkdirSync(repo);
    writeExecutable(join(bin, 'docker'), DOCKER_STUB);
    writeExecutable(join(bin, 'openssl'), OPENSSL_STUB);
    writeFileSync(log, '');
    writeTree(repo, tree);

    const result = spawnSync('bash', [SCRIPT, repo], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NGINX_TEST_RETRY_DELAY: '0',
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        STUB_DOCKER_BUILD_STATUS: String(options.buildStatus ?? 0),
        STUB_DOCKER_RUN_OUTPUT: options.runOutput ?? '',
        STUB_DOCKER_RUN_STATUS: String(options.runStatus ?? 0),
        STUB_LOG: log,
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

const dockerRunLine = ({ invocations }: RunResult): string | undefined =>
  invocations.find((line) => line.startsWith('docker run '));

describe('nginx-config-test.sh', () => {
  it('passes when nginx -t accepts the config', () => {
    const result = runGate(NGINX_TREE);

    expect(result.output).toContain('✅');
    expect(result.status).toBe(0);
  });

  it('builds the production nginx image with the repo root as build context', () => {
    const { invocations } = runGate(NGINX_TREE);
    const build = invocations.find((line) => line.startsWith('docker build '));

    expect(build).toMatch(/ -f \S+\/nginx\/Dockerfile /);
    expect(build).toMatch(/ \S+\/repo$/);
  });

  it('generates a throwaway self-signed certificate pair before running', () => {
    const { invocations } = runGate(NGINX_TREE);
    const [first] = invocations;

    expect(first).toMatch(/^openssl req .*-x509 /);
    expect(first).toMatch(/ -nodes /);
    expect(first).toMatch(/ -keyout \S+ /);
    expect(first).toMatch(/ -out \S+/);
  });

  it('runs nginx -t with the website host aliased to loopback', () => {
    expect(dockerRunLine(runGate(NGINX_TREE))).toMatch(/ --add-host website:127\.0\.0\.1 /);
  });

  it('mounts the certificate pair read-only where nginx.conf expects the real one', () => {
    const line = dockerRunLine(runGate(NGINX_TREE));

    expect(line).toMatch(/ -v \S+:\/run\/secrets\/ssl_cert:ro /);
    expect(line).toMatch(/ -v \S+:\/run\/secrets\/ssl_key:ro /);
  });

  it('invokes nginx -t as the container command and discards the container', () => {
    const line = dockerRunLine(runGate(NGINX_TREE));

    expect(line).toMatch(/^docker run --rm /);
    expect(line).toMatch(/ nginx -t$/);
  });

  it('fails when nginx -t rejects the config and surfaces its output', () => {
    const result = runGate(NGINX_TREE, {
      runOutput: 'nginx: [emerg] unknown directive "bogus" in /etc/nginx/conf.d/default.conf:1',
      runStatus: 1,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('unknown directive "bogus"');
    expect(result.output).toContain('❌');
  });

  it('fails when the image cannot be built and never runs nginx -t', () => {
    const result = runGate(NGINX_TREE, { buildStatus: 1 });

    expect(result.status).toBe(1);
    expect(result.output).toContain('❌');
    expect(dockerRunLine(result)).toBeUndefined();
  });

  it('retries the image build against transient registry failures', () => {
    const { invocations } = runGate(NGINX_TREE, { buildStatus: 1 });

    expect(invocations.filter((line) => line.startsWith('docker build ')).length).toBe(3);
  });

  it('fails fast when the repo root has no nginx/Dockerfile', () => {
    const result = runGate({ 'nginx/nginx.conf': NGINX_TREE['nginx/nginx.conf'] });

    expect(result.status).toBe(1);
    expect(result.output).toContain('nginx/Dockerfile');
    expect(result.invocations).toEqual([]);
  });

  it('fails fast when the repo root has no nginx/nginx.conf', () => {
    const result = runGate({ 'nginx/Dockerfile': NGINX_TREE['nginx/Dockerfile'] });

    expect(result.status).toBe(1);
    expect(result.output).toContain('nginx/nginx.conf');
    expect(result.invocations).toEqual([]);
  });
});

describe('ci.yml wiring', () => {
  it('runs the gate on every push and pull request', () => {
    const workflow = readFileSync(CI_WORKFLOW, 'utf8');

    expect(workflow).toMatch(/run: bash scripts\/ci\/nginx-config-test\.sh/);
  });
});
