import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ getDb: vi.fn() }));
vi.mock('@/lib/search', () => ({
  search: vi.fn(() => []),
  rebuildSearchIndex: vi.fn(),
  getSearchIndexStats: vi.fn(),
}));

function searchRequest(realIp: string, forwardedFor: string): Request {
  return new Request('http://localhost/api/search?q=test', {
    headers: { 'x-real-ip': realIp, 'x-forwarded-for': forwardedFor },
  });
}

describe('GET /api/search rate limit', () => {
  // The limiter's Map lives at module level; a fresh import gives each test an empty one.
  beforeEach(() => {
    vi.resetModules();
  });

  it('limits one X-Real-IP to 30 requests a minute however X-Forwarded-For changes', async () => {
    const { GET } = await import('@/app/api/search/route');

    for (let call = 1; call <= 30; call++) {
      const res = await GET(searchRequest('203.0.113.10', `198.51.100.${call}`));
      expect(res.status, `call ${call}`).toBe(200);
    }

    const limited = await GET(searchRequest('203.0.113.10', '198.51.100.31'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');

    const otherClient = await GET(searchRequest('203.0.113.11', '198.51.100.32'));
    expect(otherClient.status).toBe(200);
  });
});
