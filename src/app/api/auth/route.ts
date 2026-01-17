import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';

// Rate limiting: 5 attempts per 15 minutes per IP
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

// In-memory store for rate limiting (resets on server restart)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Clean up expired entries periodically
function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [ip, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}

// Check rate limit and return true if allowed
function checkRateLimit(ip: string): { allowed: boolean; remainingAttempts: number; resetTime: number } {
  const now = Date.now();

  // Cleanup old entries
  cleanupRateLimitStore();

  const existing = rateLimitStore.get(ip);

  if (!existing || now > existing.resetTime) {
    // First attempt or window expired - start fresh
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS - 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
  }

  if (existing.count >= MAX_ATTEMPTS) {
    // Rate limited
    return { allowed: false, remainingAttempts: 0, resetTime: existing.resetTime };
  }

  // Increment count
  existing.count++;
  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - existing.count, resetTime: existing.resetTime };
}

// Get client IP from request headers
function getClientIp(headersList: Headers): string {
  // Check common proxy headers
  const xForwardedFor = headersList.get('x-forwarded-for');
  if (xForwardedFor) {
    // Take the first IP if there are multiple
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIp = headersList.get('x-real-ip');
  if (xRealIp) {
    return xRealIp;
  }

  // Fallback
  return 'unknown';
}

export async function POST(request: Request) {
  try {
    const headersList = await headers();
    const clientIp = getClientIp(headersList);

    // Check rate limit
    const rateLimit = checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
          },
        }
      );
    }

    const { secret } = await request.json();
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      console.error('ADMIN_SECRET environment variable not set');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (secret !== adminSecret) {
      return NextResponse.json(
        { success: false, error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Set auth cookie
    const cookieStore = await cookies();
    cookieStore.set('admin-auth', secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  // Logout - clear the cookie
  const cookieStore = await cookies();
  cookieStore.delete('admin-auth');

  return NextResponse.json({ success: true });
}
