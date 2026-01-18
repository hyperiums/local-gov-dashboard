import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock must be defined before any imports that use it
vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn(() => ({ type: 'next' })),
    redirect: vi.fn((url: URL) => ({ type: 'redirect', url })),
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      type: 'json',
      body,
      status: init?.status
    })),
  },
}));

// Import after mocking
import { middleware, config, PROTECTED_ROUTES } from '@/middleware';
import { NextResponse } from 'next/server';

interface MockRequestOptions {
  pathname: string;
  cookie?: string;
  authHeader?: string;
}

interface MockCookieValue {
  value: string;
}

interface MockRequest {
  nextUrl: { pathname: string };
  url: string;
  cookies: {
    get: (name: string) => MockCookieValue | undefined;
  };
  headers: {
    get: (name: string) => string | null;
  };
}

function createMockRequest(options: MockRequestOptions): MockRequest {
  return {
    nextUrl: { pathname: options.pathname },
    url: 'http://localhost:3000' + options.pathname,
    cookies: {
      get: (name: string) =>
        name === 'admin-auth' && options.cookie
          ? { value: options.cookie }
          : undefined,
    },
    headers: {
      get: (name: string) =>
        name === 'Authorization' ? (options.authHeader ?? null) : null,
    },
  };
}

describe('Auth Middleware', () => {
  const VALID_SECRET = 'test-secret-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('when ADMIN_SECRET is not configured', () => {
    beforeEach(() => {
      vi.stubEnv('ADMIN_SECRET', '');
      // Also delete it to simulate truly missing
      delete process.env.ADMIN_SECRET;
    });

    it('should return 500 for protected API routes', () => {
      const request = createMockRequest({ pathname: '/api/scrape' });
      middleware(request as never);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('configuration') }),
        expect.objectContaining({ status: 500 })
      );
    });

    it('should redirect to login with error for protected pages', () => {
      const request = createMockRequest({ pathname: '/admin' });
      middleware(request as never);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0];
      const url = redirectCall[0] as URL;
      expect(url.searchParams.get('error')).toBe('config');
    });

    it('should NOT allow access even with matching undefined cookie', () => {
      // This is the critical bug - undefined === undefined was passing
      const request = createMockRequest({
        pathname: '/api/scrape',
        cookie: undefined,
      });
      middleware(request as never);

      // Should fail with 500 (config error), NOT allow access
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('configuration') }),
        expect.objectContaining({ status: 500 })
      );
      expect(NextResponse.next).not.toHaveBeenCalled();
    });
  });

  describe('when ADMIN_SECRET is configured', () => {
    beforeEach(() => {
      vi.stubEnv('ADMIN_SECRET', VALID_SECRET);
    });

    describe('protected API routes', () => {
      it('should return 401 without authentication', () => {
        const request = createMockRequest({ pathname: '/api/scrape' });
        middleware(request as never);

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({ error: 'Unauthorized' }),
          expect.objectContaining({ status: 401 })
        );
      });

      it('should allow access with valid Bearer token', () => {
        const request = createMockRequest({
          pathname: '/api/scrape',
          authHeader: `Bearer ${VALID_SECRET}`,
        });
        middleware(request as never);

        expect(NextResponse.next).toHaveBeenCalled();
      });

      it('should allow access with valid cookie', () => {
        const request = createMockRequest({
          pathname: '/api/scrape',
          cookie: VALID_SECRET,
        });
        middleware(request as never);

        expect(NextResponse.next).toHaveBeenCalled();
      });

      it('should return 401 with invalid Bearer token', () => {
        const request = createMockRequest({
          pathname: '/api/scrape',
          authHeader: 'Bearer wrong-secret',
        });
        middleware(request as never);

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({ error: 'Unauthorized' }),
          expect.objectContaining({ status: 401 })
        );
      });

      it('should protect /api/summarize routes', () => {
        const request = createMockRequest({ pathname: '/api/summarize' });
        middleware(request as never);

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({ error: 'Unauthorized' }),
          expect.objectContaining({ status: 401 })
        );
      });

      it('should protect /api/upload-strategic-plan routes', () => {
        const request = createMockRequest({ pathname: '/api/upload-strategic-plan' });
        middleware(request as never);

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({ error: 'Unauthorized' }),
          expect.objectContaining({ status: 401 })
        );
      });
    });

    describe('protected page routes', () => {
      it('should redirect to login without cookie', () => {
        const request = createMockRequest({ pathname: '/admin' });
        middleware(request as never);

        expect(NextResponse.redirect).toHaveBeenCalled();
        const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0];
        const url = redirectCall[0] as URL;
        expect(url.pathname).toBe('/login');
        expect(url.searchParams.get('redirect')).toBe('/admin');
      });

      it('should allow access with valid cookie', () => {
        const request = createMockRequest({
          pathname: '/admin',
          cookie: VALID_SECRET,
        });
        middleware(request as never);

        expect(NextResponse.next).toHaveBeenCalled();
      });

      it('should redirect to login with invalid cookie', () => {
        const request = createMockRequest({
          pathname: '/admin',
          cookie: 'wrong-secret',
        });
        middleware(request as never);

        expect(NextResponse.redirect).toHaveBeenCalled();
        const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0];
        const url = redirectCall[0] as URL;
        expect(url.pathname).toBe('/login');
      });

      it('should protect nested admin routes', () => {
        const request = createMockRequest({ pathname: '/admin/settings' });
        middleware(request as never);

        expect(NextResponse.redirect).toHaveBeenCalled();
        const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0];
        const url = redirectCall[0] as URL;
        expect(url.pathname).toBe('/login');
        expect(url.searchParams.get('redirect')).toBe('/admin/settings');
      });
    });

    describe('unprotected routes', () => {
      it('should allow access to public routes', () => {
        const request = createMockRequest({ pathname: '/' });
        middleware(request as never);

        expect(NextResponse.next).toHaveBeenCalled();
      });

      it('should allow access to public API routes', () => {
        const request = createMockRequest({ pathname: '/api/data' });
        middleware(request as never);

        expect(NextResponse.next).toHaveBeenCalled();
      });

      it('should allow access to login page', () => {
        const request = createMockRequest({ pathname: '/login' });
        middleware(request as never);

        expect(NextResponse.next).toHaveBeenCalled();
      });
    });
  });
});

describe('config.matcher', () => {
  it('includes all protected routes with wildcards', () => {
    // Verify each protected route has a corresponding matcher entry
    for (const route of PROTECTED_ROUTES) {
      expect(config.matcher).toContain(`${route}/:path*`);
    }
  });

  it('has no extra routes beyond protected routes', () => {
    // Matcher should have exactly one entry per protected route
    expect(config.matcher).toHaveLength(PROTECTED_ROUTES.length);
  });
});
