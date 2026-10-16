/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Workflow wiring for the manual rollback (ADR-0021). The scripts it calls
 * have their own specs; these assertions pin how the workflows call them, so
 * a refactor cannot silently make the rollback build, test, or push a
 * schema, let the forward deploy stop tagging the images a rollback needs,
 * or let the host-side steps drift between the forward deploy and the
 * rollback.
 */

const WORKFLOWS = join(__dirname, '..', '..', '.github', 'workflows');

const deploy = readFileSync(join(WORKFLOWS, 'deploy.yml'), 'utf8');
const rollHost = readFileSync(join(WORKFLOWS, 'roll-host.yml'), 'utf8');
const rollback = readFileSync(join(WORKFLOWS, 'rollback.yml'), 'utf8');
const remoteScript = readFileSync(join(__dirname, 'deploy-remote.sh'), 'utf8');

/** The text of one top-level job: from `  <name>:` to the next job header. */
const jobBlock = (workflow: string, name: string): string => {
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

/**
 * The text of one `workflow_call` / `workflow_dispatch` input: from its
 * `      <name>:` line to the next input or the end of the inputs map.
 */
const inputBlock = (workflow: string, name: string): string => {
  const start = workflow.indexOf(`\n      ${name}:\n`);
  if (start === -1) {
    return '';
  }
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {0,6}[a-z][\w-]*:/);
  return next === -1 ? rest : rest.slice(0, next + 2);
};

/** Every non-comment line of a workflow. */
const commands = (workflow: string): string =>
  workflow
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

describe('deploy.yml — images carry the tags a rollback resolves', () => {
  it('tags each website build with the deployed commit', () => {
    const build = stepBlock(jobBlock(deploy, 'build-images'), 'Build website image');

    expect(build).toMatch(
      /-t \$\{\{ env\.WEBSITE_IMAGE \}\}:sha-\$\{\{ github\.event\.workflow_run\.head_sha \}\}/
    );
  });

  it('tags each nginx build with the deployed commit', () => {
    const build = stepBlock(jobBlock(deploy, 'build-nginx'), 'Build nginx image');

    expect(build).toMatch(
      /-t \$\{\{ env\.NGINX_IMAGE \}\}:sha-\$\{\{ github\.event\.workflow_run\.head_sha \}\}/
    );
  });

  it('retags both deployed digests with the new version once the release exists', () => {
    const bump = jobBlock(deploy, 'version-bump');
    const retag = stepBlock(bump, 'Tag the deployed images with the version');

    expect(retag).not.toBe('');
    expect(retag).toMatch(
      /if: steps\.bump-type\.outputs\.skip != 'true' &&\s*steps\.version\.outputs\.skip_remainder != 'true'/
    );
    expect(retag).toMatch(/WEBSITE_DIGEST: \$\{\{ needs\.build-images\.outputs\.digest \}\}/);
    expect(retag).toMatch(/NGINX_DIGEST: \$\{\{ needs\.build-nginx\.outputs\.digest \}\}/);
    expect(retag).toMatch(
      /docker buildx imagetools create -t "\$\{WEBSITE_IMAGE\}:\$\{NEW_TAG\}" "\$\{WEBSITE_IMAGE\}@\$\{WEBSITE_DIGEST\}"/
    );
    expect(retag).toMatch(
      /docker buildx imagetools create -t "\$\{NGINX_IMAGE\}:\$\{NEW_TAG\}" "\$\{NGINX_IMAGE\}@\$\{NGINX_DIGEST\}"/
    );
  });

  it('gives version-bump the build outputs and the registry permission the retag needs', () => {
    const bump = jobBlock(deploy, 'version-bump');

    expect(bump).toMatch(/needs: \[[^\]]*\bbuild-images\b[^\]]*\]/);
    expect(bump).toMatch(/needs: \[[^\]]*\bbuild-nginx\b[^\]]*\]/);
    expect(bump).toMatch(/packages: write/);
  });
});

describe('deploy.yml — the host roll is the shared workflow', () => {
  const deployJob = jobBlock(deploy, 'deploy');

  it('rolls the host through roll-host.yml with every secret', () => {
    expect(deployJob).toMatch(/uses: \.\/\.github\/workflows\/roll-host\.yml/);
    expect(deployJob).toMatch(/secrets: inherit/);
  });

  it('passes the digests the build jobs captured', () => {
    expect(deployJob).toMatch(/website_digest: \$\{\{ needs\.build-images\.outputs\.digest \}\}/);
    expect(deployJob).toMatch(/nginx_digest: \$\{\{ needs\.build-nginx\.outputs\.digest \}\}/);
  });

  it('sends the host the files of the commit being deployed, not main’s tip', () => {
    expect(deployJob).toMatch(/files_ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  });

  it('is a forward deploy, so the remote script keeps its health-failure reflex', () => {
    expect(deployJob).not.toMatch(/rollback_run: true/);
  });

  it('bumps the version only after the shared roll passed its health check', () => {
    expect(jobBlock(deploy, 'version-bump')).toMatch(/needs: \[[^\]]*\bdeploy\b[^\]]*\]/);
    expect(jobBlock(deploy, 'verify-deployment')).toBe('');
  });
});

