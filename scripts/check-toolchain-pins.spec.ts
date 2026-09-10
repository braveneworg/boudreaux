/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const SCRIPT = join(__dirname, 'check-toolchain-pins.sh');

/** A throwaway repo tree: relative path -> file contents. */
type Tree = Record<string, string>;

interface RunResult {
  status: number;
  output: string;
}

const MISE_TOML = '[tools]\nnode = "24.21.0"\npnpm = "12.4.0"\n';
const DOCKERFILE = 'ARG NODE=node:24.21.0-alpine\nFROM ${NODE} AS dependencies\n';
const ROOT_PKG = JSON.stringify({ engines: { node: '^24.21.0' } }, null, 2);
const LAMBDA_PKG = JSON.stringify({ engines: { node: '^24.21.0' } }, null, 2);

/** A tree where every declared pin already agrees with mise.toml. */
const consistentTree = (): Tree => ({
  Dockerfile: DOCKERFILE,
  'bio-generator/package.json': LAMBDA_PKG,
  'mise.toml': MISE_TOML,
  'package.json': ROOT_PKG,
});

const runCheck = (tree: Tree): RunResult => {
  const root = mkdtempSync(join(tmpdir(), 'toolchain-pins-'));

  try {
    for (const [relativePath, contents] of Object.entries(tree)) {
      const target = join(root, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }

    const result = spawnSync('sh', [SCRIPT, root], { encoding: 'utf8' });

    return {
      status: result.status ?? -1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
};

describe('check-toolchain-pins.sh', () => {
  it('passes when every declared pin agrees with mise.toml', () => {
    expect(runCheck(consistentTree()).status).toBe(0);
  });

  it('fails when the Dockerfile base image drifts from mise.toml', () => {
    const { output, status } = runCheck({
      ...consistentTree(),
      Dockerfile: 'ARG NODE=node:24.18.0-alpine\n',
    });

    expect(status).toBe(1);
    expect(output).toContain('Dockerfile');
    expect(output).toContain('24.18.0');
  });

  it('fails when a package.json engines.node drifts from mise.toml', () => {
    const { output, status } = runCheck({
      ...consistentTree(),
      'bio-generator/package.json': JSON.stringify({
        engines: { node: '^24.18.0' },
      }),
    });

    expect(status).toBe(1);
    expect(output).toContain('bio-generator/package.json');
  });

  it('fails when a package.json reintroduces packageManager', () => {
    const { output, status } = runCheck({
      ...consistentTree(),
      'package.json': JSON.stringify({
        engines: { node: '^24.21.0' },
        packageManager: 'pnpm@12.4.0',
      }),
    });

    expect(status).toBe(1);
    expect(output).toContain('packageManager');
  });

  it('fails when a .nvmrc reappears', () => {
    const { output, status } = runCheck({
      ...consistentTree(),
      '.nvmrc': 'v24.21.0\n',
    });

    expect(status).toBe(1);
    expect(output).toContain('.nvmrc');
  });

  it('fails when the Dockerfile reintroduces corepack', () => {
    const { output, status } = runCheck({
      ...consistentTree(),
      Dockerfile: `${DOCKERFILE}RUN corepack enable\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain('corepack');
  });

  it('fails when mise.toml pins no node at all', () => {
    const { output, status } = runCheck({
      ...consistentTree(),
      'mise.toml': '[tools]\npnpm = "12.4.0"\n',
    });

    expect(status).toBe(1);
    expect(output).toContain('mise.toml');
  });

  it('reports every drifted file, not just the first', () => {
    const { output } = runCheck({
      ...consistentTree(),
      Dockerfile: 'ARG NODE=node:24.18.0-alpine\n',
      'bio-generator/package.json': JSON.stringify({
        engines: { node: '^24.18.0' },
      }),
    });

    expect(output).toContain('Dockerfile');
    expect(output).toContain('bio-generator/package.json');
  });
});

describe('check-toolchain-pins.sh against this repo', () => {
  it('passes on the real working tree', () => {
    const result = spawnSync('sh', [SCRIPT, join(__dirname, '..')], {
      encoding: 'utf8',
    });

    expect(`${result.stdout}${result.stderr}`).not.toContain('❌');
    expect(result.status).toBe(0);
  });
});
