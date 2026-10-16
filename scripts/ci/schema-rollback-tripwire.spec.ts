/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/**
 * A rollback is code only (ADR-0021): it never pushes the Prisma schema. The
 * one thing it cannot undo is a live version that removed or retyped a field
 * or dropped an index, because the older code may need those. The tripwire
 * diffs `prisma/schema.prisma` between the live and target deployed commits
 * and says `clear` or `blocked`. Additions by the live version are harmless
 * to the older code and pass; anything the target has that the live version
 * lacks is what the live version removed, and blocks.
 */

const SCRIPT = join(__dirname, 'schema-rollback-tripwire.sh');
const SCHEMA_PATH = 'prisma/schema.prisma';

const BASE = [
  'model Artist {',
  '  id   String @id',
  '  slug String',
  '  name String',
  '  @@index([slug])',
  '}',
  '',
].join('\n');

const WITH_ADDED_FIELD_AND_INDEX = BASE.replace(
  '  name String\n',
  '  name String\n  bio  String?\n  @@index([name])\n'
);

const WITH_REMOVED_FIELD = BASE.replace('  name String\n', '');

const WITH_RETYPED_FIELD = BASE.replace('  name String', '  name Int');

const WITH_DROPPED_INDEX = BASE.replace('  @@index([slug])\n', '');

const WITH_COMMENT_ONLY = BASE.replace('model Artist {', '// The artist roster\nmodel Artist {');

interface TripwireResult {
  decision: string;
  status: number;
  stderr: string;
}

class TempRepo {
  readonly root: string;

  constructor() {
    this.root = mkdtempSync(join(tmpdir(), 'schema-rollback-tripwire-'));
    this.git(['init', '--quiet', '--initial-branch=main']);
  }

  git(args: string[]): string {
    const result = spawnSync(
      'git',
      [
        '-c',
        'user.name=dev',
        '-c',
        'user.email=dev@example.com',
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

  commit(files: Record<string, string>, message: string): string {
    for (const [relativePath, contents] of Object.entries(files)) {
      const target = join(this.root, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    this.git(['add', '--all']);
    this.git(['commit', '--quiet', '--allow-empty', '-m', message]);
    return this.git(['rev-parse', 'HEAD']);
  }

  schema(contents: string, message = 'feat: schema'): string {
    return this.commit({ [SCHEMA_PATH]: contents }, message);
  }

  run(liveSha: string, targetSha: string): TripwireResult {
    const result = spawnSync('bash', [SCRIPT, liveSha, targetSha], {
      cwd: this.root,
      encoding: 'utf8',
    });
    return {
      decision: (result.stdout ?? '').trim(),
      status: result.status ?? -1,
      stderr: result.stderr ?? '',
    };
  }

  dispose(): void {
    rmSync(this.root, { force: true, recursive: true });
  }
}

describe('schema-rollback-tripwire.sh', () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = new TempRepo();
  });

  afterEach(() => {
    repo.dispose();
  });

  it('is clear when the schema did not change between the two versions', () => {
    const target = repo.schema(BASE);
    const live = repo.commit({ 'src/page.tsx': 'export {};\n' }, 'feat: ui');

    expect(repo.run(live, target)).toMatchObject({ decision: 'clear', status: 0 });
  });

  it('is clear when the live version only added fields and indexes', () => {
    const target = repo.schema(BASE);
    const live = repo.schema(WITH_ADDED_FIELD_AND_INDEX);

    expect(repo.run(live, target)).toMatchObject({ decision: 'clear', status: 0 });
  });

  it('is clear when only comments changed', () => {
    const target = repo.schema(BASE);
    const live = repo.schema(WITH_COMMENT_ONLY);

    expect(repo.run(live, target)).toMatchObject({ decision: 'clear', status: 0 });
  });

  it('blocks when the live version removed a field the target has', () => {
    const target = repo.schema(BASE);
    const live = repo.schema(WITH_REMOVED_FIELD);

    const result = repo.run(live, target);

    expect(result).toMatchObject({ decision: 'blocked', status: 0 });
    expect(result.stderr).toMatch(/\+\s+name String/);
  });

  it('blocks when the live version changed a field’s type', () => {
    const target = repo.schema(BASE);
    const live = repo.schema(WITH_RETYPED_FIELD);

    expect(repo.run(live, target)).toMatchObject({ decision: 'blocked', status: 0 });
  });

  it('blocks when the live version dropped an index the target has', () => {
    const target = repo.schema(BASE);
    const live = repo.schema(WITH_DROPPED_INDEX);

    expect(repo.run(live, target)).toMatchObject({ decision: 'blocked', status: 0 });
  });

  it('is clear when rolling forward would be the destructive direction', () => {
    // The target removed a field relative to live: rolling back to it is the
    // same shape as a forward deploy of that removal, which the forward deploy
    // allows. Only what the target has and live lacks counts.
    const target = repo.schema(WITH_REMOVED_FIELD);
    const live = repo.schema(BASE);

    expect(repo.run(live, target)).toMatchObject({ decision: 'clear', status: 0 });
  });

  it('is clear when the live and target commits are the same', () => {
    const sha = repo.schema(BASE);

    expect(repo.run(sha, sha)).toMatchObject({ decision: 'clear', status: 0 });
  });

  it('fails without a decision when a commit cannot be resolved', () => {
    const target = repo.schema(BASE);

    const result = repo.run('f'.repeat(40), target);

    expect(result.status).not.toBe(0);
    expect(result.decision).toBe('');
  });

  it('prints the schema diff on stderr so the run summary can show it', () => {
    const target = repo.schema(BASE);
    const live = repo.schema(WITH_REMOVED_FIELD);

    expect(repo.run(live, target).stderr).toMatch(/schema\.prisma/);
  });
});
