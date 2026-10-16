/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * The resolver turns "roll back" into two image digests. It reads the GHCR
 * version listings of the website and nginx packages (the GitHub packages
 * API shape, one JSON file each), finds the live version as the `v*` tag on
 * the digest that carries `latest`, and picks the target: the requested
 * version, or the version just below the live one. These specs feed it
 * fixture listings so every rule runs without a registry.
 */

const SCRIPT = join(__dirname, 'rollback-resolve.sh');

interface PackageVersion {
  name: string;
  metadata: { container: { tags: string[] } };
}

interface ResolveResult {
  outputs: Record<string, string>;
  status: number;
  stderr: string;
}

const version = (digest: string, tags: string[]): PackageVersion => ({
  name: `sha256:${digest.padEnd(64, '0')}`,
  metadata: { container: { tags } },
});

const digestOf = (entry: PackageVersion): string => entry.name;

const WEBSITE: PackageVersion[] = [
  version('aaa439', ['latest', 'v4.439.0', 'sha-439']),
  version('aaa438', ['v4.438.0', 'sha-438']),
  version('aaa437', ['v4.437.0', 'sha-437']),
  version('aaa4310', ['v4.4310.0']),
  version('aaa436', ['sha-436']),
  version('cache00', ['buildcache']),
];

const NGINX: PackageVersion[] = [
  version('bbb439', ['latest', 'v4.439.0', 'v4.438.0', 'sha-439', 'sha-438']),
  version('bbb437', ['v4.437.0', 'sha-437']),
  version('bbb4310', ['v4.4310.0']),
];

class Fixture {
  readonly root: string;

  constructor() {
    this.root = mkdtempSync(join(tmpdir(), 'rollback-resolve-'));
  }

  run(requested: string, website: PackageVersion[], nginx: PackageVersion[]): ResolveResult {
    const websitePath = join(this.root, 'website.json');
    const nginxPath = join(this.root, 'nginx.json');
    writeFileSync(websitePath, JSON.stringify(website));
    writeFileSync(nginxPath, JSON.stringify(nginx));

    const result = spawnSync('bash', [SCRIPT, requested, websitePath, nginxPath], {
      cwd: this.root,
      encoding: 'utf8',
    });
    const outputs: Record<string, string> = {};
    for (const line of (result.stdout ?? '').split('\n')) {
      const separator = line.indexOf('=');
      if (separator > 0) {
        outputs[line.slice(0, separator)] = line.slice(separator + 1);
      }
    }
    return { outputs, status: result.status ?? -1, stderr: result.stderr ?? '' };
  }

  dispose(): void {
    rmSync(this.root, { force: true, recursive: true });
  }
}

describe('rollback-resolve.sh', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = new Fixture();
  });

  afterEach(() => {
    fixture.dispose();
  });

  it('reads the live version off the digest that carries latest', () => {
    const result = fixture.run('', WEBSITE, NGINX);

    expect(result.status).toBe(0);
    expect(result.outputs.live).toBe('v4.439.0');
  });

  it('defaults to the version just below the live one, in version order not text order', () => {
    // v4.4310.0 sorts above v4.439.0 as a version even though it sorts below it
    // as text; v4.438.0 is the one just below live.
    const result = fixture.run('', WEBSITE, NGINX);

    expect(result.outputs.target).toBe('v4.438.0');
    expect(result.outputs.website_digest).toBe(digestOf(WEBSITE[1]));
    expect(result.outputs.nginx_digest).toBe(digestOf(NGINX[0]));
  });

  it('steps back one more version when the live one is already a rollback target', () => {
    const website = [
      version('aaa439', ['v4.439.0']),
      version('aaa438', ['latest', 'v4.438.0']),
      version('aaa437', ['v4.437.0']),
    ];
    const nginx = [version('bbb', ['latest', 'v4.439.0', 'v4.438.0', 'v4.437.0'])];

    const result = fixture.run('', website, nginx);

    expect(result.outputs).toMatchObject({ live: 'v4.438.0', target: 'v4.437.0' });
  });

  it('deploys the requested version when one is given', () => {
    const result = fixture.run('v4.437.0', WEBSITE, NGINX);

    expect(result.status).toBe(0);
    expect(result.outputs).toMatchObject({
      live: 'v4.439.0',
      nginx_digest: digestOf(NGINX[1]),
      target: 'v4.437.0',
      website_digest: digestOf(WEBSITE[2]),
    });
  });

  it('falls back to the newest version when latest carries no version tag (a forward deploy was mid-flight)', () => {
    const website = [
      version('aaa440', ['latest', 'sha-440']),
      version('aaa439', ['v4.439.0']),
      version('aaa438', ['v4.438.0']),
    ];
    const nginx = [version('bbb', ['latest', 'v4.439.0', 'v4.438.0'])];

    const result = fixture.run('', website, nginx);

    expect(result.status).toBe(0);
    expect(result.outputs).toMatchObject({ live: '', target: 'v4.439.0' });
    expect(result.stderr).toMatch(/no version tag/i);
  });

  it('fails when the requested version is not in GHCR', () => {
    const result = fixture.run('v4.100.0', WEBSITE, NGINX);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/v4\.100\.0/);
    expect(result.outputs.target).toBeUndefined();
  });

  it('fails when the requested version has a website image but no nginx image', () => {
    const nginx = NGINX.filter((entry) => !entry.metadata.container.tags.includes('v4.437.0'));

    const result = fixture.run('v4.437.0', WEBSITE, nginx);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/nginx/);
  });

  it('fails when nothing is older than the live version', () => {
    const website = [version('aaa', ['latest', 'v4.439.0'])];
    const nginx = [version('bbb', ['latest', 'v4.439.0'])];

    const result = fixture.run('', website, nginx);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/older than/i);
  });

  it('rejects a requested version that is not a vX.Y.Z tag', () => {
    const result = fixture.run('latest', WEBSITE, NGINX);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/vX\.Y\.Z/);
  });

  it('prints a reason for the choice it made', () => {
    const result = fixture.run('', WEBSITE, NGINX);

    expect(result.outputs.reason).toMatch(/v4\.439\.0/);
    expect(result.outputs.reason).toMatch(/v4\.438\.0/);
  });
});
