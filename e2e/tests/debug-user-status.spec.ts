import { PrismaClient } from '@prisma/client';

import { test } from '../fixtures/base.fixture';

const prisma = new PrismaClient({
  datasourceUrl:
    process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0',
});

test('debug: check user-status API for purchased release', async ({ userPage }) => {
  test.setTimeout(60000);

  const release = await prisma.release.findFirstOrThrow({
    where: { title: 'E2E Album One' },
    select: { id: true },
  });

  // Intercept the user-status API response
  const userStatusPromise = userPage.waitForResponse(
    (resp) => resp.url().includes('/user-status'),
    { timeout: 30000 }
  );

  await userPage.goto(`/releases/${release.id}`);

  const statusResp = await userStatusPromise;
  console.info('USER-STATUS HTTP STATUS:', statusResp.status());
  const body = await statusResp.json();
  console.info('USER-STATUS BODY:', JSON.stringify(body));

  // Also check the session
  const session = await userPage.evaluate(async () => {
    const res = await fetch('/api/auth/session');
    return { status: res.status, body: await res.json() };
  });
  console.info('SESSION STATUS:', session.status);
  console.info('SESSION BODY:', JSON.stringify(session.body));

  await prisma.$disconnect();
});
