import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_PAGE_ROUTES = ['/admin'];
const PROTECTED_API_ROUTES = ['/api/scrape', '/api/summarize', '/api/upload-strategic-plan'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if this is a protected page route
  const isProtectedPage = PROTECTED_PAGE_ROUTES.some(route => pathname.startsWith(route));

  // Check if this is a protected API route
  const isProtectedApi = PROTECTED_API_ROUTES.some(route => pathname.startsWith(route));

  if (isProtectedPage) {
    // For pages, check for auth cookie
    const authCookie = request.cookies.get('admin-auth');
    const secret = process.env.ADMIN_SECRET;

    if (!authCookie || authCookie.value !== secret) {
      // Redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (isProtectedApi) {
    // For APIs, check Authorization header OR cookie (for browser-based admin calls)
    const authHeader = request.headers.get('Authorization');
    const authCookie = request.cookies.get('admin-auth');
    const secret = process.env.ADMIN_SECRET;

    const headerValid = authHeader === `Bearer ${secret}`;
    const cookieValid = authCookie?.value === secret;

    if (!headerValid && !cookieValid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Valid authentication required' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protected pages
    '/admin/:path*',
    // Protected API routes
    '/api/scrape/:path*',
    '/api/summarize/:path*',
    '/api/upload-strategic-plan/:path*',
  ],
};
