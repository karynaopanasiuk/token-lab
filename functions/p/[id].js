// /p/:id віддає той самий index.html, палітру підтягує клієнт через /api/palettes/:id.
export async function onRequestGet({ request, env }) {
  return env.ASSETS.fetch(new Request(new URL('/', request.url), request));
}
