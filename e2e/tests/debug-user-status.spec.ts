import { PrismaClient } from '@prisma/client';

import { test } from '../fixtures/base.fixture';

const prisma = new PrismaClient({
  datasourceUrl:
    process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0',
});

test('debug: check user-status API for purchased release', async ({ userPage }) => {
  const release = await prisma.release.findFirstOrThrow({
    where: { title: 'E2E Album One' },
    select: { id: true },
  });

  // Call the user-status API directly (SSR prefetch means the client
  // never makes this request, so waitForResponse would time out).
  const statusResp = await userPage.request.get(`/api/releases/${release.id}/user-status`);
  console.info('USER-STATUS HTTP STATUS:', statusResp.status());
  const body = await statusResp.json();
  console.info('USER-STATUS BODY:', JSON.stringify(body));

  // Also check the session
  const sessionResp = await userPage.request.get('/api/auth/session');
  console.info('SESSION STATUS:', sessionResp.status());
  const sessionBody = await sessionResp.json();
  console.info('SESSION BODY:', JSON.stringify(sessionBody));

  await prisma.$disconnect();
});
