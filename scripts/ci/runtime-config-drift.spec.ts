/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  ENV_MANIFEST,
  FEATURE_GROUPS,
  featureGroupMembers,
  type EnvPhase,
} from '../../src/lib/config/env-manifest';
import { SOCIAL_PROVIDER_IDS } from '../../src/lib/config/social-providers';

/**
 * A configuration name is spelled in four places: a GitHub secret, the
 * `.env.deploy` heredoc in roll-host.yml, the website `environment:` block in
 * docker-compose.prod.yml, and the code that reads it. A name dropped between
 * any two of them reaches the code as an empty value and the feature behind it
 * turns itself off without a word (ADR-0024). These assertions read the files
 * as text and hold all four to the manifest in `src/lib/config/env-manifest.ts`.
 */

const ROOT = join(__dirname, '..', '..');
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

const rollHost = read('.github', 'workflows', 'roll-host.yml');
const ciWorkflow = read('.github', 'workflows', 'ci.yml');
const deployWorkflow = read('.github', 'workflows', 'deploy.yml');
const composeProd = read('docker-compose.prod.yml');
const dockerfile = read('Dockerfile');

/**
 * Names the deploy env file carries for the host rather than the website
 * container. Each one is consumed somewhere other than the app's code.
 */
const INFRA_ONLY = new Set([
  // Interpolated into `image:` of the website and nginx services.
  'NEXT_APP_WEBSITE_IMAGE',
  'NEXT_APP_NGINX_IMAGE',
  // Read by docker-compose.logging.yml (Grafana), not by the website.
  'GRAFANA_ADMIN_PASSWORD',
  'GRAFANA_ALERT_EMAIL',
]);

/** Literal values compose sets on the website itself; no secret behind them. */
const COMPOSE_CONSTANTS = new Set(['NODE_ENV', 'NEXT_TELEMETRY_DISABLED']);

const namesOf = (phase: EnvPhase): string[] =>
  ENV_MANIFEST.filter((spec) => spec.phase === phase).map(({ name }) => name);

const MANIFEST_NAMES = new Set(ENV_MANIFEST.map(({ name }) => name));
const LOCAL_NAMES = new Set(namesOf('local'));

