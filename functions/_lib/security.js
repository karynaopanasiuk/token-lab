// Заголовки безпеки для відповідей, які віддає функція (/p/:id). Для статичних файлів те саме
// лежить у public/_headers: _headers не діє на відповіді функцій. tests/headers.test.js стежить,
// щоб значення збігалися, а хеш відповідав інлайн-скрипту теми в index.html і 404.html.

// sha256 інлайн-скрипта теми. Змінили скрипт, перерахуйте хеш (тест покаже новий).
export const THEME_SCRIPT_HASH = 'sha256-aHspU/VlP/dJJ4j3fJLw7CxQLdMMwANLB/uhy7zaPv4=';

// style-src-attr 'unsafe-inline' потрібен, бо інтерфейс ставить style="..." у розмітці свотчів і чипів.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' '${THEME_SCRIPT_HASH}'`,
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
