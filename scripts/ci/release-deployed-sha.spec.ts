/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/**
 * A version's tag sits on its release commit, which can be newer than the
 * commit that was actually deployed (ADR-0012). The deployed commit is the
 * `Deployed-Sha` trailer on that release commit. The rollback checks it out
 * for the host-side files, so this lookup must find the right commit from
 * the version alone, without relying on git tags being fetched.
 */

const SCRIPT = join(__dirname, 'release-deployed-sha.sh');

const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
const HUMAN_NAME = 'Some Developer';
const HUMAN_EMAIL = 'dev@example.com';

interface LookupResult {
  sha: string;
  status: number;
  stderr: string;
}

interface CommitOptions {
  author?: 'bot' | 'human';
  files?: Record<string, string>;
  message: string[];
}

class TempRepo {
  readonly root: string;

  constructor() {
    this.root = mkdtempSync(join(tmpdir(), 'release-deployed-sha-'));
    this.git(['init', '--quiet', '--initial-branch=main']);
  }

  git(args: string[], author: 'bot' | 'human' = 'human'): string {
    const [name, email] = author === 'bot' ? [BOT_NAME, BOT_EMAIL] : [HUMAN_NAME, HUMAN_EMAIL];
    const result = spawnSync(
      'git',
      [
        '-c',
        `user.name=${name}`,
        '-c',
        `user.email=${email}`,
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: this.root, encoding: 'utf8' }
    );
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  commit({ author = 'human', files = {}, message }: CommitOptions): string {
    for (const [relativePath, contents] of Object.entries(files)) {
      const target = join(this.root, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    this.git(['add', '--all']);
    this.git(
      ['commit', '--quiet', '--allow-empty', ...message.flatMap((part) => ['-m', part])],
      author
    );
    return this.git(['rev-parse', 'HEAD']);
  }

  /** A release commit exactly as deploy.yml's version-bump job writes it. */
  release(version: string, deployedSha?: string): string {
    const subject = `chore(release): v${version} [skip ci]`;
    return this.commit({
      author: 'bot',
      files: { 'CHANGELOG.md': `## [${version}]\n` },
      message: deployedSha ? [subject, `Deployed-Sha: ${deployedSha}`] : [subject],
    });
  }

  lookup(versionTag: string, mainRef = 'main'): LookupResult {
    const result = spawnSync('bash', [SCRIPT, versionTag, mainRef], {
      cwd: this.root,
      encoding: 'utf8',
    });
    return {
      sha: (result.stdout ?? '').trim(),
      status: result.status ?? -1,
      stderr: result.stderr ?? '',
    };
  }

  dispose(): void {
    rmSync(this.root, { force: true, recursive: true });
  }
}

describe('release-deployed-sha.sh', () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = new TempRepo();
  });

  afterEach(() => {
    repo.dispose();
  });

  it('prints the Deployed-Sha trailer of the version’s release commit', () => {
    const deployed = repo.commit({ files: { 'a.txt': 'a\n' }, message: ['feat: a'] });
    repo.release('4.438.0', deployed);

    expect(repo.lookup('v4.438.0')).toMatchObject({ sha: deployed, status: 0 });
  });

  it('finds the version by subject even when the release commit is not the newest', () => {
    const first = repo.commit({ files: { 'a.txt': 'a\n' }, message: ['feat: a'] });
    repo.release('4.438.0', first);
    const second = repo.commit({ files: { 'b.txt': 'b\n' }, message: ['feat: b'] });
    repo.release('4.439.0', second);

    expect(repo.lookup('v4.438.0').sha).toBe(first);
    expect(repo.lookup('v4.439.0').sha).toBe(second);
  });

  it('does not confuse v4.43.0 with v4.430.0', () => {
    const narrow = repo.commit({ files: { 'a.txt': 'a\n' }, message: ['feat: a'] });
    repo.release('4.43.0', narrow);
    const wide = repo.commit({ files: { 'b.txt': 'b\n' }, message: ['feat: b'] });
    repo.release('4.430.0', wide);

    expect(repo.lookup('v4.43.0').sha).toBe(narrow);
  });

  it('ignores a human-authored commit with a release subject', () => {
    const deployed = repo.commit({ files: { 'a.txt': 'a\n' }, message: ['feat: a'] });
    repo.commit({
      author: 'human',
      message: [
        'chore(release): v4.438.0 [skip ci]',
        'Deployed-Sha: 0000000000000000000000000000000000000000',
      ],
    });
    repo.release('4.438.0', deployed);

    expect(repo.lookup('v4.438.0').sha).toBe(deployed);
  });

  it('fails when the version has no release commit', () => {
    repo.commit({ files: { 'a.txt': 'a\n' }, message: ['feat: a'] });

    const result = repo.lookup('v9.9.9');

    expect(result.status).not.toBe(0);
    expect(result.sha).toBe('');
    expect(result.stderr).toMatch(/v9\.9\.9/);
  });

  it('fails when the release commit carries no Deployed-Sha trailer', () => {
    repo.commit({ files: { 'a.txt': 'a\n' }, message: ['feat: a'] });
    repo.release('4.438.0');

    const result = repo.lookup('v4.438.0');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Deployed-Sha/);
  });

  it('fails when the trailer names a commit the clone does not have', () => {
    repo.commit({ files: { 'a.txt': 'a\n' }, message: ['feat: a'] });
    repo.release('4.438.0', 'f'.repeat(40));

    const result = repo.lookup('v4.438.0');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not a commit/);
  });

  it('rejects a version that is not a vX.Y.Z tag', () => {
    const result = repo.lookup('latest');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/vX\.Y\.Z/);
  });
});
