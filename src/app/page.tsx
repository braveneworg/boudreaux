'use client';

import type { JSX } from 'react';

import AuthToolbar from './components/auth/auth-toolbar';
import DataStoreHealthStatus from './components/data-store-health-status';
import StardustDemo from './components/ui/backgrounds/stardust';

export default function Home(): JSX.Element {
  return (
    <>
      <AuthToolbar />
      <StardustDemo />
      <DataStoreHealthStatus />
    </>
  );
}