describe('roll-host.yml — one host roll for deploy and rollback', () => {
  const job = jobBlock(rollHost, 'roll');

  it('is callable with the digests, the files commit, and the rollback flag', () => {
    expect(rollHost).toMatch(/workflow_call:/);
    for (const input of ['website_digest', 'nginx_digest', 'files_ref', 'rollback_run']) {
      expect(inputBlock(rollHost, input)).not.toBe('');
    }
    expect(inputBlock(rollHost, 'rollback_run')).toMatch(/type: boolean/);
  });

  it('checks out the files commit it was given', () => {
    expect(stepBlock(job, 'Checkout')).toMatch(/ref: \$\{\{ inputs\.files_ref \}\}/);
  });

  it('uploads compose, observability, and the deploy script in one transfer', () => {
    const uploads = job.match(/uses: appleboy\/scp-action/g) ?? [];

    expect(uploads).toHaveLength(1);
    const upload = stepBlock(job, 'Upload compose, env, observability and deploy script');
    expect(upload).toMatch(/docker-compose\.prod\.yml/);
    expect(upload).toMatch(/docker-compose\.logging\.yml/);
    expect(upload).toMatch(/\.env\.deploy/);
    expect(upload).toMatch(/observability/);
    expect(upload).toMatch(/scripts\/ci\/deploy-remote\.sh/);
  });

  it('tells the remote script whether this is a rollback', () => {
    const ssh = stepBlock(job, 'Deploy via SSH');

    expect(ssh).toMatch(/ROLLBACK_RUN: \$\{\{ inputs\.rollback_run \}\}/);
    expect(ssh).toMatch(/envs: [^\n]*\bROLLBACK_RUN\b/);
  });

  it('revokes the runner IP whatever happened', () => {
    expect(stepBlock(job, 'Revoke runner IP from all Security Groups')).toMatch(/if: always\(\)/);
  });

  it('verifies health with the retrying script and no fixed sleep', () => {
    const verify = stepBlock(job, 'Verify application health');

    expect(verify).toMatch(/bash scripts\/ci\/verify-health\.sh/);
    expect(commands(rollHost)).not.toMatch(/\bsleep\b/);
  });

  it('points latest at the rolled images only for a rollback, and only after health passed', () => {
    const steps = job.split(/\n\s+- name: /).map((step) => step.split('\n')[0]);
    const retag = stepBlock(job, 'Point latest at the rolled images');

    expect(retag).toMatch(/if: \$\{\{ inputs\.rollback_run \}\}/);
    expect(retag).toMatch(
      /docker buildx imagetools create -t "\$\{WEBSITE_IMAGE\}:latest" "\$\{WEBSITE_IMAGE\}@\$\{WEBSITE_DIGEST\}"/
    );
    expect(retag).toMatch(
      /docker buildx imagetools create -t "\$\{NGINX_IMAGE\}:latest" "\$\{NGINX_IMAGE\}@\$\{NGINX_DIGEST\}"/
    );
    expect(steps.indexOf('Point latest at the rolled images')).toBeGreaterThan(
      steps.indexOf('Verify application health')
    );
  });

  it('never installs the toolchain, runs a gate, or touches the schema', () => {
    const text = commands(rollHost);

    expect(text).not.toMatch(/actions\/setup\b/);
    expect(text).not.toMatch(/pnpm/);
    expect(text).not.toMatch(/prisma/);
  });
});

