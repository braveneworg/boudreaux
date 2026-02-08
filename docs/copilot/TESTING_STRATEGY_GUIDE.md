# Testing Strategy & Guidelines

## Overview

This document outlines the testing strategy, guidelines, and best practices for the Boudreaux project. Our goal is to maintain high code quality through comprehensive automated testing with a minimum coverage threshold of 95%.

## Test Framework Stack

- **Vitest**: Modern, fast test runner with native ESM support
- **@testing-library/react**: React component testing utilities
- **@testing-library/user-event**: User interaction simulation
- **MSW (Mock Service Worker)**: API mocking (planned)

## Coverage Requirements

| Metric     | Minimum | Target |
| ---------- | ------- | ------ |
| Statements | 95%     | 98%    |
| Branches   | 90%     | 95%    |
| Functions  | 95%     | 98%    |
| Lines      | 95%     | 98%    |

## Directory Structure

```
src/
├── app/
│   ├── components/
│   │   └── *.spec.tsx       # Component tests
│   ├── hooks/
│   │   └── *.spec.ts        # Hook tests
│   └── api/
│       └── **/route.spec.ts # API route tests
├── lib/
│   ├── actions/
│   │   └── *.spec.ts        # Server action tests
│   ├── services/
│   │   └── *.spec.ts        # Service tests
│   └── utils/
│       └── *.spec.ts        # Utility tests
```

## Test File Naming Conventions

- Use `.spec.ts` for TypeScript tests
- Use `.spec.tsx` for React component tests
- Place test files next to the code they test
- Example: `button.tsx` → `button.spec.tsx`

## Writing Effective Tests

### 1. Component Tests

```tsx
// Good: Descriptive test with clear arrangement
describe('TrackPlayButton', () => {
  describe('rendering', () => {
    it('should render play button when audioUrl is provided', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button', { name: /play/i });
      expect(button).toBeInTheDocument();
    });
  });
});
```

### 2. Hook Tests

```typescript
// Good: Test hook behavior with proper wrapper
describe('useInfiniteTracksQuery', () => {
  it('should fetch first page of tracks on mount', async () => {
    const { result } = renderHook(() => useInfiniteTracksQuery(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.tracks).toHaveLength(2);
  });
});
```

### 3. Server Action Tests

```typescript
// Good: Mock dependencies and test all branches
describe('updateTrackAudioAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession);
    mockRequireRole.mockResolvedValue();
  });

  it('should require admin role', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    await expect(updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED')).rejects.toThrow(
      'Unauthorized'
    );
  });
});
```

### 4. API Route Tests

```typescript
// Good: Test HTTP semantics properly
describe('GET /api/tracks', () => {
  it('should return 503 when database is unavailable', async () => {
    vi.mocked(TrackService.getTracks).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
    });

    const request = new NextRequest('http://localhost:3000/api/tracks');
    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Database unavailable' });
  });
});
```

## Mocking Best Practices

### 1. Mock at the Boundary

Mock external dependencies (database, APIs) not internal modules:

```typescript
// Good: Mock at the service boundary
vi.mock('@/lib/services/track-service', () => ({
  TrackService: {
    getTracks: vi.fn(),
    createTrack: vi.fn(),
  },
}));

// Avoid: Mocking internal implementation details
```

### 2. Use Factory Functions for Mock Data

```typescript
// Good: Reusable mock factory
function createMockTrack(overrides?: Partial<Track>): Track {
  return {
    id: 'track-123',
    title: 'Test Track',
    duration: 180,
    ...overrides,
  };
}
```

### 3. Clean Up Mocks Between Tests

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

## Common Testing Patterns

### Testing Async Operations

```typescript
// Good: Use waitFor for async assertions
await waitFor(() => {
  expect(result.current.isSuccess).toBe(true);
});

// Good: Use act for state updates
act(() => {
  mockAudioElement.dispatchMockEvent('play');
});
```

### Testing User Interactions

```typescript
// Good: Use userEvent for realistic interactions
const user = userEvent.setup();
await user.click(button);
await user.type(input, 'test text');
```

### Testing Error States

