// Mock for next/server to resolve ESM import issues in tests.
// Many route/decorator specs import 'next/server' without a .js extension;
// this provides a minimal implementation that satisfies that usage under Vitest.

// Minimal NextRequest stand-in used by the route/middleware specs.
export class NextRequest {
  constructor(url, options = {}) {
    this.url = url;
    this.nextUrl = new URL(url);
    this.headers = options.headers || new Map();
  }
}

// NextResponse class with basic methods
export class NextResponse {
  static json(data, init = {}) {
    return {
      json: async () => data,
      status: init.status || 200,
      headers: new Map(Object.entries(init.headers || {})),
    };
  }

  static redirect(url, init = {}) {
    return {
      headers: new Map([['Location', url]]),
      status: init.status || 307,
    };
  }
}

const mockServer = {
  NextRequest,
  NextResponse,
};

export default mockServer;
