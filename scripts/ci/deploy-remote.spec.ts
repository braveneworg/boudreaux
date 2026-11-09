/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * deploy-remote.sh runs on the EC2 host over SSH (roll-host.yml's "Deploy via
 * SSH" step), and its exit status is the step's: non-zero fails the roll, so
 * deploy.yml's version-bump never tags or releases the images. These specs run
 * the real script against stubs placed first on PATH, in a throwaway HOME.
 *
 * The stubs model one host. `docker` keeps which image `website:latest` points
 * at, which containers `docker ps` lists, and which image the website container
 * runs; `compose down` empties the host and `compose up` starts what `latest`
 * points at. `curl` answers /api/health from that state. A crash-looping
 * website (the boot check refusing a missing value, under
 * `restart: unless-stopped`) is still listed by `docker ps` as restarting, so
 * it is modelled as "running but unhealthy". Every value is a fake.
 */

const SCRIPT = join(__dirname, 'deploy-remote.sh');

const WEBSITE_IMAGE = 'ghcr.io/test-owner/boudreaux/website';
const NGINX_IMAGE = 'ghcr.io/test-owner/boudreaux/nginx';
const NEW_WEBSITE = `${WEBSITE_IMAGE}@sha256:new-website`;
const NEW_NGINX = `${NGINX_IMAGE}@sha256:new-nginx`;
const PREV_WEBSITE = `${WEBSITE_IMAGE}@sha256:prev-website`;
const PREV_NGINX = `${NGINX_IMAGE}@sha256:prev-nginx`;
const ALL_CONTAINERS = [
  'nginx',
  'website',
  'loki',
  'alloy',
  'grafana',
  'prometheus',
  'node-exporter',
  'cadvisor',
];

interface World {
  /** What the host runs before the deploy; `null` is a first deploy. */
  previous?: { nginx: string; website: string } | null;
  /** Website images whose /api/health fails once started. */
  unhealthy?: string[];
  /** Website images `compose up` cannot start (it exits non-zero). */
  upFails?: string[];
  /** Website images after whose start `docker ps` lists no website container. */
  websiteNotRunning?: string[];
  /** Website images after whose start `docker ps` lists nothing. */
  nothingRuns?: string[];
  /** Image references `docker pull` fails for. */
  pullFails?: string[];
  /** The host is on the self-signed fallback certificate. */
  selfSigned?: boolean;
  /** rollback.yml's run (`ROLLBACK_RUN=true`). */
  rollbackRun?: boolean;
}

interface RunResult {
  status: number;
  output: string;
  /** Every `docker …` and `curl …` command line, in order. */
  calls: string[];
  /** The image the website container runs at the end, or '' when none. */
  serving: string;
  /** What `docker ps` lists at the end. */
  running: string[];
  /** `.deploy/digests.json` at the end, or null when it was never written. */
  digests: string | null;
}

const IN_LIST = `in_list() {
  [ -n "$1" ] || return 1
  case " $2 " in *" $1 "*) return 0 ;; esac
  return 1
}`;

const DOCKER_STUB = `#!/bin/sh
S="$FAKE_STATE"
printf 'docker %s\\n' "$*" >> "$S/calls.log"
${IN_LIST}
case "$1" in
  ps) cat "$S/running"; exit 0 ;;
  login) cat > /dev/null; exit 0 ;;
  inspect)
    for ref in "$@"; do :; done
    if [ "$ref" = "$WEBSITE_IMAGE" ] && [ -n "$FAKE_PREV_WEBSITE" ]; then echo "$FAKE_PREV_WEBSITE"; exit 0; fi
    if [ "$ref" = "$NGINX_IMAGE" ] && [ -n "$FAKE_PREV_NGINX" ]; then echo "$FAKE_PREV_NGINX"; exit 0; fi
    exit 1
    ;;
  pull)
    if in_list "$2" "$FAKE_PULL_FAILS"; then echo "Error response from daemon: fake pull failure" >&2; exit 1; fi
    exit 0
    ;;
  tag)
    if [ "$3" = "$WEBSITE_IMAGE:latest" ]; then echo "$2" > "$S/website-latest"; fi
    if [ "$3" = "$NGINX_IMAGE:latest" ]; then echo "$2" > "$S/nginx-latest"; fi
    exit 0
    ;;
  images) echo fake-image-id; exit 0 ;;
  exec) exit 1 ;;
  compose)
    case " $* " in
      *" down "*) : > "$S/running"; : > "$S/serving"; exit 0 ;;
      *" up "*)
        img=$(cat "$S/website-latest" 2>/dev/null)
        if in_list "$img" "$FAKE_UP_FAILS"; then
          echo "Error response from daemon: fake container start failure" >&2
          exit 1
        fi
        echo "$img" > "$S/serving"
        if in_list "$img" "$FAKE_NOTHING_RUNS"; then : > "$S/running"; exit 0; fi
        {
          echo nginx
          in_list "$img" "$FAKE_WEBSITE_NOT_RUNNING" || echo website
          printf '%s\\n' loki alloy grafana prometheus node-exporter cadvisor
        } > "$S/running"
        exit 0
        ;;
    esac
    exit 0
    ;;
  *) exit 0 ;;
esac
`;

const CURL_STUB = `#!/bin/sh
S="$FAKE_STATE"
printf 'curl %s\\n' "$*" >> "$S/calls.log"
case "$*" in *"/api/health"*) ;; *) exit 0 ;; esac
if [ -n "$FAKE_SELF_SIGNED" ]; then
  case " $* " in
    *" -k "*) ;;
    *) echo "curl: (60) SSL certificate problem: self-signed certificate" >&2; exit 60 ;;
  esac
fi
if ! grep -qx website "$S/running"; then echo "curl: (22) The requested URL returned error: 502" >&2; exit 22; fi
img=$(cat "$S/serving")
case " $FAKE_UNHEALTHY " in
  *" $img "*) echo "curl: (22) The requested URL returned error: 503" >&2; exit 22 ;;
esac
echo '{"status":"healthy","database":"connected"}'
`;

/** No LE certificate under /etc/letsencrypt; every other sudo command succeeds. */
const SUDO_STUB = `#!/bin/sh
[ "$1" = "test" ] && exit 1
exit 0
`;

const SIMPLE_STUBS: Record<string, string> = {
  certbot: 'exit 0',
  df: "printf 'Filesystem 1G-blocks Used Available Use%% Mounted on\\n/dev/root 50G 10G 40G 20%% /\\n'",
  dig: 'exit 0',
  groups: 'echo "ubuntu docker"',
  openssl: 'exit 0',
  sleep: 'exit 0',
};

const writeExecutable = (path: string, content: string): void => {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
};

const readOr = (path: string, fallback: string): string =>
  existsSync(path) ? readFileSync(path, 'utf8') : fallback;

const lines = (text: string): string[] => text.split('\n').filter(Boolean);

interface Previous {
  nginx: string;
  website: string;
}

interface HostDirs {
  bin: string;
  deployDir: string;
  home: string;
  state: string;
}

const previousOf = (world: World): Previous | null =>
  world.previous === undefined ? { nginx: PREV_NGINX, website: PREV_WEBSITE } : world.previous;

const list = (refs: string[] | undefined): string => (refs ?? []).join(' ');

const writeStubs = (bin: string): void => {
  mkdirSync(bin);
  writeExecutable(join(bin, 'docker'), DOCKER_STUB);
  writeExecutable(join(bin, 'curl'), CURL_STUB);
  writeExecutable(join(bin, 'sudo'), SUDO_STUB);
  for (const [name, body] of Object.entries(SIMPLE_STUBS)) {
    writeExecutable(join(bin, name), `#!/bin/sh\n${body}\n`);
  }
};

/** The host before the deploy: the uploaded files, and what it runs now. */
const writeHost = (dirs: HostDirs, world: World, previous: Previous | null): void => {
  mkdirSync(dirs.state);
  mkdirSync(join(dirs.deployDir, 'certbot-webroot'), { recursive: true });
  writeFileSync(join(dirs.deployDir, 'certificate.pem'), 'fake certificate\n');
  writeFileSync(join(dirs.deployDir, 'private_key.pem'), 'fake key\n');
  writeFileSync(join(dirs.deployDir, '.env.deploy'), 'FAKE_SETTING=placeholder\n');
  if (world.selfSigned) {
    writeFileSync(join(dirs.deployDir, '.selfsigned'), '');
  }

  const website = previous ? `${previous.website}\n` : '';
  writeFileSync(join(dirs.state, 'calls.log'), '');
  writeFileSync(join(dirs.state, 'website-latest'), website);
  writeFileSync(join(dirs.state, 'serving'), website);
  writeFileSync(join(dirs.state, 'running'), previous ? `${ALL_CONTAINERS.join('\n')}\n` : '');
};

/** Only fakes: nothing from the parent environment reaches the script. */
const scriptEnv = (dirs: HostDirs, world: World, previous: Previous | null): NodeJS.ProcessEnv => ({
  FAKE_NOTHING_RUNS: list(world.nothingRuns),
  FAKE_PREV_NGINX: previous?.nginx ?? '',
  FAKE_PREV_WEBSITE: previous?.website ?? '',
  FAKE_PULL_FAILS: list(world.pullFails),
  FAKE_SELF_SIGNED: world.selfSigned ? '1' : '',
  FAKE_STATE: dirs.state,
  FAKE_UNHEALTHY: list(world.unhealthy),
  FAKE_UP_FAILS: list(world.upFails),
  FAKE_WEBSITE_NOT_RUNNING: list(world.websiteNotRunning),
  GHCR_TOKEN: 'fake-ghcr-token',
  GHCR_USERNAME: 'fake-user',
  HOME: dirs.home,
  LANG: 'C',
  NGINX_DIGEST: 'sha256:new-nginx',
  NGINX_IMAGE,
  NODE_ENV: 'test',
  PATH: `${dirs.bin}:/usr/bin:/bin`,
  ROLLBACK_RUN: world.rollbackRun ? 'true' : 'false',
  USER: 'ubuntu',
  WEBSITE_DIGEST: 'sha256:new-website',
  WEBSITE_IMAGE,
});

const readDigests = (deployDir: string): string | null => {
  const path = join(deployDir, '.deploy', 'digests.json');
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

const runDeploy = (world: World = {}): RunResult => {
  const previous = previousOf(world);
  const root = mkdtempSync(join(tmpdir(), 'deploy-remote-'));
  const home = join(root, 'home');
  const dirs: HostDirs = {
    bin: join(root, 'bin'),
    deployDir: join(home, 'boudreaux'),
    home,
    state: join(root, 'state'),
  };

  try {
    writeStubs(dirs.bin);
    writeHost(dirs, world, previous);
    const result = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: scriptEnv(dirs, world, previous),
    });

    return {
      calls: lines(readFileSync(join(dirs.state, 'calls.log'), 'utf8')),
      digests: readDigests(dirs.deployDir),
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
      running: lines(readOr(join(dirs.state, 'running'), '')),
      serving: readOr(join(dirs.state, 'serving'), '').trim(),
      status: result.status ?? -1,
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
};

const composeUps = (calls: string[]): string[] =>
  calls.filter((call) => /^docker compose .* up -d/.test(call));
const healthCurls = (calls: string[]): string[] =>
  calls.filter((call) => call.startsWith('curl ') && call.includes('/api/health'));
const ERROR_LINE = /^::error::/m;

describe('deploy-remote.sh — a forward deploy', () => {
  it('serves the new images and exits 0 when the health check passes', () => {
    const result = runDeploy();

    expect(result.status).toBe(0);
    expect(result.serving).toBe(NEW_WEBSITE);
    expect(result.running).toEqual(expect.arrayContaining(['website', 'nginx']));
    expect(result.output).toContain('✓ Both containers are running');
    expect(result.output).not.toMatch(ERROR_LINE);
    expect(result.calls).not.toContain(`docker pull ${PREV_WEBSITE}`);
    expect(composeUps(result.calls)).toHaveLength(1);
    expect(result.digests).toContain(`"current": "${NEW_WEBSITE}"`);
    expect(result.digests).toContain(`"current": "${NEW_NGINX}"`);
  });

  it('fails the run, naming why, after rolling back a website whose health check fails', () => {
    const result = runDeploy({ unhealthy: [NEW_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/^::error::.*health check.*rolled back/im);
    expect(result.serving).toBe(PREV_WEBSITE);
    expect(result.running).toEqual(expect.arrayContaining(['website', 'nginx']));
    expect(result.calls).toContain(`docker pull ${PREV_WEBSITE}`);
    expect(result.calls).toContain(`docker pull ${PREV_NGINX}`);
    expect(composeUps(result.calls)).toHaveLength(2);
  });

  it('leaves the digest audit naming the version that serves after a rollback', () => {
    const result = runDeploy({ unhealthy: [NEW_WEBSITE] });

    expect(result.digests ?? '').not.toContain(`"current": "${NEW_WEBSITE}"`);
  });

  it('rolls back, and fails the run, when compose cannot start the new containers', () => {
    const result = runDeploy({ upFails: [NEW_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(result.serving).toBe(PREV_WEBSITE);
    expect(result.running).toEqual(expect.arrayContaining(['website', 'nginx']));
    expect(result.output).toMatch(/^::error::.*start.*rolled back/im);
  });

  it('rolls back, and fails the run, when the website container is not running', () => {
    const result = runDeploy({ websiteNotRunning: [NEW_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(result.serving).toBe(PREV_WEBSITE);
    expect(result.running).toEqual(expect.arrayContaining(['website', 'nginx']));
    expect(result.output).toMatch(/^::error::.*1 of 2 containers.*rolled back/im);
  });

  it('rolls back, and fails the run, when no container is running at all', () => {
    const result = runDeploy({ nothingRuns: [NEW_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(result.serving).toBe(PREV_WEBSITE);
    expect(result.running).toEqual(expect.arrayContaining(['website', 'nginx']));
    expect(result.output).toMatch(/^::error::.*0 of 2 containers.*rolled back/im);
  });

  it('checks the rolled-back version with the self-signed TLS options too', () => {
    const result = runDeploy({ selfSigned: true, unhealthy: [NEW_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/^::error::.*rolled back/im);
    expect(result.output).not.toMatch(/manual intervention/i);
    expect(result.serving).toBe(PREV_WEBSITE);
    for (const call of healthCurls(result.calls)) {
      expect(call).toMatch(/ -k /);
    }
  });

  it('asks for manual intervention when the rolled-back version fails its health check too', () => {
    const result = runDeploy({ unhealthy: [NEW_WEBSITE, PREV_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/^::error::.*manual intervention/im);
    expect(composeUps(result.calls)).toHaveLength(2);
  });

  it('fails without a second start when there is no previous version to roll back to', () => {
    const result = runDeploy({ previous: null, unhealthy: [NEW_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(composeUps(result.calls)).toHaveLength(1);
    expect(result.output).toMatch(/^::error::.*no previous version/im);
  });

  it('stops before touching the containers when the new image cannot be pulled', () => {
    const result = runDeploy({ pullFails: [NEW_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(result.calls.some((call) => / down /.test(call))).toBe(false);
    expect(composeUps(result.calls)).toHaveLength(0);
    expect(result.serving).toBe(PREV_WEBSITE);
    expect(result.running).toEqual(ALL_CONTAINERS);
  });
});

describe('deploy-remote.sh — a rollback run (ROLLBACK_RUN=true)', () => {
  // WEBSITE_DIGEST is the target; the digests found on the host are the live
  // version being escaped, so a failure never re-pulls them (ADR-0021).

  it('serves the target and exits 0 when the health check passes', () => {
    const result = runDeploy({ rollbackRun: true });

    expect(result.status).toBe(0);
    expect(result.serving).toBe(NEW_WEBSITE);
    expect(result.output).not.toMatch(ERROR_LINE);
    expect(composeUps(result.calls)).toHaveLength(1);
  });

  it('exits non-zero with the containers as they are when the health check fails', () => {
    const result = runDeploy({ rollbackRun: true, unhealthy: [NEW_WEBSITE] });

    expect(result.status).toBe(1);
    expect(result.serving).toBe(NEW_WEBSITE);
    expect(result.calls).not.toContain(`docker pull ${PREV_WEBSITE}`);
    expect(composeUps(result.calls)).toHaveLength(1);
  });

  it('exits non-zero without re-pulling the live version when compose cannot start', () => {
    const result = runDeploy({ rollbackRun: true, upFails: [NEW_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(result.calls).not.toContain(`docker pull ${PREV_WEBSITE}`);
    expect(composeUps(result.calls)).toHaveLength(1);
  });

  it('exits non-zero without re-pulling the live version when a container is missing', () => {
    const result = runDeploy({ rollbackRun: true, websiteNotRunning: [NEW_WEBSITE] });

    expect(result.status).not.toBe(0);
    expect(result.calls).not.toContain(`docker pull ${PREV_WEBSITE}`);
    expect(composeUps(result.calls)).toHaveLength(1);
  });
});
