'use client';

import type { JSX } from 'react';

import AuthToolbar from './components/auth/auth-toolbar';
import DataStoreHealthStatus from './components/data-store-health-status';
import ParticleGeneratorPlayGround from './components/ui/backgrounds/particle-generator';
import { CONSTANTS } from './lib/constants';

export default function Home(): JSX.Element {
  const isDevelopment = process.env.NODE_ENV === CONSTANTS.ENV.DEVELOPMENT;

  return (
    <>
      <AuthToolbar />
      {isDevelopment && (
        <>
          <ParticleGeneratorPlayGround />
          <DataStoreHealthStatus />
        </>
      )}
    </>
  );
}
