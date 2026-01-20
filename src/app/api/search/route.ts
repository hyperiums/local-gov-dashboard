import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { search, rebuildSearchIndex, getSearchIndexStats } from '@/lib/search';

export const dynamic = 'force-dynamic';

// Simple in-memory rate limiter
// In production, consider using Redis or a proper rate limiting service
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  // Clean up old entries periodically
  if (rateLimitMap.size > 10000) {
    for (const [key, value] of rateLimitMap) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

// GET /api/search - Search across all content
export async function GET(request: Request) {
  try {
    // Rate limiting
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
    const rateLimit = checkRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const type = searchParams.get('type') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const action = searchParams.get('action');

    // Ensure database is initialized
    getDb();

    // Handle special actions
    if (action === 'stats') {
      const stats = getSearchIndexStats();
      return NextResponse.json({ stats });
    }

    // Validate query
    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    // Limit query length to prevent abuse
    if (query.length > 200) {
      return NextResponse.json(
        { error: 'Query too long (max 200 characters)' },
        { status: 400 }
      );
    }

    // Limit results
    const safeLimit = Math.min(Math.max(1, limit), 100);

    // Validate type filter if provided
    const validTypes = ['meeting', 'ordinance', 'resolution', 'agenda_item'];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const results = search(query, { limit: safeLimit, type });

    return NextResponse.json(
      {
        query,
        results,
      },
      {
        headers: {
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      }
    );
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}

// POST /api/search - Admin actions (rebuild index)
export async function POST(request: Request) {
  try {
    // Check authorization for admin actions
    const authHeader = request.headers.get('Authorization');
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return NextResponse.json(
        { error: 'Server misconfigured: ADMIN_SECRET not set' },
        { status: 500 }
      );
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    if (token !== adminSecret) {
      return NextResponse.json(
        { error: 'Invalid authorization' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'rebuild') {
      const result = rebuildSearchIndex();
      return NextResponse.json({
        success: true,
        message: `Search index rebuilt with ${result.indexed} documents`,
        indexed: result.indexed,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Supported: rebuild' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Search admin error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Operation failed' },
      { status: 500 }
    );
  }
}
