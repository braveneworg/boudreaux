/* eslint-disable @typescript-eslint/no-explicit-any */
 
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'

// Mock server-only package to prevent client component errors
vi.mock('server-only', () => ({}))

// Mock next/server for NextAuth compatibility
vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: vi.fn(() => ({
    json: vi.fn(),
    redirect: vi.fn(),
  })),
  userAgent: vi.fn(),
}))

// Mock NextAuth modules that cause import issues
vi.mock('next-auth', () => ({
  default: vi.fn(),
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  redirect: vi.fn(),
}))

// Mock Next.js Link
vi.mock('next/link', () => {
  const MockLink = ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: any }) => {
    return React.createElement('a', { href, ...props }, children)
  }
  return { default: MockLink }
})

// Mock NextAuth
vi.mock('../../../../auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  auth: vi.fn(),
  default: vi.fn(),
}))

// Mock the relative auth import
vi.mock('../../../auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  auth: vi.fn(),
  default: vi.fn(),
}))

// Mock auth.ts at root level
vi.mock('/Users/cchaos/projects/braveneworg/boudreaux/auth.ts', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  auth: vi.fn(),
  default: vi.fn(),
}))

// Mock Prisma
vi.mock('../app/lib/prisma', () => ({
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

// Mock Turnstile
const mockUseTurnstile = vi.fn(() => ({
  reset: vi.fn(),
}))

vi.mock('react-turnstile', () => {
  const MockTurnstile = ({ onVerify }: { onVerify?: (token: string) => void }) => {
    return React.createElement('div', {
      'data-testid': 'turnstile-widget',
      onClick: () => onVerify?.('test-token')
    }, 'Turnstile Widget')
  }

  return {
    default: MockTurnstile,
    useTurnstile: mockUseTurnstile,
  }
})

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: '',
  },
  writable: true,
})

// Mock environment variables
process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY = 'test-site-key'
process.env.NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY = 'test-site-key'
process.env.DATABASE_URL = 'mongodb://localhost:27017/test'