describe('rollback.yml — manual, two inputs, nothing rebuilt', () => {
  it('is a manual dispatch with an optional version and a force flag', () => {
    expect(rollback).toMatch(/workflow_dispatch:/);
    const version = inputBlock(rollback, 'version');
    const force = inputBlock(rollback, 'force');
    expect(version).toMatch(/required: false/);
    expect(version).not.toMatch(/required: true/);
    expect(force).toMatch(/type: boolean/);
    expect(force).toMatch(/default: false/);
  });

  it('shares the forward deploy’s concurrency group and cancels it', () => {
    expect(rollback).toMatch(/concurrency:\n\s+group: cicd-main\n\s+cancel-in-progress: true/);
  });

  it('has exactly two jobs: resolve, then the shared roll', () => {
    const jobsMap = rollback.slice(rollback.indexOf('\njobs:\n'));
    const jobs = [...jobsMap.matchAll(/\n {2}([a-z][\w-]*):\n/g)].map(([, name]) => name);

    expect(jobs).toEqual(['resolve', 'roll']);
    const roll = jobBlock(rollback, 'roll');
    expect(roll).toMatch(/needs: \[resolve\]/);
    expect(roll).toMatch(/uses: \.\/\.github\/workflows\/roll-host\.yml/);
    expect(roll).toMatch(/secrets: inherit/);
    expect(roll).toMatch(/rollback_run: true/);
    expect(roll).toMatch(/website_digest: \$\{\{ needs\.resolve\.outputs\.website_digest \}\}/);
    expect(roll).toMatch(/nginx_digest: \$\{\{ needs\.resolve\.outputs\.nginx_digest \}\}/);
    expect(roll).toMatch(/files_ref: \$\{\{ needs\.resolve\.outputs\.target_sha \}\}/);
  });

  it('resolves the target from the GHCR listings of both images', () => {
    const resolve = jobBlock(rollback, 'resolve');
    const list = stepBlock(resolve, 'List the image versions in GHCR');

    expect(list).toMatch(/packages\/container\/boudreaux%2Fwebsite\/versions/);
    expect(list).toMatch(/packages\/container\/boudreaux%2Fnginx\/versions/);
    expect(list).toMatch(/--paginate/);
    const target = stepBlock(resolve, 'Resolve the target version');
    expect(target).toMatch(
      /bash scripts\/ci\/rollback-resolve\.sh "\$REQUESTED" website-versions\.json nginx-versions\.json/
    );
    expect(target).toMatch(/REQUESTED: \$\{\{ inputs\.version \}\}/);
  });

  it('finds the deployed commit of the target and of the live version', () => {
    const resolve = jobBlock(rollback, 'resolve');

    expect(stepBlock(resolve, 'Checkout')).toMatch(/fetch-depth: 0/);
    expect(stepBlock(resolve, 'Find the deployed commits')).toMatch(
      /bash scripts\/ci\/release-deployed-sha\.sh "\$TARGET" origin\/main/
    );
    expect(stepBlock(resolve, 'Find the deployed commits')).toMatch(
      /bash scripts\/ci\/release-deployed-sha\.sh "\$LIVE" origin\/main/
    );
  });

  it('trips on a destructive schema change unless forced', () => {
    const tripwire = stepBlock(
      jobBlock(rollback, 'resolve'),
      'Check the schema between live and target'
    );

    expect(tripwire).toMatch(
      /bash scripts\/ci\/schema-rollback-tripwire\.sh "\$LIVE_SHA" "\$TARGET_SHA"/
    );
    expect(tripwire).toMatch(/FORCE: \$\{\{ inputs\.force \}\}/);
    expect(tripwire).toMatch(/blocked/);
    expect(tripwire).toMatch(/exit 1/);
  });

  it('never installs the toolchain, runs a gate, builds, or touches the schema', () => {
    const text = commands(rollback);

    expect(text).not.toMatch(/actions\/setup\b/);
    expect(text).not.toMatch(/pnpm/);
    expect(text).not.toMatch(/prisma db/);
    expect(text).not.toMatch(/docker buildx build/);
    expect(text).not.toMatch(/vitest|eslint|tsc\b/);
  });

  it('reads the registry with the workflow token and nothing wider in resolve', () => {
    const resolve = jobBlock(rollback, 'resolve');

    expect(resolve).toMatch(/packages: read/);
    expect(resolve).not.toMatch(/AWS_|SSH_PRIVATE_KEY|EC2_/);
  });
});

describe('deploy-remote.sh — the health-failure reflex is off during a rollback', () => {
  it('documents ROLLBACK_RUN in the usage header', () => {
    expect(remoteScript).toMatch(/ROLLBACK_RUN\s+- 'true'/);
  });

  it('exits non-zero without re-pulling the previous digests when ROLLBACK_RUN is true', () => {
    const start = remoteScript.indexOf('/api/health; then');
    const failureBlock = remoteScript.slice(start, remoteScript.indexOf('Rollback successful'));

    expect(failureBlock).toMatch(/if \[ "\$\{ROLLBACK_RUN:-false\}" = "true" \]; then/);
    const rollbackBranch = failureBlock.slice(
      failureBlock.indexOf('ROLLBACK_RUN'),
      failureBlock.indexOf('PREV_WEBSITE_DIGEST')
    );
    expect(rollbackBranch).toMatch(/exit 1/);
    expect(rollbackBranch).not.toMatch(/pull/);
  });
});
