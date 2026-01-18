import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protected routes are defined here for runtime auth logic (using startsWith).
// These same routes appear in config.matcher below with "/:path*" suffixes,
// which is Next.js syntax telling it which requests to run middleware on.
// Next.js requires config.matcher to be a static array, so we can't derive it
// from these constants. Tests verify the two definitions stay in sync.
const PROTECTED_PAGE_ROUTES = ['/admin'];
const PROTECTED_API_ROUTES = ['/api/scrape', '/api/summarize', '/api/upload-strategic-plan'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedPage = PROTECTED_PAGE_ROUTES.some(route => pathname.startsWith(route));
  const isProtectedApi = PROTECTED_API_ROUTES.some(route => pathname.startsWith(route));

  // Early exit for unprotected routes
  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  // Get secret once - fail closed if not configured
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error('ADMIN_SECRET environment variable not set');
    if (isProtectedApi) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'config');
    return NextResponse.redirect(loginUrl);
  }

  // Get auth credentials once
  const authCookie = request.cookies.get('admin-auth');
  const cookieValid = authCookie?.value === secret;

  if (isProtectedPage) {
    if (!cookieValid) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (isProtectedApi) {
    const authHeader = request.headers.get('Authorization');
    const headerValid = authHeader === `Bearer ${secret}`;

    if (!headerValid && !cookieValid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Valid authentication required' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

// See comment at top of file explaining relationship to route constants above
export const config = {
  matcher: [
    '/admin/:path*',
    '/api/scrape/:path*',
    '/api/summarize/:path*',
    '/api/upload-strategic-plan/:path*',
  ],
};

// Exported for testing - verifies config.matcher stays in sync
export const PROTECTED_ROUTES = [...PROTECTED_PAGE_ROUTES, ...PROTECTED_API_ROUTES];