```typescript
// Good: Test error handling explicitly
it('should handle errors gracefully', async () => {
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  mockService.mockRejectedValue(new Error('Network error'));

  const result = await action();

  expect(result.success).toBe(false);
  expect(consoleSpy).toHaveBeenCalled();

  consoleSpy.mockRestore();
});
```

## Test Organization

### Use Describe Blocks for Logical Grouping

```typescript
describe('TrackService', () => {
  describe('createTrack', () => {
    it('should create track successfully', () => {});
    it('should handle duplicate titles', () => {});
  });

  describe('getTrackById', () => {
    it('should return track when found', () => {});
    it('should return error when not found', () => {});
  });
});
```

### Test All Edge Cases

- Valid inputs
- Invalid/missing inputs
- Boundary conditions
- Error states
- Loading states
- Empty states

## Performance Considerations

1. **Use `pool: 'vmThreads'`** for faster local testing
2. **Minimize mock setup** by using factory functions
3. **Avoid unnecessary renders** - test component behavior, not implementation
4. **Parallel test execution** is enabled by default

## CI/CD Integration

### GitHub Actions Workflow

The project includes automated testing in CI:

```yaml
# .github/workflows/ci.yml includes:
- Lint checks
- Type checking
- Test execution
- Coverage reporting
- Coverage threshold enforcement
```

### Coverage Reporting

Coverage reports are generated in multiple formats:

- HTML report: `coverage/index.html`
- JSON report: `coverage/coverage-final.json`
- LCOV report: `coverage/lcov.info`

## Debugging Tests

### Run Specific Test File

```bash
npx vitest run src/path/to/file.spec.ts
```

### Run Tests in Watch Mode

```bash
npx vitest src/path/to/file.spec.ts
```

### Run with Verbose Output

```bash
npx vitest run --reporter=verbose
```

### Debug with UI

```bash
npx vitest --ui
```

## Common Issues and Solutions

### 1. "server-only" Import Error

```typescript
// Solution: Mock server-only at the top of test file
vi.mock('server-only', () => ({}));
```

### 2. NextResponse Mock Issues

```typescript
// Solution: setupTests.ts includes mock already
// For custom handling:
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      json: async () => data,
      status: init?.status || 200,
    })),
  },
}));
```

### 3. Audio API Not Available

```typescript
// Solution: Create class-based mock
class MockAudio {
  src = '';
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}
global.Audio = MockAudio as unknown as typeof Audio;
```

## Recent Test Additions (February 2026)

### New Test Files Created

1. **track-play-button.spec.tsx** (34 tests)
   - Audio initialization
   - Playback controls
   - Multiple instance coordination
   - Loading/error states

2. **use-infinite-tracks-query.spec.ts** (15 tests)
   - Initial fetch
   - Data transformation
   - Pagination
   - Error handling

3. **update-track-audio-action.spec.ts** (23 tests)
   - Authorization
   - Track validation
   - Success/failure updates
   - Error handling

4. **route.spec.ts** (19 tests)
   - GET endpoint pagination
   - POST endpoint validation
   - Error responses
   - HTTP status codes

5. **track-service.spec.ts** (updated with 5 new tests)
   - getTracksCount method tests

### Coverage Achievements

| File                         | Statements | Branches | Functions | Lines |
| ---------------------------- | ---------- | -------- | --------- | ----- |
| track-play-button.tsx        | 98.48%     | 96.96%   | 100%      | 100%  |
| use-infinite-tracks-query.ts | 100%       | 100%     | 100%      | 100%  |
| update-track-audio-action.ts | 100%       | 100%     | 100%      | 100%  |
| track-service.ts             | 100%       | 100%     | 100%      | 100%  |
| api/tracks/route.ts          | 100%       | 100%     | 100%      | 100%  |

## Future Improvements

1. **Integration Tests**: Add end-to-end tests with Playwright
2. **Visual Regression**: Add Storybook + Chromatic
3. **Performance Tests**: Add load testing for API endpoints
4. **Mutation Testing**: Add Stryker for test quality validation
5. **Contract Testing**: Add Pact for API contract testing

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Docs](https://testing-library.com/)
- [React Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