/** The text of one step, from its `- name: <name>` line to the next step. */
const stepBlock = (workflow: string, name: string): string => {
  const start = workflow.indexOf(`- name: ${name}\n`);
  if (start === -1) {
    return '';
  }
  const rest = workflow.slice(start);
  const next = rest.slice(1).search(/\n +- name: /);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

/** The `NAME: value` lines of a YAML block, keyed by name (step `env:` maps). */
const yamlEnv = (block: string): Map<string, string> =>
  new Map(
    block
      .split('\n')
      .map((line) => /^ +([A-Z][A-Z0-9_]*): (.*)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map(([, name, value]) => [name, value])
  );

const ENV_FILE_STEP = stepBlock(rollHost, 'Create .env for remote');
const ENV_FILE_STEP_ENV = yamlEnv(ENV_FILE_STEP);

/**
 * `NAME=value` lines of the heredoc, plus the `printf 'NAME=%s` lines appended
 * after it, whose value comes from the step's own `env:` entry of that name.
 */
const envFileEntries = (): Map<string, string> => {
  const entries = new Map<string, string>();
  for (const line of ENV_FILE_STEP.split('\n')) {
    const heredoc = /^ +([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    const printf = /printf '([A-Z][A-Z0-9_]*)=%s/.exec(line);
    if (heredoc) {
      entries.set(heredoc[1], heredoc[2]);
    } else if (printf) {
      entries.set(printf[1], ENV_FILE_STEP_ENV.get(printf[1]) ?? '');
    }
  }
  return entries;
};

const ENV_FILE = envFileEntries();

/** The website service's `environment:` block, up to `expose:`, as name → value. */
const websiteEnvironment = (): Map<string, string> => {
  const start = composeProd.indexOf('    environment:\n');
  const end = composeProd.indexOf('    expose:', start);
  return yamlEnv(composeProd.slice(start, end));
};

/** `${NAME}` or `${NAME:-default}` → `NAME`; anything else → undefined. */
const interpolatedName = (value: string): string | undefined =>
  value.startsWith('${') && value.endsWith('}') ? value.slice(2, -1).split(':-')[0] : undefined;

/** Website env names whose value comes from the env file, mapped to the name they read. */
const COMPOSE = new Map(
  [...websiteEnvironment()]
    .map(([name, value]): [string, string | undefined] => [name, interpolatedName(value)])
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
);

/** Website env names compose sets to a literal. */
const composeLiterals = (): string[] =>
  [...websiteEnvironment()]
    .filter(([, value]) => interpolatedName(value) === undefined)
    .map(([name]) => name);

const missingFrom = (names: Iterable<string>, present: (name: string) => boolean): string[] =>
  [...names].filter((name) => !present(name)).sort();

describe('runtime config drift — the deploy env file and compose', () => {
  it('finds the env-file step and the compose website environment', () => {
    expect(ENV_FILE.size).toBeGreaterThan(20);
    expect(COMPOSE.size).toBeGreaterThan(20);
  });

  it('writes every runtime manifest name to the deploy env file', () => {
    expect(missingFrom(namesOf('runtime'), (name) => ENV_FILE.has(name))).toEqual([]);
  });

  it('passes every runtime manifest name into the website container', () => {
    expect(missingFrom(namesOf('runtime'), (name) => COMPOSE.has(name))).toEqual([]);
  });

  it('forwards each website variable from the env-file entry of the same name', () => {
    const renamed = [...COMPOSE].filter(([name, source]) => name !== source).map(([name]) => name);

    expect(renamed).toEqual([]);
  });

  it('lists the same names in the env file and compose, outside the infra allow-list', () => {
    const envFileOnly = missingFrom(
      ENV_FILE.keys(),
      (name) => COMPOSE.has(name) || INFRA_ONLY.has(name)
    );
    const composeOnly = missingFrom(COMPOSE.keys(), (name) => ENV_FILE.has(name));

    expect({ envFileOnly, composeOnly }).toEqual({ envFileOnly: [], composeOnly: [] });
  });

  it('forwards no name the app does not read', () => {
    expect(
      missingFrom(ENV_FILE.keys(), (name) => MANIFEST_NAMES.has(name) || INFRA_ONLY.has(name))
    ).toEqual([]);
  });

  it('forwards no local-only name to production', () => {
    const forwarded = [...ENV_FILE.keys(), ...COMPOSE.keys(), ...composeLiterals()];

    expect(
      forwarded.filter((name) => LOCAL_NAMES.has(name) && !COMPOSE_CONSTANTS.has(name))
    ).toEqual([]);
  });

  it('sets only the known constants as compose literals', () => {
    expect(composeLiterals().sort()).toEqual([...COMPOSE_CONSTANTS].sort());
  });

  it('reads each env-file value from the secret or variable of the same name', () => {
    const renamed = [...ENV_FILE]
      .filter(([name]) => !INFRA_ONLY.has(name))
      .filter(
        ([name, value]) =>
          !value.includes(`{{ secrets.${name} }}`) && !value.includes(`{{ vars.${name} `)
      )
      .map(([name]) => name);

    expect(renamed).toEqual([]);
  });
});

describe('runtime config drift — required values are checked before the roll', () => {
  const STEP = 'Check the required runtime config is set';
  const required = stepBlock(rollHost, STEP);
  const requiredEnv = yamlEnv(required);
  const stepNames = [...rollHost.matchAll(/\n +- name: ([^\n]+)/g)].map(([, name]) => name);
  const REQUIRED = ENV_MANIFEST.filter(
    ({ phase, requirement }) => phase === 'runtime' && requirement === 'required'
  ).map(({ name }) => name);
  const checkedNames = (): string[] => {
    const command = /bash scripts\/ci\/check-required-config\.sh([^\n]*)/.exec(required)?.[1] ?? '';
    return command.trim().split(/ +/).filter(Boolean);
  };

  it('checks exactly the manifest’s required runtime names', () => {
    expect([...checkedNames()].sort()).toEqual([...REQUIRED].sort());
  });

  it('gives each one the value the env file will get', () => {
    expect(
      missingFrom(
        REQUIRED,
        (name) =>
          requiredEnv.get(name) !== undefined && requiredEnv.get(name) === ENV_FILE.get(name)
      )
    ).toEqual([]);
  });

  it('checks before the host is touched or the env file is written', () => {
    const at = stepNames.indexOf(STEP);

    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(stepNames.indexOf('Configure AWS credentials'));
    expect(at).toBeLessThan(stepNames.indexOf('Create .env for remote'));
  });
});

describe('runtime config drift — intended social providers', () => {
  const STEP = 'Check the intended social providers have credentials';
  const intent = stepBlock(rollHost, STEP);
  const intentEnv = yamlEnv(intent);
  const stepNames = [...rollHost.matchAll(/\n +- name: ([^\n]+)/g)].map(([, name]) => name);

  it('runs the intent check in roll-host', () => {
    expect(intent).toContain('run: bash scripts/ci/check-social-provider-intent.sh');
  });

  it('reads the intent from the repository variable, defaulting to the live providers', () => {
    expect(intentEnv.get('ENABLED_SOCIAL_PROVIDERS')).toBe(
      "${{ vars.ENABLED_SOCIAL_PROVIDERS || 'google,apple,facebook' }}"
    );
  });

  it('hands the check every social credential, from the secret of the same name', () => {
    const names = FEATURE_GROUPS.filter(({ id }) =>
      (SOCIAL_PROVIDER_IDS as readonly string[]).includes(id)
    ).flatMap(featureGroupMembers);

    expect(missingFrom(names, (name) => intentEnv.get(name) === `\${{ secrets.${name} }}`)).toEqual(
      []
    );
  });

  it('checks before the host is touched or the env file is written', () => {
    const at = stepNames.indexOf(STEP);

    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(stepNames.indexOf('Configure AWS credentials'));
    expect(at).toBeLessThan(stepNames.indexOf('Create .env for remote'));
  });
});

describe('runtime config drift — build-time values', () => {
  const ciBuild = stepBlock(ciWorkflow, 'Build Next.js');
  const deployBuild = stepBlock(deployWorkflow, 'Build website image (single-arch for speed)');

  it('finds the CI build step and the image build step', () => {
    expect(ciBuild).toMatch(/next build/);
    expect(deployBuild).toMatch(/--build-arg/);
  });

  const fromSecret = (name: string): string => `\${{ secrets.${name} }}`;
  const ciBuildEnv = yamlEnv(ciBuild);
  const deployBuildEnv = yamlEnv(deployBuild);
  const dockerfileLines = new Set(dockerfile.split('\n'));

  it('sets every build-time name in the CI "Build Next.js" env', () => {
    expect(
      missingFrom(namesOf('build'), (name) => ciBuildEnv.get(name) === fromSecret(name))
    ).toEqual([]);
  });

  it('declares every build-time name as a Dockerfile ARG and ENV', () => {
    expect(
      missingFrom(
        namesOf('build'),
        (name) => dockerfileLines.has(`ARG ${name}`) && dockerfileLines.has(`ENV ${name}=$${name}`)
      )
    ).toEqual([]);
  });

  it('passes every build-time name as a deploy build-arg', () => {
    expect(
      missingFrom(
        namesOf('build'),
        (name) =>
          deployBuild.includes(`--build-arg ${name}=\${${name}}`) &&
          deployBuildEnv.get(name) === fromSecret(name)
      )
    ).toEqual([]);
  });

  it('only manifests NEXT_PUBLIC_ names as build-time', () => {
    expect(namesOf('build').filter((name) => !name.startsWith('NEXT_PUBLIC_'))).toEqual([]);
  });
});

describe('runtime config drift — the code reads only manifest names', () => {
  const SRC = join(ROOT, 'src');

  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) && !entry.name.includes('.spec.') ? [path] : [];
    });

  /** Names in `const { A, B: b } = process.env` destructures. */
  const destructuredNames = (text: string): string[] =>
    [...text.matchAll(/\{([^{}]*)\}\s*=\s*process\.env\b/g)].flatMap(([, names]) =>
      names
        .split(',')
        .map((part) => part.trim().split(/[\s:]/)[0])
        .filter((name) => name.length > 0)
    );

  /**
   * `process.env.NAME` reads (and `env.NAME` on an injected environment, as
   * the boot check takes one), plus destructured names, each mapped to one
   * file reading it. Prisma's schema reads its connection string itself.
   */
  const namesRead = (): Map<string, string> => {
    const found = new Map<string, string>();
    for (const path of sources(SRC)) {
      const text = readFileSync(path, 'utf8');
      const where = path.replace(`${ROOT}/`, '');
      const direct = [...text.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)].map(([, name]) => name);
      for (const name of [...direct, ...destructuredNames(text)]) {
        found.set(name, where);
      }
    }
    for (const [, name] of read('prisma', 'schema.prisma').matchAll(
      /env\("([A-Z][A-Z0-9_]*)"\)/g
    )) {
      found.set(name, 'prisma/schema.prisma');
    }
    return found;
  };

  const READ = namesRead();

  it('finds the reads it scans for', () => {
    expect(READ.get('AUTH_SECRET')).toBeDefined();
    expect(READ.get('PUSHER_APP_ID')).toBe('src/lib/utils/pusher-server.ts');
    expect(READ.get('DATABASE_URL')).toBeDefined();
  });

  it('reads no name missing from the manifest', () => {
    const unknown = [...READ]
      .filter(([name]) => !MANIFEST_NAMES.has(name))
      .map(([name, where]) => `${name} (${where})`);

    expect(unknown).toEqual([]);
  });

  it('has no manifest name the code never reads', () => {
    expect(missingFrom(MANIFEST_NAMES, (name) => READ.has(name))).toEqual([]);
  });

  it('lists each name once', () => {
    expect(ENV_MANIFEST.length).toBe(MANIFEST_NAMES.size);
  });
});
