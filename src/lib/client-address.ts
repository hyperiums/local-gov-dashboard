// The rate limiters key on this. X-Real-IP is trusted because the reverse
// proxy overwrites it with the connecting address, so a client's own value
// never survives. The last X-Forwarded-For entry is the one the proxy
// appended; a client can forge entries before it but never that one. The
// first entry is whatever the client sent, which is why it is never used.
export function clientAddress(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }

  const forwardedEntries = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (forwardedEntries.length > 0) {
    return forwardedEntries[forwardedEntries.length - 1];
  }

  // Callers with neither header (host-local requests straight to the
  // container) share one key, as they always have.
  return 'unknown';
}
