/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * deploy.yml wiring for the gated schema push (ADR-0012). The gate script's
 * behaviour is covered by schema-push-gate.spec.ts; these assertions pin how
 * the workflow calls it, so a refactor of deploy.yml cannot silently drop
 * the push, move it after the container roll, or widen the secret's scope.
 */

const DEPLOY_WORKFLOW = join(__dirname, '..', '..', '.github', 'workflows', 'deploy.yml');

const workflow = readFileSync(DEPLOY_WORKFLOW, 'utf8');

/** The text of one top-level job: from `  <name>:` to the next job header. */
const jobBlock = (name: string): string => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  if (start === -1) {
    return '';
  }
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 2);
};

/** The text of one step inside a job, from its `- name:` line to the next step. */
const stepBlock = (job: string, name: string): string => {
  const start = job.indexOf(`- name: ${name}`);
  if (start === -1) {
    return '';
  }
  const rest = job.slice(start);
  const next = rest.slice(1).search(/\n\s+- name: /);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

describe('deploy.yml — gated prisma db push', () => {
  const schemaJob = jobBlock('schema-push');

  it('has a schema-push job', () => {
    expect(schemaJob).not.toBe('');
  });

  it('runs only after the images and assets are built, so a failed build pushes nothing', () => {
    expect(schemaJob).toMatch(/needs: \[build-images, build-nginx, sync-to-s3\]/);
  });

  it('checks out the deployed commit with full history for the marker lookup', () => {
    const checkout = stepBlock(schemaJob, 'Checkout');

    expect(checkout).toMatch(/ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
    expect(checkout).toMatch(/fetch-depth: 0/);
  });

  it('asks the gate about the deployed commit against origin/main', () => {
    const gate = stepBlock(schemaJob, 'Decide whether the schema changed');

    expect(gate).toMatch(/id: gate/);
    expect(gate).toMatch(/HEAD_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
    expect(gate).toMatch(/bash scripts\/ci\/schema-push-gate\.sh "\$HEAD_SHA" origin\/main/);
  });

  it('runs the push only when the gate says push', () => {
    const push = stepBlock(schemaJob, 'Push Prisma schema');

    expect(push).toMatch(/if: steps\.gate\.outputs\.decision == 'push'/);
    expect(push).toMatch(/run: pnpm exec prisma db push --skip-generate\s*$/m);
  });

  it('scopes the production DATABASE_URL to the push step alone', () => {
    const push = stepBlock(schemaJob, 'Push Prisma schema');
    const withoutPush = schemaJob.replace(push, '');

    expect(push).toMatch(/DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
    expect(withoutPush).not.toMatch(/DATABASE_URL/);
  });

  it('never accepts data loss, so a destructive change fails the deploy', () => {
    const commands = workflow
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    expect(commands).not.toMatch(/accept-data-loss/);
  });

  it('holds the container roll until the schema job succeeds', () => {
    expect(jobBlock('deploy')).toMatch(/needs: \[[^\]]*\bschema-push\b[^\]]*\]/);
  });

  it('records the deployed commit on the release commit for the next gate', () => {
    const release = stepBlock(jobBlock('version-bump'), 'Commit, tag, and push');

    expect(release).toMatch(/DEPLOYED_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
    expect(release).toMatch(
      /git commit -m "chore\(release\): v\$\{NEW_VERSION\} \[skip ci\]" -m "Deployed-Sha: \$\{DEPLOYED_SHA\}"/
    );
  });
});
