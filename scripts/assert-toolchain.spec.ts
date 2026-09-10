/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, 'assert-toolchain.sh');

interface StubVersions {
  /** Version `node -v` reports, without the leading `v`. Omit to leave node off PATH. */
  node?: string;
  /** Version `pnpm --version` reports. Omit to leave pnpm off PATH. */
  pnpm?: string;
}

interface RunResult {
  status: number;
  output: string;
}

/**
 * Runs assert-toolchain.sh against a throwaway mise.toml with `node` and `pnpm`
 * stubbed on PATH, so the real toolchain never influences the result.
 */
const runAssert = (miseToml: string, stubs: StubVersions): RunResult => {
  const dir = mkdtempSync(join(tmpdir(), 'assert-toolchain-'));

  try {
    const configPath = join(dir, 'mise.toml');
    writeFileSync(configPath, miseToml);

    const binDir = join(dir, 'bin');
    spawnSync('mkdir', ['-p', binDir]);

    if (stubs.node !== undefined) {
      const nodeStub = join(binDir, 'node');
      writeFileSync(nodeStub, `#!/bin/sh\necho "v${stubs.node}"\n`);
      chmodSync(nodeStub, 0o755);
    }

    if (stubs.pnpm !== undefined) {
      const pnpmStub = join(binDir, 'pnpm');
      writeFileSync(pnpmStub, `#!/bin/sh\necho "${stubs.pnpm}"\n`);
      chmodSync(pnpmStub, 0o755);
    }

    const result = spawnSync('sh', [SCRIPT, configPath], {
      encoding: 'utf8',
      // PATH is replaced outright — only the stubs plus coreutils — so the
      // developer's own node/pnpm can never influence the result.
      env: { ...process.env, PATH: `${binDir}:/usr/bin:/bin` },
    });

    return {
      status: result.status ?? -1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
};

const BOTH_PINNED = '[tools]\nnode = "24.18.0"\npnpm = "11.15.1"\n';

describe('assert-toolchain.sh', () => {
  it('passes when node and pnpm both match mise.toml', () => {
    const { status } = runAssert(BOTH_PINNED, {
      node: '24.18.0',
      pnpm: '11.15.1',
    });

    expect(status).toBe(0);
  });

  it('fails when the active node does not match mise.toml', () => {
    const { output, status } = runAssert(BOTH_PINNED, {
      node: '22.14.0',
      pnpm: '11.15.1',
    });

    expect(status).toBe(1);
    expect(output).toContain('22.14.0');
    expect(output).toContain('24.18.0');
    expect(output).toContain('mise install');
  });

  it('fails when the active pnpm does not match mise.toml', () => {
    const { output, status } = runAssert(BOTH_PINNED, {
      node: '24.18.0',
      pnpm: '10.0.0',
    });

    expect(status).toBe(1);
    expect(output).toContain('10.0.0');
    expect(output).toContain('11.15.1');
  });

  it('fails with an actionable message when node is not on PATH at all', () => {
    const { output, status } = runAssert(BOTH_PINNED, { pnpm: '11.15.1' });

    expect(status).toBe(1);
    expect(output).toContain('mise install');
  });

  it('fails when pnpm is not on PATH at all', () => {
    const { output, status } = runAssert(BOTH_PINNED, { node: '24.18.0' });

    expect(status).toBe(1);
    expect(output).toContain('pnpm');
  });

  it('skips the pnpm check when mise.toml pins only node', () => {
    const { status } = runAssert('[tools]\nnode = "24.18.0"\n', {
      node: '24.18.0',
    });

    expect(status).toBe(0);
  });

  it('fails when the config file is missing', () => {
    const result = spawnSync('sh', [SCRIPT, '/nonexistent/mise.toml'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('mise.toml');
  });

  it('ignores a commented-out pin rather than matching it', () => {
    const { output, status } = runAssert('[tools]\n# node = "18.0.0"\nnode = "24.18.0"\n', {
      node: '24.18.0',
    });

    expect(output).not.toContain('18.0.0');
    expect(status).toBe(0);
  });
});
