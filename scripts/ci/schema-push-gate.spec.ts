/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/**
 * The gate decides whether a deploy must run `prisma db push`. It reads the
 * last deployed commit from the `Deployed-Sha:` trailer on the newest
 * release commit (written by deploy.yml's version-bump job) and compares
 * `prisma/schema.prisma` there against the commit being deployed. These
 * specs build throwaway git repos so every case runs against real history.
 */

const SCRIPT = join(__dirname, 'schema-push-gate.sh');

const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
const HUMAN_NAME = 'Some Developer';
const HUMAN_EMAIL = 'dev@example.com';

const SCHEMA_V1 = 'model Artist {\n  id String @id\n}\n';
const SCHEMA_V2 = 'model Artist {\n  id String @id\n  slug String\n  @@index([slug])\n}\n';

interface GateResult {
  decision: string;
  reason: string;
  status: number;
}

interface CommitOptions {
  author?: 'bot' | 'human';
  files?: Record<string, string>;
  message: string[];
}

/** A throwaway git repository with a `main` branch. */
class TempRepo {
  readonly root: string;

  constructor() {
    this.root = mkdtempSync(join(tmpdir(), 'schema-push-gate-'));
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

  /** Writes the files, commits everything, and returns the new commit SHA. */
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

  runGate(headSha: string, mainRef = 'main'): GateResult {
    const result = spawnSync('bash', [SCRIPT, headSha, mainRef], {
      cwd: this.root,
      encoding: 'utf8',
    });
    return {
      decision: (result.stdout ?? '').trim(),
      reason: result.stderr ?? '',
      status: result.status ?? -1,
    };
  }

  dispose(): void {
    rmSync(this.root, { force: true, recursive: true });
  }
}

describe('schema-push-gate.sh', () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = new TempRepo();
  });

  afterEach(() => {
    repo.dispose();
  });

  it('skips when no release commit carries a Deployed-Sha marker yet', () => {
    repo.commit({ files: { 'prisma/schema.prisma': SCHEMA_V1 }, message: ['feat: one'] });
    repo.release('1.0.0');
    const head = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V2 },
      message: ['feat: add slug index'],
    });

    const result = repo.runGate(head);

    expect(result).toMatchObject({ decision: 'skip', status: 0 });
    expect(result.reason).toMatch(/Deployed-Sha/);
  });

  it('skips when the history has no release commit at all', () => {
    const head = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: first'],
    });

    expect(repo.runGate(head)).toMatchObject({ decision: 'skip', status: 0 });
  });

  it('skips when the schema is identical at the deployed commit and the new head', () => {
    const deployed = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: one'],
    });
    repo.release('1.0.0', deployed);
    const head = repo.commit({ files: { 'src/page.tsx': 'export {};\n' }, message: ['feat: ui'] });

    const result = repo.runGate(head);

    expect(result).toMatchObject({ decision: 'skip', status: 0 });
    expect(result.reason).toContain(deployed);
  });

  it('pushes when the schema changed since the deployed commit', () => {
    const deployed = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: one'],
    });
    repo.release('1.0.0', deployed);
    const head = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V2 },
      message: ['feat: add slug index'],
    });

    expect(repo.runGate(head)).toMatchObject({ decision: 'push', status: 0 });
  });

  it('pushes a schema change that landed before the release commit but after the deployed commit', () => {
    // PR B merges while PR A's deploy is in flight: A's release commit sits on
    // top of B, but only A was deployed. B's schema must still be pushed.
    const deployed = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: A'],
    });
    const head = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V2 },
      message: ['feat: B adds an index'],
    });
    repo.release('1.0.0', deployed);

    expect(repo.runGate(head)).toMatchObject({ decision: 'push', status: 0 });
  });

  it('reads the marker from the newest release commit', () => {
    const first = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: one'],
    });
    repo.release('1.0.0', first);
    const second = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V2 },
      message: ['feat: add slug index'],
    });
    repo.release('1.1.0', second);
    const head = repo.commit({ files: { 'README.md': 'hi\n' }, message: ['docs: readme'] });

    expect(repo.runGate(head)).toMatchObject({ decision: 'skip', status: 0 });
  });

  it('falls back to an older marker when the newest release commit has none', () => {
    const deployed = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: one'],
    });
    repo.release('1.0.0', deployed);
    repo.commit({ files: { 'prisma/schema.prisma': SCHEMA_V2 }, message: ['feat: index'] });
    repo.release('1.1.0');
    const head = repo.commit({ files: { 'README.md': 'hi\n' }, message: ['docs: readme'] });

    expect(repo.runGate(head)).toMatchObject({ decision: 'push', status: 0 });
  });

  it('ignores a release-looking commit that the release bot did not author', () => {
    const deployed = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: one'],
    });
    repo.release('1.0.0', deployed);
    const head = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V2 },
      message: ['feat: add slug index'],
    });
    repo.commit({
      author: 'human',
      message: ['chore(release): v9.9.9 [skip ci]', `Deployed-Sha: ${head}`],
    });

    expect(repo.runGate(head)).toMatchObject({ decision: 'push', status: 0 });
  });

  it('pushes when the marker names a commit the clone does not have', () => {
    repo.commit({ files: { 'prisma/schema.prisma': SCHEMA_V1 }, message: ['feat: one'] });
    repo.release('1.0.0', 'f'.repeat(40));
    const head = repo.commit({ files: { 'README.md': 'hi\n' }, message: ['docs: readme'] });

    const result = repo.runGate(head);

    expect(result).toMatchObject({ decision: 'push', status: 0 });
    expect(result.reason).toMatch(/not found|unknown/i);
  });

  it('pushes when the marker is not a commit SHA', () => {
    repo.commit({ files: { 'prisma/schema.prisma': SCHEMA_V1 }, message: ['feat: one'] });
    repo.release('1.0.0', 'not-a-sha');
    const head = repo.commit({ files: { 'README.md': 'hi\n' }, message: ['docs: readme'] });

    expect(repo.runGate(head)).toMatchObject({ decision: 'push', status: 0 });
  });

  it('pushes when the deployed commit had no schema file', () => {
    const deployed = repo.commit({ files: { 'README.md': 'hi\n' }, message: ['chore: init'] });
    repo.release('1.0.0', deployed);
    const head = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: schema'],
    });

    expect(repo.runGate(head)).toMatchObject({ decision: 'push', status: 0 });
  });

  it('pushes when a rollback redeploys an older schema', () => {
    const old = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: one'],
    });
    const deployed = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V2 },
      message: ['feat: add slug index'],
    });
    repo.release('1.0.0', deployed);

    expect(repo.runGate(old)).toMatchObject({ decision: 'push', status: 0 });
  });

  it('prints nothing but the decision on stdout', () => {
    const deployed = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: one'],
    });
    repo.release('1.0.0', deployed);
    const head = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V2 },
      message: ['feat: index'],
    });

    const result = repo.runGate(head);

    expect(result.decision).toBe('push');
    expect(result.reason.trim()).not.toBe('');
  });

  it('fails without a decision when the head commit cannot be resolved', () => {
    repo.commit({ files: { 'prisma/schema.prisma': SCHEMA_V1 }, message: ['feat: one'] });

    const result = repo.runGate('0'.repeat(40));

    expect(result.status).not.toBe(0);
    expect(result.decision).toBe('');
  });

  it('fails without a decision when the main ref cannot be resolved', () => {
    const head = repo.commit({
      files: { 'prisma/schema.prisma': SCHEMA_V1 },
      message: ['feat: one'],
    });

    const result = repo.runGate(head, 'origin/does-not-exist');

    expect(result.status).not.toBe(0);
    expect(result.decision).toBe('');
  });

  it('fails with usage when called without a head SHA', () => {
    const result = spawnSync('bash', [SCRIPT], { cwd: repo.root, encoding: 'utf8' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/usage/i);
  });
});
