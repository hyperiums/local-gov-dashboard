import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for ADMIN_SECRET startup validation.
 *
 * The actual instrumentation.ts runs at Next.js boot time and checks
 * NEXT_RUNTIME === 'nodejs'. These tests verify the validation logic
 * by simulating that environment.
 */

describe('ADMIN_SECRET startup validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to get fresh import of instrumentation
    vi.resetModules();
    // Clone env to avoid pollution between tests
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when ADMIN_SECRET is not set', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.ADMIN_SECRET;

    const { register } = await import('../instrumentation');

    await expect(register()).rejects.toThrow(
      'ADMIN_SECRET environment variable is required but not set'
    );
  });

  it('throws when ADMIN_SECRET is empty string', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    process.env.ADMIN_SECRET = '';

    const { register } = await import('../instrumentation');

    await expect(register()).rejects.toThrow(
      'ADMIN_SECRET environment variable is required but not set'
    );
  });

  it('throws when ADMIN_SECRET is too short', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    process.env.ADMIN_SECRET = 'tooshort';

    const { register } = await import('../instrumentation');

    await expect(register()).rejects.toThrow(
      'ADMIN_SECRET must be at least 16 characters (got 8)'
    );
  });

  it('throws when ADMIN_SECRET is exactly 15 characters', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    process.env.ADMIN_SECRET = '123456789012345'; // 15 chars

    const { register } = await import('../instrumentation');

    await expect(register()).rejects.toThrow(
      'ADMIN_SECRET must be at least 16 characters (got 15)'
    );
  });

  it('succeeds when ADMIN_SECRET is exactly 16 characters', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    process.env.ADMIN_SECRET = '1234567890123456'; // 16 chars

    const { register } = await import('../instrumentation');

    await expect(register()).resolves.toBeUndefined();
  });

  it('succeeds when ADMIN_SECRET is longer than 16 characters', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    process.env.ADMIN_SECRET = 'this-is-a-very-long-and-secure-secret-key';

    const { register } = await import('../instrumentation');

    await expect(register()).resolves.toBeUndefined();
  });

  it('skips validation when not in nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    delete process.env.ADMIN_SECRET;

    const { register } = await import('../instrumentation');

    // Should not throw even without ADMIN_SECRET
    await expect(register()).resolves.toBeUndefined();
  });

  it('skips validation when NEXT_RUNTIME is not set', async () => {
    delete process.env.NEXT_RUNTIME;
    delete process.env.ADMIN_SECRET;

    const { register } = await import('../instrumentation');

    // Should not throw - only validates in nodejs runtime
    await expect(register()).resolves.toBeUndefined();
  });
});
