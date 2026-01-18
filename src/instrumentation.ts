export async function register() {
  // Only validate on server (not edge runtime or client)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const secret = process.env.ADMIN_SECRET;
    const MIN_LENGTH = 16;

    if (!secret) {
      throw new Error(
        'ADMIN_SECRET environment variable is required but not set'
      );
    }

    if (secret.length < MIN_LENGTH) {
      throw new Error(
        `ADMIN_SECRET must be at least ${MIN_LENGTH} characters (got ${secret.length})`
      );
    }
  }
}
