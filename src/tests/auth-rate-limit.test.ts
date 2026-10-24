import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Only the success path touches cookies, and these tests never log in; the mock
// keeps the handler off Next's request scope all the same.
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: vi.fn(), delete: vi.fn() })),
}));

function loginRequest(realIp: string, forwardedFor: string): Request {
  return new Request('http://localhost/api/auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': realIp,
      'x-forwarded-for': forwardedFor,
    },
    body: JSON.stringify({ secret: 'not-the-admin-secret' }),
  });
}

describe('POST /api/auth rate limit', () => {
  // The limiter's Map lives at module level; a fresh import gives each test an empty one.
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ADMIN_SECRET', 'test-admin-secret-0123456789');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('limits one X-Real-IP to 5 attempts in 15 minutes however X-Forwarded-For changes', async () => {
    const { POST } = await import('@/app/api/auth/route');

    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await POST(loginRequest('203.0.113.20', `198.51.100.${attempt}`));
      expect(res.status, `attempt ${attempt}`).toBe(401);
    }

    const limited = await POST(loginRequest('203.0.113.20', '198.51.100.6'));
    expect(limited.status).toBe(429);
    const retryAfter = Number(limited.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900);

    const otherClient = await POST(loginRequest('203.0.113.21', '198.51.100.7'));
    expect(otherClient.status).toBe(401);
  });
});
