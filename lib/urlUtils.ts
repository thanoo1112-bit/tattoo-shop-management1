/**
 * Sanitizes and validates return URLs for post-login navigation.
 * Guarantees that users are only redirected to internal relative paths within the current origin.
 * Protects against Open Redirect vulnerabilities (rejecting external origins, '//', '/\', '\\', 'http:', 'https:').
 */
export function getSafeReturnUrl(urlParam: string | null | undefined): string {
  if (!urlParam) return '/portal';
  try {
    const decoded = decodeURIComponent(urlParam).trim();
    if (!decoded) return '/portal';

    // Protect against open redirect patterns (protocol-relative or backslash bypasses)
    if (
      decoded.startsWith('//') ||
      decoded.startsWith('/\\') ||
      decoded.startsWith('\\')
    ) {
      return '/portal';
    }

    // Direct internal relative path starting with '/'
    if (decoded.startsWith('/') && !decoded.includes('://')) {
      return decoded;
    }

    // Absolute URL: extract relative path if matching current origin or known app domains
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const parsed = new URL(decoded, baseOrigin);

    if (
      (typeof window !== 'undefined' && parsed.origin === window.location.origin) ||
      parsed.hostname === 'tattoo-shop4-management.vercel.app' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1'
    ) {
      const path = parsed.pathname + parsed.search + parsed.hash;
      if (
        path.startsWith('/') &&
        !path.startsWith('//') &&
        !path.startsWith('/\\') &&
        !path.startsWith('\\')
      ) {
        return path;
      }
    }
  } catch (_) {}
  return '/portal';
}
