// /p/:id віддає той самий index.html, палітру підтягує клієнт через /api/palettes/:id.
// Заголовки з public/_headers на відповіді функцій не поширюються, тому ставимо їх тут.
import { withSecurityHeaders } from '../_lib/security.js';

export async function onRequestGet({ request, env }) {
  return withSecurityHeaders(await env.ASSETS.fetch(new Request(new URL('/', request.url), request)));
}
