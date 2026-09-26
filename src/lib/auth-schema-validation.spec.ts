/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import type { auth as AuthInstance } from './auth';

// better-auth ≥1.7.3 validates the adapter's schema at startup — in EVERY
// environment — and fails every auth request while the Prisma data model
// cannot hold what this config writes (a missing field, or a required field
// better-auth never writes). `auth.spec.ts` mocks better-auth, so this spec
// runs the REAL instance against the REAL generated data model: a schema edit
// that trips the check fails here instead of as a production auth outage.

const { toRuntimeDataModel } = vi.hoisted(() => ({
  /** Keys models by name — the shape the Prisma adapter reads from `client._runtimeDataModel`. */
  toRuntimeDataModel: <TModel extends { name: string }>(
    models: readonly TModel[]
  ): { models: Record<string, TModel> } => ({
    models: Object.fromEntries(models.map((model) => [model.name, model])),
  }),
}));

// setupTests.ts mocks '@/lib/auth' globally (see the note there); this spec
// exercises the real module, so lift that mock for this file.
vi.unmock('./auth');
vi.mock('server-only', () => ({}));
// Expose only the generated data model — no client is instantiated or connected.
vi.mock('@/lib/prisma', async () => {
  const { Prisma: generated } = await import('@prisma/client');
  return { prisma: { _runtimeDataModel: toRuntimeDataModel(generated.dmmf.datamodel.models) } };
});
vi.mock('@/lib/auth/ban-evasion-hook', () => ({ assertNotBanEvading: vi.fn() }));
vi.mock('@/lib/auth/social-providers-config', () => ({
  buildSocialProvidersConfig: vi.fn(() => ({})),
  accountLinkingConfig: { enabled: true, trustedProviders: ['google', 'apple', 'facebook'] },
  resolveAppleClientSecret: vi.fn(() => null),
}));
vi.mock('@/lib/auth/apple-secret-expiry-monitor', () => ({
  startAppleSecretExpiryMonitor: vi.fn(),
}));
vi.mock('@/lib/auth/user-create-before-hook', () => ({ userCreateBeforeHook: vi.fn() }));
vi.mock('@/lib/email/send-magic-link-email', () => ({ sendMagicLinkEmail: vi.fn() }));
vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: { findEmailById: vi.fn() },
}));

// A clearly-fake placeholder secret that is ≥32 chars (the validation
// threshold), built from filler so it is never mistaken for a credential.
const FAKE_TEST_SECRET = `test-secret-${'x'.repeat(32)}`;

// A required, default-less `issuer` — the column better-auth 1.7.0–1.7.2 added
// and 1.7.3 no longer writes. Stands in for any drift the check must reject.
const REQUIRED_ISSUER_FIELD: Prisma.DMMF.Field = {
  name: 'issuer',
  kind: 'scalar',
  type: 'String',
  isList: false,
  isRequired: true,
  isUnique: false,
  isId: false,
  isReadOnly: false,
  hasDefaultValue: false,
  isGenerated: false,
  isUpdatedAt: false,
};

const withRequiredIssuer = (model: Prisma.DMMF.Model): Prisma.DMMF.Model =>
  model.name === 'Account' ? { ...model, fields: [...model.fields, REQUIRED_ISSUER_FIELD] } : model;

describe('src/lib/auth — better-auth startup schema validation', () => {
  let auth: typeof AuthInstance;

  beforeAll(async () => {
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('AUTH_URL', 'http://localhost:3000');
    ({ auth } = await import('./auth'));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('registers the startup schema check for the Prisma client', async () => {
    const context = await auth.$context;

    expect(context.checkSchema).toBeTypeOf('function');
  });

  it('accepts the generated Prisma data model', async () => {
    const context = await auth.$context;

    await expect(Promise.resolve(context.checkSchema?.())).resolves.toBeUndefined();
  });

  it('rejects a data model with a required Account field better-auth never writes', async () => {
    const { betterAuth } = await import('better-auth');
    const { prismaAdapter } = await import('better-auth/adapters/prisma');
    const driftedModels = Prisma.dmmf.datamodel.models.map(withRequiredIssuer);
    const drifted = betterAuth({
      ...auth.options,
      logger: { disabled: true },
      database: prismaAdapter(
        { _runtimeDataModel: toRuntimeDataModel(driftedModels) },
        { provider: 'mongodb' }
      ),
    });
    const context = await drifted.$context;

    await expect(Promise.resolve(context.checkSchema?.())).rejects.toMatchObject({
      code: 'SCHEMA_MISMATCH',
    });
  });
});
