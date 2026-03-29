/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import crypto from 'node:crypto';

import { PrismaClient } from '@prisma/client';

/**
 * Use the E2E database directly — same URL as seed-test-db.ts — so that
 * helpers running in the Playwright test runner process always target the
 * isolated E2E database rather than whatever DATABASE_URL is set in the shell.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

interface UploadTestAudioFileOptions {
  releaseId: string;
  formatType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

interface UploadTestAudioFileResult {
  id: string;
  formatType: string;
  s3Key: string;
}

/**
 * Creates a ReleaseDigitalFormat record in the test database, simulating a
 * completed upload without actually transferring data to S3. Used in E2E
 * tests to seed digital format state before exercising download flows.
 */
export async function uploadTestAudioFile({
  releaseId,
  formatType,
  fileName,
  fileSize,
  mimeType,
}: UploadTestAudioFileOptions): Promise<UploadTestAudioFileResult> {
  const s3Key = `releases/${releaseId}/audio/${formatType.toLowerCase()}/${fileName}`;
  const checksum = crypto.createHash('md5').update(s3Key).digest('hex');

  const format = await prisma.releaseDigitalFormat.create({
    data: {
      releaseId,
      formatType,
      s3Key,
      fileName,
      fileSize: BigInt(fileSize),
      mimeType,
      checksum,
    },
  });

  return {
    id: format.id,
    formatType: format.formatType,
    s3Key: format.s3Key ?? s3Key,
  };
}
