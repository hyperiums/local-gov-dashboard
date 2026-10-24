import { describe, it, expect } from 'vitest';
import { clientAddress } from '@/lib/client-address';

describe('clientAddress', () => {
  it('prefers X-Real-IP over any X-Forwarded-For', () => {
    const headers = new Headers({
      'x-real-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 192.0.2.44',
    });
    expect(clientAddress(headers)).toBe('203.0.113.7');
  });

  it('uses the last X-Forwarded-For entry when X-Real-IP is absent', () => {
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.1, 192.0.2.44' });
    expect(clientAddress(headers)).toBe('192.0.2.44');
  });

  it('uses a lone X-Forwarded-For entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '192.0.2.44' });
    expect(clientAddress(headers)).toBe('192.0.2.44');
  });

  it('trims whitespace around X-Forwarded-For entries', () => {
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.1 ,   192.0.2.44  ' });
    expect(clientAddress(headers)).toBe('192.0.2.44');
  });

  it('skips empty X-Forwarded-For entries', () => {
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.1, 192.0.2.44, ,' });
    expect(clientAddress(headers)).toBe('192.0.2.44');
  });

  it('falls back to X-Forwarded-For when X-Real-IP is blank', () => {
    const blank = new Headers({ 'x-real-ip': '   ', 'x-forwarded-for': '192.0.2.44' });
    const empty = new Headers({ 'x-real-ip': '', 'x-forwarded-for': '192.0.2.44' });
    expect(clientAddress(blank)).toBe('192.0.2.44');
    expect(clientAddress(empty)).toBe('192.0.2.44');
  });

  it('returns unknown when neither header is present', () => {
    expect(clientAddress(new Headers())).toBe('unknown');
  });

  it('returns unknown when both headers are blank', () => {
    const headers = new Headers({ 'x-real-ip': ' ', 'x-forwarded-for': ' , ' });
    expect(clientAddress(headers)).toBe('unknown');
  });
});
